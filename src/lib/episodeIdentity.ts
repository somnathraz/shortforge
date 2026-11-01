import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { slugify } from '../utils/slug.js';

/** Sample/template leftovers that must never become production asset folder names. */
export function isPlaceholderEpisodeId(id: string): boolean {
  return /^my-episode(?:-\d+)?$/i.test(id.trim()) || /^episode-\d+$/i.test(id.trim());
}

/**
 * Prefer a stable kebab slug from the English title/topic when the model (or
 * sample JSON) left a placeholder like `my-episode-001`.
 */
export function resolveEpisodeId(input: {
  id: string;
  titleEn?: string | undefined;
  topic?: string | undefined;
}): string {
  const current = input.id.trim();
  if (!isPlaceholderEpisodeId(current)) return current;
  const fromTitle = slugify(input.titleEn || '');
  if (fromTitle && fromTitle !== 'episode') return fromTitle;
  const fromTopic = slugify(input.topic || '');
  if (fromTopic && fromTopic !== 'episode') return fromTopic;
  return current;
}

/**
 * Asset, review, packaging and publish folders are keyed by episode id. Two
 * scripts with the same id would therefore overwrite each other's work.
 */
export async function assertUniqueEpisodeId(
  episodeId: string,
  episodesDirectory: string,
  excludeFile?: string
): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(episodesDirectory)).filter(
      (file) => file.endsWith('.json') && file !== excludeFile
    );
  } catch {
    return;
  }

  for (const file of files) {
    try {
      const value = JSON.parse(await readFile(path.join(episodesDirectory, file), 'utf8')) as {
        id?: unknown;
      };
      if (value.id === episodeId) {
        throw new Error(
          `Episode id "${episodeId}" is already used by ${file}. Give this script a unique id so its voice, images, video and publish history stay separate.`
        );
      }
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
}

/** AI regeneration is a new draft: keep it instead of colliding with the old id. */
export async function nextUniqueEpisodeId(
  preferredId: string,
  episodesDirectory: string
): Promise<string> {
  const existing = new Set<string>();
  let files: string[] = [];
  try {
    files = (await readdir(episodesDirectory)).filter((file) => file.endsWith('.json'));
  } catch {
    return preferredId;
  }
  for (const file of files) {
    try {
      const value = JSON.parse(await readFile(path.join(episodesDirectory, file), 'utf8')) as {
        id?: unknown;
      };
      if (typeof value.id === 'string') existing.add(value.id);
    } catch {
      // Ignore malformed files; the episode list will surface only valid scripts.
    }
  }
  if (!existing.has(preferredId)) return preferredId;
  let version = 2;
  while (existing.has(`${preferredId}-v${version}`)) version += 1;
  return `${preferredId}-v${version}`;
}
