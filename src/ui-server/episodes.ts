import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { SceneVisualsSchema } from '../schema/sceneVisuals.js';
import { EpisodeSchema } from '../schema/episode.js';
import { buildNarrationTimeline } from '../audio/narration-timeline.js';
import { resolveSelectedAudio } from '../lib/selectedAssets.js';
import { assetFlags, collectAssets } from './assets.js';
import { deleteEpisodeAssets } from './deleteEpisodeAssets.js';
import { loadAudioPlan, normalizeAudioPlan } from '../audio/sound-director.js';
import {
  productionReportPath,
  writeProductionReport,
  type ProductionReport
} from '../lib/productionCost.js';
import { episodesDir, reviewsDir } from './paths.js';
import { DEFAULT_BRAND_ID, currentBrandId } from '../lib/brands.js';
import type { ClaimVerdict, EpisodeReview, EpisodeSummary, PhaseApprovals, SelectedAssets } from './types.js';
import {
  assertAssetBelongsToEpisode,
  assertExternalVideoPath
} from '../lib/episodeAssetGuard.js';

const ClaimVerdictSchema = z.enum(['unchecked', 'supported', 'unsupported', 'needs-source']);

const PhaseApprovalsSchema = z.object({
  script: z.boolean(),
  tts: z.boolean(),
  images: z.boolean()
});

const SelectedAssetsSchema = z
  .object({
    sceneVisuals: SceneVisualsSchema.optional(),
    burnSubtitles: z.boolean().optional(),
    audio: z.string().min(1).optional(),
    images: z.record(z.string(), z.string().min(1)).optional(),
    clips: z.record(z.string(), z.string().min(1)).optional(),
    final: z.string().min(1).optional(),
    externalVideo: z.string().min(1).optional()
  })
  .default({});

const EpisodeReviewSchema = z.object({
  episodeFile: z.string().min(1),
  episodeId: z.string().min(1),
  claimVerdicts: z.record(z.string(), ClaimVerdictSchema),
  approvals: PhaseApprovalsSchema,
  selected: SelectedAssetsSchema,
  approvedForProduction: z.boolean(),
  reviewerNotes: z.string(),
  updatedAt: z.string().min(1)
});

type EpisodeJson = {
  id: string;
  brandId?: string;
  storyKind: string;
  topic: string;
  titleHi: string;
  titleEn: string;
  targetDurationSeconds: number;
  sourceReview: {
    status: string;
    claimsToVerify: string[];
    notes: string[];
  };
  scenes: Array<{
    id: number;
    startSecond: number;
    durationSeconds: number;
    renderMode: string;
  }>;
  audioPlan?: {
    bgmMood: string;
    sfx: Array<{ time: number; effect: string; volume: number; reason: string }>;
    timingSource?: string | undefined;
    narrationDurationSeconds?: number | undefined;
    bgmTrack?: string | undefined;
    sfxUsage?:
      | {
          local: number;
          elevenlabs: number;
          cues: Array<{ effect: string; source: string; file: string }>;
        }
      | undefined;
  };
};

function isEpisodeFilename(name: string): boolean {
  return name.endsWith('.json') && !name.startsWith('.');
}

function reviewPathFor(file: string): string {
  return path.join(reviewsDir(), `${file.replace(/\.json$/i, '')}.review.json`);
}

function emptyApprovals(): PhaseApprovals {
  return { script: false, tts: false, images: false };
}

function emptySelected(): SelectedAssets {
  return {};
}

export function scriptClaimsReady(
  episode: Pick<EpisodeJson, 'storyKind' | 'sourceReview'>,
  verdicts: Record<string, ClaimVerdict>
): { ready: boolean; unresolved: number } {
  if (episode.storyKind === 'ORIGINAL_MYTH_FICTION') return { ready: true, unresolved: 0 };
  const unresolved = episode.sourceReview.claimsToVerify.reduce(
    (count, _claim, index) => count + (verdicts[String(index)] === 'supported' ? 0 : 1),
    0
  );
  return { ready: unresolved === 0, unresolved };
}

function selectedMapChanged(
  before?: Record<string, string>,
  after?: Record<string, string>
): boolean {
  return JSON.stringify(before || {}) !== JSON.stringify(after || {});
}

