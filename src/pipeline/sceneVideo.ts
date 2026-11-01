import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Episode } from '../schema/episode.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import {
  loadReviewSelected,
  resolveOutputPath,
  resolveSelectedAudio,
  toOutputRelative
} from '../lib/selectedAssets.js';
import { sceneMotionNegativePrompt, sceneMotionPrompt } from '../lib/sceneMotionPrompt.js';
import {
  findWanSlot,
  listWanVideoSlots,
  wanSlotMotionNegative,
  wanSlotMotionPrompt,
  type WanVideoSlot
} from '../lib/wanVideoSlots.js';
import {
  resolveVideoProvider,
  sceneVideoPath,
  sceneVideoRelative,
  type VideoGenerationProvider
} from '../providers/videoGeneration.js';
import { ComfyClient, formatComfyJobError } from '../comfy/client.js';
import { resolveWanQualityMode } from '../lib/wanQualityMode.js';
import { buildNarrationTimeline } from '../audio/narration-timeline.js';
import { planWanClipFromNarration } from '../lib/wanTiming.js';

export type SceneVideoStatus =
  | 'not_generated'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'stale';

export type SceneVideoRecord = {
  sceneId: number;
  status: SceneVideoStatus;
  imagePath?: string;
  imageMtimeMs?: number;
  videoPath?: string;
  videoRelative?: string;
  /** ComfyUI /prompt response id — match this in Comfy Queue / History. */
  promptId?: string;
  /** Comfy websocket client id for this run. */
  clientId?: string;
  error?: string;
  /** When EpicAstra started preparing the job (upload / queue). */
  startedAt?: string;
  /** When Comfy accepted the prompt (queue time). */
  queuedAt?: string;
  finishedAt?: string;
  elapsedMs?: number;
  /** 0–100 while generating (Comfy sampler progress). */
  progressPercent?: number;
  progressLabel?: string;
  /** How this clip was sampled: quality (20-step) or fast (LightX2V 4-step). */
  qualityMode?: 'quality' | 'fast';
  /** Narration/TTS seconds used to plan the Wan clip (may be clamped). */
  narrationSeconds?: number;
  /** Actual Wan clip seconds after 4n+1 snap / max-frames clamp. */
  wanDurationSeconds?: number;
};

export type EpisodeVideoState = {
  episodeId: string;
  episodeFile?: string;
  updatedAt: string;
  batch?: {
    mode: 'all' | 'retry' | 'one';
    total: number;
    completed: number;
    failed: number;
    currentSceneId?: number;
    running: boolean;
    /** Overall batch percent including in-flight scene. */
    progressPercent?: number;
  };
  scenes: Record<string, SceneVideoRecord>;
};

function statePath(episodeId: string): string {
  return path.join(path.resolve(process.env.AI_VIDEO_DIR || 'output/ai-video'), episodeId, 'video-state.json');
}

export async function loadEpisodeVideoState(episodeId: string): Promise<EpisodeVideoState> {
  const file = statePath(episodeId);
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as EpisodeVideoState;
    return raw;
  } catch {
    return {
      episodeId,
      updatedAt: new Date().toISOString(),
      scenes: {}
    };
  }
}

