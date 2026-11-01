import path from 'node:path';
import { toOutputRelative } from './selectedAssets.js';

/**
 * True when an output-relative (or absolute-under-output) path is tagged for this episode.
 * Prevents mixing another episode's audio/video into the current Short.
 */
export function assetBelongsToEpisode(
  pathValue: string,
  episodeId: string,
  cwd = process.cwd()
): boolean {
  const id = episodeId.trim();
  if (!id) return false;

  const relative = toOutputRelative(pathValue, cwd) || pathValue.trim().replace(/^[/\\]+/, '');
  const normalized = relative.split(path.sep).join('/').replace(/^output\//, '');
  if (!normalized || normalized.includes('..')) return false;

  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes(id)) return true;

  const base = parts[parts.length - 1] || '';
  return base.includes(id);
}

export function assertAssetBelongsToEpisode(
  pathValue: string,
  episodeId: string,
  kind: string,
  cwd = process.cwd()
): string {
  const relative = toOutputRelative(pathValue, cwd);
  if (!relative) {
    throw new Error(`${kind} path must be under output/: ${pathValue}`);
  }
  if (!assetBelongsToEpisode(relative, episodeId, cwd)) {
    throw new Error(
      `${kind} does not belong to episode "${episodeId}" (refusing cross-episode mix): ${relative}`
    );
  }
  return relative;
}

/** External uploads must live only under output/external/<episodeId>/. */
export function assertExternalVideoPath(
  pathValue: string,
  episodeId: string,
  cwd = process.cwd()
): string {
  const relative = assertAssetBelongsToEpisode(pathValue, episodeId, 'External video', cwd);
  const prefix = `external/${episodeId}/`;
  if (!relative.startsWith(prefix)) {
    throw new Error(
      `External video must be under ${prefix} (got ${relative}). Upload via the desk for this episode.`
    );
  }
  if (!/\.(mp4|mov|webm|m4v)$/i.test(relative)) {
    throw new Error(`External video must be mp4/mov/webm: ${relative}`);
  }
  return relative;
}