async function markProductionStale(episodeId: string, reason: string): Promise<void> {
  try {
    const report = JSON.parse(await readFile(productionReportPath(episodeId), 'utf8')) as ProductionReport;
    await writeProductionReport({
      ...report,
      reviewStatus: 'PENDING',
      staleReason: reason
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}

function normalizeSelected(raw: unknown): SelectedAssets {
  if (!raw || typeof raw !== 'object') return emptySelected();
  const value = raw as Record<string, unknown>;
  const selected: SelectedAssets = {};
  if (value.sceneVisuals !== undefined) selected.sceneVisuals = SceneVisualsSchema.parse(value.sceneVisuals);
  if (typeof value.burnSubtitles === 'boolean') selected.burnSubtitles = value.burnSubtitles;
  if (typeof value.audio === 'string' && value.audio.trim()) {
    selected.audio = value.audio.trim();
  }
  if (value.images && typeof value.images === 'object') {
    const images: Record<string, string> = {};
    for (const [key, pathValue] of Object.entries(value.images as Record<string, unknown>)) {
      if (typeof pathValue === 'string' && pathValue.trim()) images[key] = pathValue.trim();
    }
    if (Object.keys(images).length) selected.images = images;
  }
  if (value.clips && typeof value.clips === 'object') {
    const clips: Record<string, string> = {};
    for (const [key, pathValue] of Object.entries(value.clips as Record<string, unknown>)) {
      if (typeof pathValue === 'string' && pathValue.trim()) clips[key] = pathValue.trim();
    }
    if (Object.keys(clips).length) selected.clips = clips;
  }
  if (typeof value.final === 'string' && value.final.trim()) {
    selected.final = value.final.trim();
  }
  if (typeof value.externalVideo === 'string' && value.externalVideo.trim()) {
    selected.externalVideo = value.externalVideo.trim();
  }
  return selected;
}

function normalizeReview(raw: unknown, file: string): EpisodeReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const approvalsRaw = value.approvals;
  const approvals =
    approvalsRaw && typeof approvalsRaw === 'object'
      ? PhaseApprovalsSchema.parse({
          script: Boolean((approvalsRaw as PhaseApprovals).script),
          tts: Boolean((approvalsRaw as PhaseApprovals).tts),
          images: Boolean((approvalsRaw as PhaseApprovals).images)
        })
      : {
          script: Boolean(value.approvedForProduction),
          tts: false,
          images: false
        };

  const review = {
    episodeFile: String(value.episodeFile || file),
    episodeId: String(value.episodeId || ''),
    claimVerdicts: (value.claimVerdicts || {}) as Record<string, ClaimVerdict>,
    approvals,
    selected: normalizeSelected(value.selected),
    approvedForProduction: approvals.script && approvals.tts && approvals.images,
    reviewerNotes: String(value.reviewerNotes || ''),
    updatedAt: String(value.updatedAt || new Date().toISOString())
  };
  return EpisodeReviewSchema.parse(review);
}

export async function loadReview(file: string): Promise<EpisodeReview | null> {
  try {
    const raw = JSON.parse(await readFile(reviewPathFor(file), 'utf8')) as unknown;
    return normalizeReview(raw, file);
  } catch {
    return null;
  }
}

export async function saveReview(input: {
  episodeFile: string;
  episodeId: string;
  claimVerdicts: Record<string, ClaimVerdict>;
  approvals: PhaseApprovals;
  selected?: SelectedAssets;
  reviewerNotes: string;
}): Promise<EpisodeReview> {
  await mkdir(reviewsDir(), { recursive: true });
  const approvals = PhaseApprovalsSchema.parse(input.approvals);
  const previous = await loadReview(input.episodeFile);
  const episode = await readEpisodeFile(input.episodeFile);
  if (episode.id !== input.episodeId) {
    throw new Error('Episode id does not match the selected script file');
  }
  if (approvals.script && !previous?.approvals.script) {
    const claimState = scriptClaimsReady(episode, input.claimVerdicts);
    if (!claimState.ready) {
      throw new Error(
        `Script approval blocked: ${claimState.unresolved} claim${claimState.unresolved === 1 ? '' : 's'} still need a Supported verdict.`
      );
    }
  }
  const selected = normalizeSelected(input.selected ?? previous?.selected ?? {});
  const validVisualIds = new Set(['0', '-1', ...episode.scenes.map((scene) => String(scene.id))]);
  for (const key of Object.keys(selected.sceneVisuals || {})) {
    if (!validVisualIds.has(key)) throw new Error(`Unknown visual section: ${key}`);
  }
  if (selected.audio) {
    assertAssetBelongsToEpisode(selected.audio, input.episodeId, 'Selected audio');
  }
  if (selected.final) {
    assertAssetBelongsToEpisode(selected.final, input.episodeId, 'Selected final video');
  }
  if (selected.externalVideo) {
    assertExternalVideoPath(selected.externalVideo, input.episodeId);
  }
  if (selected.images) {
    for (const [sceneId, imagePath] of Object.entries(selected.images)) {
      assertAssetBelongsToEpisode(imagePath, input.episodeId, `Selected image (scene ${sceneId})`);
    }
  }
  if (selected.clips) {
    for (const [sceneId, clipPath] of Object.entries(selected.clips)) {
      const normalized = clipPath.split('\\').join('/');
      // Legacy wan/ shared drive clips may omit episode id — skip hard fail for those only.
      if (normalized.includes('/wan/') && !normalized.includes(input.episodeId)) continue;
      assertAssetBelongsToEpisode(clipPath, input.episodeId, `Selected clip (scene ${sceneId})`);
    }
  }
  if (previous) {
    if (selectedMapChanged(previous.selected.clips, selected.clips) ||
        JSON.stringify(previous.selected.sceneVisuals || {}) !== JSON.stringify(selected.sceneVisuals || {}) ||
        previous.selected.burnSubtitles !== selected.burnSubtitles) {
      await markProductionStale(input.episodeId, 'Visual plan, clips or subtitles changed — rebuild the final video');
    } else if (previous.selected.audio && previous.selected.audio !== selected.audio) {
      await markProductionStale(input.episodeId, 'Voice selection changed — rebuild the final video');
    } else if (
      previous.selected.images &&
      selectedMapChanged(previous.selected.images, selected.images)
    ) {
      await markProductionStale(input.episodeId, 'Scene image selection changed — rebuild the final video');
    } else if (
      previous.selected.externalVideo &&
      previous.selected.externalVideo !== selected.externalVideo
    ) {
      await markProductionStale(input.episodeId, 'External video changed — remux the final Short');
    }
  }
  const review: EpisodeReview = {
    episodeFile: input.episodeFile,
    episodeId: input.episodeId,
    claimVerdicts: input.claimVerdicts,
    approvals,
    selected,
    approvedForProduction: approvals.script && approvals.tts && approvals.images,
    reviewerNotes: input.reviewerNotes,
    updatedAt: new Date().toISOString()
  };
  EpisodeReviewSchema.parse({
    ...review,
    selected: SelectedAssetsSchema.parse(selected)
  });
  const target = reviewPathFor(input.episodeFile);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await rename(temp, target);
  return review;
}

export function defaultReview(file: string, episodeId: string): EpisodeReview {
  return {
    episodeFile: file,
    episodeId,
    claimVerdicts: {},
    approvals: emptyApprovals(),
    selected: emptySelected(),
    approvedForProduction: false,
    reviewerNotes: '',
    updatedAt: new Date().toISOString()
  };
}

async function readEpisodeFile(file: string): Promise<EpisodeJson> {
  const absolute = path.join(episodesDir(), file);
  return JSON.parse(await readFile(absolute, 'utf8')) as EpisodeJson;
}

export async function listEpisodes(): Promise<EpisodeSummary[]> {
  const dir = episodesDir();
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter(isEpisodeFilename);
  } catch {
    return [];
  }

  const summaries: EpisodeSummary[] = [];
  for (const file of names) {
    try {
      const absolute = path.join(dir, file);
      const info = await stat(absolute);
      const episode = await readEpisodeFile(file);
      const episodeBrand = episode.brandId || DEFAULT_BRAND_ID;
      if (episodeBrand !== currentBrandId()) continue;
      const assets = await assetFlags(episode.id);
      const review = await loadReview(file);
      summaries.push({
        file,
        id: episode.id,
        titleEn: episode.titleEn,
        titleHi: episode.titleHi,
        topic: episode.topic,
        storyKind: episode.storyKind,
        reviewStatus: episode.sourceReview.status,
        targetDurationSeconds: episode.targetDurationSeconds,
        sceneCount: episode.scenes.length,
        paidMotionScenes: episode.scenes.filter((scene) => scene.renderMode === 'AI_VIDEO').length,
        claimsCount: episode.sourceReview.claimsToVerify.length,
        mtimeMs: info.mtimeMs,
        assets,
        review
      });
    } catch {
      // Skip unreadable or malformed episode files in the list view.
    }
  }

  return summaries.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function getEpisodeDetail(file: string) {
  if (!isEpisodeFilename(file) || file.includes('/') || file.includes('\\') || file.includes('..')) {
    throw new Error('Invalid episode file');
  }
  const raw = await readEpisodeFile(file);
  const episodeBrand = raw.brandId || DEFAULT_BRAND_ID;
  if (episodeBrand !== currentBrandId()) {
    throw new Error(`Episode belongs to pipeline "${episodeBrand}", not "${currentBrandId()}"`);
  }
  const absolute = path.join(episodesDir(), file);
  const info = await stat(absolute);
  const assets = await collectAssets(raw.id);
  const review = await loadReview(file);

  let episode: EpisodeJson = raw;
  const sidecar = await loadAudioPlan(raw.id);
  if (sidecar) {
    // Sidecar is source of truth for mix metadata (timing, sfxUsage, bgmTrack).
    // Normalize legacy plans for display too, so the UI previews the exact
    // tone/volume-safe cues the mixer will render.
    const duration =
      sidecar.narrationDurationSeconds ||
      raw.scenes.reduce(
        (maximum, scene) => Math.max(maximum, scene.startSecond + scene.durationSeconds),
        0
      );
    const normalized = normalizeAudioPlan(sidecar, duration, {
      ...(sidecar.timingSource ? { timingSource: sidecar.timingSource } : {}),
      ...(sidecar.narrationDurationSeconds !== undefined
        ? { narrationDurationSeconds: sidecar.narrationDurationSeconds }
        : {})
    });
    episode = { ...episode, audioPlan: { ...sidecar, ...normalized } };
  }

  return {
    file,
    mtimeMs: info.mtimeMs,
    episode,
    visualTimeline: (await buildNarrationTimeline(EpisodeSchema.parse(raw), await resolveSelectedAudio(review?.selected))).scenes.map((slot) => ({
      id: slot.kind === 'spokenHook' ? 0 : slot.kind === 'ending' ? -1 : Number(slot.id),
      startSecond: slot.startSecond,
      durationSeconds: slot.durationSeconds
    })),
    assets,
    review
  };
}

export async function deleteEpisode(
  file: string,
  options: { keepAssets?: boolean } = {}
): Promise<{
  ok: true;
  file: string;
  episodeId: string;
  keptAssets: boolean;
  removedAssets: string[];
}> {
  if (!isEpisodeFilename(file) || file.includes('/') || file.includes('\\') || file.includes('..')) {
    throw new Error('Invalid episode file');
  }

  const episode = await readEpisodeFile(file);
  const episodePath = path.join(episodesDir(), file);
  const reviewPath = reviewPathFor(file);
  const keepAssets = options.keepAssets === true;

  if (!keepAssets) {
    const siblingFiles = (await readdir(episodesDir())).filter(
      (name) => isEpisodeFilename(name) && name !== file
    );
    for (const sibling of siblingFiles) {
      try {
        if ((await readEpisodeFile(sibling)).id === episode.id) {
          throw new Error(
            `Cannot delete shared assets: ${sibling} uses the same episode id. Delete the script with “Keep generated assets” enabled, or give the duplicate a unique id first.`
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Cannot delete shared assets')) {
          throw error;
        }
      }
    }
  }

  let removedAssets: string[] = [];
  if (!keepAssets) {
    removedAssets = (await deleteEpisodeAssets(episode.id)).removed;
  }

  try {
    await unlink(episodePath);
  } catch (error) {
    throw new Error(
      `Failed to delete script file: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    await unlink(reviewPath);
  } catch {
    // Review may not exist yet.
  }

  return {
    ok: true,
    file,
    episodeId: episode.id,
    keptAssets: keepAssets,
    removedAssets
  };
}
