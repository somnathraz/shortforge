import path from 'node:path';
import { brandEpisodesDir } from '../lib/brands.js';

export const ROOT = process.cwd();

/** Active pipeline's episodes directory (see X-Pipeline / brand registry). */
export function episodesDir(): string {
  return brandEpisodesDir();
}

export function reviewsDir(): string {
  return path.resolve(ROOT, 'data/reviews');
}

export function outputDir(): string {
  return path.resolve(ROOT, 'output');
}

/** Prevent path traversal outside a base directory. */
export function resolveInside(base: string, relative: string): string | null {
  const cleaned = relative.replace(/^[/\\]+/, '');
  if (cleaned.includes('..') || path.isAbsolute(cleaned)) return null;
  const resolved = path.resolve(base, cleaned);
  const normalizedBase = path.resolve(base);
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    return null;
  }
  return resolved;
}
