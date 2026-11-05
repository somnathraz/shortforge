import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { loadBudget } from '../config/budget.js';
import {
  assertBudgetPolicy,
  assertEditorialPolicy,
  routeWithinBudget,
  type BudgetReport
} from '../guards/episode.js';
import { EpisodeSchema, type Episode } from '../schema/episode.js';
import { slugify } from '../utils/slug.js';
import { assertUniqueEpisodeId, nextUniqueEpisodeId, resolveEpisodeId } from '../lib/episodeIdentity.js';
import { brandEpisodesDir, currentBrandId, type BrandId } from '../lib/brands.js';
import { applyGenericEpisodeKeys } from '../lib/episodeAliases.js';
import { normalizeDialogueEpisodeForProduction } from '../lib/dialogueEpisode.js';

export type ImportEpisodeResult = {
  episode: Episode;
  file?: string;
  budget: BudgetReport;
  dryRun: boolean;
  /** When the preferred id was already taken, the previous id before `-vN` suffix. */
  idRenamedFrom?: string;
};

export type ValidationIssue = {
  path: string;
  message: string;
};

/** Flatten Zod / Error into UI-friendly issue rows. */
export function formatImportIssues(error: unknown): ValidationIssue[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      path: issue.path.join('.') || 'root',
      message: issue.message
    }));
  }
  if (error instanceof Error) {
    return [{ path: 'editorial', message: error.message }];
  }
  return [{ path: 'root', message: String(error) }];
}

/**
 * Validate hand-authored episode JSON with the same gates as story generation,
 * then optionally write `data/episodes/<timestamp>-<slug>.json`.
 */
export async function importEpisodeJson(
  raw: unknown,
  options: { dryRun?: boolean; episodesDirectory?: string; brandId?: BrandId } = {}
): Promise<ImportEpisodeResult> {
  const dryRun = options.dryRun === true;
  const budget = await loadBudget();
  const brandId = options.brandId || currentBrandId();

  const aliased = applyGenericEpisodeKeys(raw);
  const prepared =
    aliased && typeof aliased === 'object'
      ? normalizeDialogueEpisodeForProduction(aliased as Record<string, unknown>)
      : aliased;
  let episode = EpisodeSchema.parse(prepared);
  if (!episode.brandId) {
    episode = { ...episode, brandId };
  } else if (episode.brandId !== brandId) {
    throw new Error(
      `Episode brandId "${episode.brandId}" does not match active pipeline "${brandId}"`
    );
  }
  assertEditorialPolicy(episode);
  episode = routeWithinBudget(episode, budget);
  const report = assertBudgetPolicy(episode, budget);

  const preferredId = resolveEpisodeId({
    id: episode.id,
    titleEn: episode.titleEn,
    topic: episode.topic
  });
  if (preferredId !== episode.id) {
    episode = { ...episode, id: preferredId };
  }

  if (dryRun) {
    return { episode, budget: report, dryRun: true };
  }

  const dir = options.episodesDirectory
    ? path.resolve(options.episodesDirectory)
    : brandEpisodesDir(brandId);
  await mkdir(dir, { recursive: true });

  // Same topic / template id must become a new draft (…-v2), not overwrite shared assets.
  const uniqueId = await nextUniqueEpisodeId(episode.id, dir);
  let idRenamedFrom: string | undefined;
  if (uniqueId !== episode.id) {
    idRenamedFrom = episode.id;
    episode = { ...episode, id: uniqueId };
  } else {
    // Belt-and-suspenders: still refuse if somehow colliding.
    await assertUniqueEpisodeId(episode.id, dir);
  }

  const file = `${Date.now()}-${slugify(episode.topic || episode.id)}.json`;
  const output = path.join(dir, file);
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
  await rename(temporary, output);

  return {
    episode,
    file,
    budget: report,
    dryRun: false,
    ...(idRenamedFrom ? { idRenamedFrom } : {})
  };
}