export async function saveEpisodeVideoState(state: EpisodeVideoState): Promise<void> {
  const file = statePath(state.episodeId);
  await mkdir(path.dirname(file), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Resolve the still for ONE Wan slot (hook 0, scene N, ending -1).
 * Order: explicit → reviewer selected.images[sceneId] → images/<id>/scene-*.*
 * Never falls back to another scene's file (except ending may use last scene still).
 */
export async function resolveSceneImageForVideo(options: {
  episode: Episode;
  sceneId: number;
  episodeFile?: string;
  explicitImage?: string;
}): Promise<{ absolute: string; relative: string; mtimeMs: number }> {
  const { episode, sceneId } = options;
  const slot = findWanSlot(episode, sceneId);
  if (!slot) {
    throw new Error(`Unknown Wan slot id ${sceneId}`);
  }

  if (options.explicitImage) {
    const absolute = path.resolve(options.explicitImage);
    await access(absolute);
    assertImageBelongsToScene(sceneId, absolute, true);
    const st = await stat(absolute);
    const relative = toOutputRelative(absolute) || absolute;
    return { absolute, relative, mtimeMs: st.mtimeMs };
  }

  if (options.episodeFile) {
    const selected = await loadReviewSelected(path.basename(options.episodeFile));
    const imageKey =
      sceneId === -1
        ? selected?.images?.['-1'] || selected?.images?.[String(episode.scenes.at(-1)?.id)]
        : selected?.images?.[String(sceneId)];
    if (imageKey) {
      const absolute = resolveOutputPath(imageKey);
      if (!absolute) throw new Error(`Invalid selected image for slot ${sceneId}: ${imageKey}`);
      await access(absolute);
      const st = await stat(absolute);
      return { absolute, relative: imageKey, mtimeMs: st.mtimeMs };
    }
  }

  const imagesDir = path.join(imagesRootDir(), episode.id);
  const candidates =
    sceneId === 0
      ? ['scene-hook.png', 'scene-hook.jpg', 'scene-0.png', 'scene-0.jpg', 'scene-0.jpeg', 'scene-0.webp']
      : sceneId === -1
        ? [
            'scene-ending.png',
            'scene-ending.jpg',
            `scene-${episode.scenes.at(-1)?.id}.png`,
            `scene-${episode.scenes.at(-1)?.id}.jpg`
          ]
        : [
            `scene-${sceneId}.png`,
            `scene-${sceneId}.jpg`,
            `scene-${sceneId}.jpeg`,
            `scene-${sceneId}.webp`
          ];

  for (const name of candidates) {
    const absolute = path.join(imagesDir, name);
    try {
      await access(absolute);
      assertImageBelongsToScene(sceneId, absolute, sceneId === -1);
      const st = await stat(absolute);
      const relative = toOutputRelative(absolute) || path.posix.join('images', episode.id, name);
      return { absolute, relative, mtimeMs: st.mtimeMs };
    } catch {
      // try next
    }
  }

  throw new Error(
    sceneId === 0
      ? `Generate the opening hook image first (expected images/${episode.id}/scene-hook.png).`
      : sceneId === -1
        ? `Generate an ending / last-scene still first for Wan ending.`
        : `Generate the scene image first for scene ${sceneId} (expected images/${episode.id}/scene-${sceneId}.png).`
  );
}

/** Safety: basename must match slot unless explicitly selected by id map. */
export function assertImageBelongsToScene(
  sceneId: number,
  imagePath: string,
  allowExplicitMismatch: boolean
): void {
  const base = path.basename(imagePath);
  if (sceneId === 0) {
    if (/scene-hook/i.test(base) || /(?:^|[_\-.])scene-0(?:[_\-.]|$)/i.test(base)) return;
    if (allowExplicitMismatch) return;
    throw new Error(`Image ${base} is not an opening-hook still (scene-hook / scene-0)`);
  }
  if (sceneId === -1) {
    if (/scene-ending/i.test(base) || allowExplicitMismatch) return;
    const match = base.match(/(?:^|[_\-.])scene-(\d+)(?:[_\-.]|$)/i);
    if (match) return; // last-scene still reused for ending
    throw new Error(`Image ${base} is not a valid ending still`);
  }
  const match = base.match(/(?:^|[_\-.])scene-(\d+)(?:[_\-.]|$)/i);
  if (!match) {
    if (allowExplicitMismatch) return;
    throw new Error(`Image ${base} is not a scene-${sceneId} still`);
  }
  const parsed = Number(match[1]);
  if (parsed !== sceneId) {
    throw new Error(
      `Refusing to animate scene ${sceneId} with ${base} (belongs to scene ${parsed})`
    );
  }
}

export function markStaleIfImageChanged(
  record: SceneVideoRecord | undefined,
  imageMtimeMs: number
): SceneVideoStatus {
  if (!record || record.status !== 'completed' || !record.videoPath) return record?.status || 'not_generated';
  if (record.imageMtimeMs !== undefined && imageMtimeMs > record.imageMtimeMs + 1) {
    return 'stale';
  }
  return record.status;
}

export async function buildSceneVideoStatus(
  episode: Episode,
  episodeFile?: string
): Promise<EpisodeVideoState> {
  const state = await loadEpisodeVideoState(episode.id);
  for (const slot of listWanVideoSlots(episode)) {
    const key = String(slot.id);
    const previous = state.scenes[key];
    let imageMtimeMs: number | undefined;
    let imagePath: string | undefined;
    try {
      const img = await resolveSceneImageForVideo({
        episode,
        sceneId: slot.id,
        ...(episodeFile ? { episodeFile } : {})
      });
      imageMtimeMs = img.mtimeMs;
      imagePath = img.relative;
    } catch {
      // no image yet
    }

    const stable = sceneVideoPath(episode.id, slot.id);
    let hasVideo = false;
    try {
      await access(stable);
      hasVideo = true;
    } catch {
      hasVideo = Boolean(previous?.videoPath);
    }

    let status: SceneVideoStatus = previous?.status || (hasVideo ? 'completed' : 'not_generated');
    if (status === 'queued' || status === 'generating') {
      // keep live status
    } else if (hasVideo && imageMtimeMs !== undefined) {
      status = markStaleIfImageChanged(
        {
          sceneId: slot.id,
          status: 'completed',
          ...(previous?.imageMtimeMs !== undefined ? { imageMtimeMs: previous.imageMtimeMs } : {}),
          videoPath: previous?.videoPath || stable
        },
        imageMtimeMs
      );
    } else if (!hasVideo && slot.renderMode === 'AI_VIDEO') {
      status = 'not_generated';
    }

    state.scenes[key] = {
      sceneId: slot.id,
      status,
      ...(imagePath ? { imagePath } : {}),
      ...(imageMtimeMs !== undefined ? { imageMtimeMs } : {}),
      ...(hasVideo
        ? {
            videoPath: previous?.videoPath || stable,
            videoRelative: previous?.videoRelative || sceneVideoRelative(episode.id, slot.id)
          }
        : {}),
      ...(previous?.promptId ? { promptId: previous.promptId } : {}),
      ...(previous?.clientId ? { clientId: previous.clientId } : {}),
      ...(previous?.error ? { error: previous.error } : {}),
      ...(previous?.startedAt ? { startedAt: previous.startedAt } : {}),
      ...(previous?.queuedAt ? { queuedAt: previous.queuedAt } : {}),
      ...(previous?.finishedAt ? { finishedAt: previous.finishedAt } : {}),
      ...(previous?.elapsedMs !== undefined ? { elapsedMs: previous.elapsedMs } : {}),
      ...(previous?.progressPercent !== undefined ? { progressPercent: previous.progressPercent } : {}),
      ...(previous?.progressLabel ? { progressLabel: previous.progressLabel } : {}),
      ...(previous?.qualityMode ? { qualityMode: previous.qualityMode } : {}),
      ...(previous?.narrationSeconds !== undefined
        ? { narrationSeconds: previous.narrationSeconds }
        : {}),
      ...(previous?.wanDurationSeconds !== undefined
        ? { wanDurationSeconds: previous.wanDurationSeconds }
        : {})
    };
  }
  if (episodeFile) state.episodeFile = episodeFile;
  return state;
}

/**
 * Prefer real TTS-aligned length for this Wan slot when selected audio exists.
 * Falls back to the episode JSON planned window.
 */
export async function resolveWanSlotNarrationSeconds(options: {
  episode: Episode;
  sceneId: number;
  episodeFile?: string;
  fallbackSeconds: number;
}): Promise<{ seconds: number; method: 'narration-aligned' | 'scene-planned' }> {
  const fallback =
    Number.isFinite(options.fallbackSeconds) && options.fallbackSeconds > 0
      ? options.fallbackSeconds
      : 5;
  try {
    const selected = options.episodeFile
      ? await loadReviewSelected(path.basename(options.episodeFile))
      : await loadReviewSelected(`${options.episode.id}.json`);
    const audioPath = await resolveSelectedAudio(selected);
    if (!audioPath) {
      return { seconds: fallback, method: 'scene-planned' };
    }
    const timeline = await buildNarrationTimeline(options.episode, audioPath);
    const match = timeline.scenes.find((row) => {
      if (options.sceneId === 0) return row.kind === 'spokenHook';
      if (options.sceneId === -1) return row.kind === 'ending';
      return row.kind === 'scene' && Number(row.id) === options.sceneId;
    });
    if (match?.durationSeconds && match.durationSeconds > 0) {
      return { seconds: match.durationSeconds, method: timeline.method };
    }
  } catch {
    // keep planned
  }
  return { seconds: fallback, method: 'scene-planned' };
}

export type GenerateSceneVideoOptions = {
  episode: Episode;
  episodeFile?: string;
  sceneId: number;
  force?: boolean;
  provider?: VideoGenerationProvider;
  onStatus?: (record: SceneVideoRecord) => void | Promise<void>;
  signal?: AbortSignal;
  shouldCancel?: () => boolean;
  /** Optional prompt overrides (UI drafts for hook/ending / unsaved scene edits). */
  videoPromptOverride?: string;
  videoNegativePromptOverride?: string;
  /** quality = 20-step baseline; fast = LightX2V 4-step LoRA. */
  qualityMode?: 'quality' | 'fast';
};

export async function generateSceneVideo(options: GenerateSceneVideoOptions): Promise<SceneVideoRecord> {
  const { episode, sceneId } = options;
  const slot = findWanSlot(episode, sceneId);
  if (!slot) throw new Error(`Unknown Wan slot ${sceneId}`);

  const state = await loadEpisodeVideoState(episode.id);
  const existing = state.scenes[String(sceneId)];
  if (existing?.status === 'completed' && !options.force) {
    const stable = sceneVideoPath(episode.id, sceneId);
    try {
      await access(stable);
      return {
        sceneId,
        status: 'completed',
        videoPath: stable,
        videoRelative: sceneVideoRelative(episode.id, sceneId),
        ...(existing.imagePath ? { imagePath: existing.imagePath } : {}),
        ...(existing.imageMtimeMs !== undefined ? { imageMtimeMs: existing.imageMtimeMs } : {})
      };
    } catch {
      // missing file — regenerate
    }
  }

  const image = await resolveSceneImageForVideo({
    episode,
    sceneId,
    ...(options.episodeFile ? { episodeFile: options.episodeFile } : {})
  });

  const outputPath = sceneVideoPath(episode.id, sceneId);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const started = Date.now();
  const startedAt = new Date().toISOString();
  let record: SceneVideoRecord = {
    sceneId,
    status: 'generating',
    imagePath: image.relative,
    imageMtimeMs: image.mtimeMs,
    startedAt
  };
  state.scenes[String(sceneId)] = record;
  await saveEpisodeVideoState(state);
  await options.onStatus?.(record);

  const storyScene = episode.scenes.find((row) => row.id === sceneId);
  const motionPrompt =
    options.videoPromptOverride?.trim() ||
    (storyScene ? sceneMotionPrompt(storyScene) : wanSlotMotionPrompt(slot));
  const motionNegative =
    options.videoNegativePromptOverride?.trim() ||
    (storyScene ? sceneMotionNegativePrompt(storyScene) : wanSlotMotionNegative(slot));
  const qualityMode = resolveWanQualityMode(options.qualityMode);
  const narration = await resolveWanSlotNarrationSeconds({
    episode,
    sceneId,
    ...(options.episodeFile ? { episodeFile: options.episodeFile } : {}),
    fallbackSeconds: slot.durationSeconds
  });
  const wanPlan = planWanClipFromNarration(narration.seconds);
  if (wanPlan.clamped) {
    console.warn(
      `[sceneVideo] scene ${sceneId}: TTS ${narration.seconds.toFixed(2)}s > Wan max ${wanPlan.durationSeconds.toFixed(2)}s — generating clamped clip (${wanPlan.frames}f)`
    );
  } else {
    console.log(
      `[sceneVideo] scene ${sceneId}: TTS ${narration.seconds.toFixed(2)}s (${narration.method}) → Wan ${wanPlan.durationSeconds.toFixed(2)}s`
    );
  }

  try {
    if (options.signal?.aborted || options.shouldCancel?.()) {
      throw new Error('Cancelled');
    }
    const provider = options.provider || resolveVideoProvider();
    await provider.health();
    await provider.generate({
      episodeId: episode.id,
      sceneId,
      imagePath: image.absolute,
      prompt: motionPrompt,
      negativePrompt: motionNegative,
      outputPath,
      durationSeconds: narration.seconds,
      qualityMode,
      ...(options.signal ? { signal: options.signal } : {}),
      onQueued: async ({ promptId, clientId }) => {
        record = {
          ...record,
          status: 'generating',
          promptId,
          clientId,
          qualityMode,
          narrationSeconds: narration.seconds,
          wanDurationSeconds: wanPlan.durationSeconds,
          queuedAt: new Date().toISOString()
        };
        state.scenes[String(sceneId)] = record;
        await saveEpisodeVideoState(state);
        await options.onStatus?.(record);
      },
      onProgress: async (progress) => {
        if (options.signal?.aborted || options.shouldCancel?.()) {
          throw new Error('Cancelled');
        }
        record = {
          ...record,
          status: 'generating',
          progressPercent: progress.percent,
          progressLabel: progress.label,
          qualityMode,
          narrationSeconds: narration.seconds,
          wanDurationSeconds: wanPlan.durationSeconds
        };
        state.scenes[String(sceneId)] = record;
        if (state.batch?.running && state.batch.total > 0) {
          const sceneShare = 1 / state.batch.total;
          const doneShare = state.batch.completed / state.batch.total;
          state.batch = {
            ...state.batch,
            progressPercent: Math.min(
              99,
              Math.round((doneShare + (progress.percent / 100) * sceneShare) * 100)
            )
          };
        }
        await saveEpisodeVideoState(state);
        await options.onStatus?.(record);
      }
    });
    const elapsedMs = Date.now() - started;
    record = {
      sceneId,
      status: 'completed',
      imagePath: image.relative,
      imageMtimeMs: image.mtimeMs,
      videoPath: outputPath,
      videoRelative: sceneVideoRelative(episode.id, sceneId),
      qualityMode,
      narrationSeconds: narration.seconds,
      wanDurationSeconds: wanPlan.durationSeconds,
      ...(record.promptId ? { promptId: record.promptId } : {}),
      ...(record.clientId ? { clientId: record.clientId } : {}),
      startedAt,
      ...(record.queuedAt ? { queuedAt: record.queuedAt } : {}),
      finishedAt: new Date().toISOString(),
      elapsedMs,
      progressPercent: 100,
      progressLabel: 'done'
    };
  } catch (error) {
    let msg = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(msg)) {
      msg = 'Cancelled';
    } else if (record.promptId && /ComfyUI/i.test(msg)) {
      // Enrich bare "failed: <id>" (or any Comfy error) using /history when possible.
      try {
        const localPort = (process.env.WAN_COMFY_LOCAL_PORT || '8080').trim() || '8080';
        const base =
          process.env.WAN_COMFY_URL ||
          process.env.COMFYUI_URL ||
          `http://127.0.0.1:${localPort}`;
        const client = new ComfyClient(base.replace(/\/$/, ''));
        const history = await client.getHistory(record.promptId);
        msg = formatComfyJobError(record.promptId, history[record.promptId]);
      } catch {
        // keep original
      }
    }
    record = {
      sceneId,
      status: 'failed',
      imagePath: image.relative,
      imageMtimeMs: image.mtimeMs,
      ...(record.promptId ? { promptId: record.promptId } : {}),
      ...(record.clientId ? { clientId: record.clientId } : {}),
      startedAt,
      ...(record.queuedAt ? { queuedAt: record.queuedAt } : {}),
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      error: msg
    };
  }

  state.scenes[String(sceneId)] = record;
  await saveEpisodeVideoState(state);
  await options.onStatus?.(record);
  if (record.status === 'failed') {
    throw new Error(record.error || `Scene ${sceneId} video failed`);
  }
  return record;
}

export type BatchMode = 'all' | 'retry';

export async function generateEpisodeVideos(options: {
  episode: Episode;
  episodeFile?: string;
  mode: BatchMode;
  force?: boolean;
  sceneIds?: number[];
  qualityMode?: 'quality' | 'fast';
  onStatus?: (state: EpisodeVideoState) => void | Promise<void>;
  signal?: AbortSignal;
  shouldCancel?: () => boolean;
}): Promise<EpisodeVideoState> {
  const { episode, mode } = options;
  const allSlots = listWanVideoSlots(episode);
  const targets: WanVideoSlot[] = options.sceneIds?.length
    ? allSlots.filter((slot) => options.sceneIds!.includes(slot.id))
    : allSlots.filter((slot) => slot.renderMode === 'AI_VIDEO');

  const state = await buildSceneVideoStatus(episode, options.episodeFile);
  const queue: WanVideoSlot[] = [];
  for (const slot of targets) {
    const rec = state.scenes[String(slot.id)];
    if (mode === 'retry') {
      if (rec?.status === 'failed' || rec?.status === 'stale' || rec?.status === 'not_generated') {
        queue.push(slot);
      }
      continue;
    }
    if (!options.force && rec?.status === 'completed') continue;
    queue.push(slot);
  }

  state.batch = {
    mode,
    total: queue.length,
    completed: 0,
    failed: 0,
    running: true,
    progressPercent: 0
  };
  for (const scene of queue) {
    const prev = state.scenes[String(scene.id)];
    // Drop last-job completion meta so the global bar / ComfyJobMeta don't look "done".
    state.scenes[String(scene.id)] = {
      sceneId: scene.id,
      status: 'queued',
      ...(prev?.imagePath ? { imagePath: prev.imagePath } : {}),
      ...(prev?.imageMtimeMs !== undefined ? { imageMtimeMs: prev.imageMtimeMs } : {}),
      progressPercent: 0,
      progressLabel: 'queued'
    };
  }
  await saveEpisodeVideoState(state);
  await options.onStatus?.(state);

  for (const scene of queue) {
    if (options.signal?.aborted || options.shouldCancel?.()) {
      for (const pending of queue) {
        const cur = state.scenes[String(pending.id)];
        if (cur?.status === 'queued') {
          state.scenes[String(pending.id)] = {
            ...cur,
            status: 'failed',
            error: 'Cancelled'
          };
        }
      }
      break;
    }
    state.batch!.currentSceneId = scene.id;
    // Keep global % on completed share until the new scene reports progress.
    if (state.batch!.total > 0) {
      state.batch!.progressPercent = Math.min(
        99,
        Math.round((state.batch!.completed / state.batch!.total) * 100)
      );
    }
    await saveEpisodeVideoState(state);
    await options.onStatus?.(state);
    try {
      await generateSceneVideo({
        episode,
        sceneId: scene.id,
        force: true,
        ...(options.episodeFile ? { episodeFile: options.episodeFile } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.shouldCancel ? { shouldCancel: options.shouldCancel } : {}),
        ...(options.qualityMode ? { qualityMode: options.qualityMode } : {}),
        onStatus: async (record) => {
          // Re-read batch counters from disk so progress uses latest completed count.
          const live = await loadEpisodeVideoState(episode.id);
          if (live.batch?.running) {
            state.batch = live.batch;
          }
          state.scenes[String(scene.id)] = record;
          if (state.batch?.running && state.batch.total > 0 && typeof record.progressPercent === 'number') {
            const sceneShare = 1 / state.batch.total;
            const doneShare = state.batch.completed / state.batch.total;
            state.batch = {
              ...state.batch,
              currentSceneId: scene.id,
              progressPercent: Math.min(
                99,
                Math.round((doneShare + (record.progressPercent / 100) * sceneShare) * 100)
              )
            };
          }
          await saveEpisodeVideoState(state);
          await options.onStatus?.(state);
        }
      });
      state.batch!.completed += 1;
      if (state.batch!.total > 0) {
        state.batch!.progressPercent = Math.min(
          99,
          Math.round((state.batch!.completed / state.batch!.total) * 100)
        );
      }
      await saveEpisodeVideoState(state);
    } catch (error) {
      state.batch!.failed += 1;
      const msg = error instanceof Error ? error.message : String(error);
      if (/cancel/i.test(msg)) {
        for (const pending of queue) {
          const cur = state.scenes[String(pending.id)];
          if (cur?.status === 'queued') {
            state.scenes[String(pending.id)] = {
              ...cur,
              status: 'failed',
              error: 'Cancelled'
            };
          }
        }
        break;
      }
    }
  }

  state.batch = {
    mode: state.batch!.mode,
    total: state.batch!.total,
    completed: state.batch!.completed,
    failed: state.batch!.failed,
    running: false,
    ...(state.batch!.currentSceneId !== undefined
      ? { currentSceneId: state.batch!.currentSceneId }
      : {}),
    progressPercent:
      options.signal?.aborted || options.shouldCancel?.()
        ? state.batch!.progressPercent || 0
        : 100
  };
  await saveEpisodeVideoState(state);
  await options.onStatus?.(state);
  return state;
}
