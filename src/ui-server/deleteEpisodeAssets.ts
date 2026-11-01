import { readdir, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { outputDir, resolveInside } from './paths.js';

async function safeUnlink(absolute: string): Promise<boolean> {
  try {
    await unlink(absolute);
    return true;
  } catch {
    return false;
  }
}

async function safeRmDir(absolute: string): Promise<boolean> {
  try {
    await rm(absolute, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function unlinkMatchingFiles(dir: string, matches: (name: string) => boolean): Promise<string[]> {
  const removed: string[] = [];
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return removed;
  }
  for (const name of names) {
    if (!matches(name)) continue;
    const absolute = path.join(dir, name);
    if (await safeUnlink(absolute)) removed.push(absolute);
    // Companion sidecars
    if (await safeUnlink(`${absolute}.source.json`)) removed.push(`${absolute}.source.json`);
  }
  return removed;
}

/** Delete media under output/ that is tagged with this episode id. */
export async function deleteEpisodeAssets(episodeId: string): Promise<{ removed: string[] }> {
  const id = episodeId.trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error('Invalid episode id for asset cleanup');
  }

  const root = outputDir();
  const removed: string[] = [];

  const dirs = [
    path.join(root, 'images', id),
    path.join(root, 'veo', id),
    path.join(root, 'ai-video', id),
    path.join(root, 'clips', id),
    path.join(root, 'final', id),
    path.join(root, 'external', id),
    path.join(root, 'packaging', id),
    path.join(root, 'publish', id)
  ];
  for (const dir of dirs) {
    const resolved = resolveInside(root, path.relative(root, dir));
    if (!resolved) continue;
    if (await safeRmDir(resolved)) removed.push(resolved);
  }

  removed.push(
    ...(await unlinkMatchingFiles(path.join(root, 'audio'), (name) => name.includes(id))),
    ...(await unlinkMatchingFiles(
      path.join(root, 'final'),
      (name) => name === `${id}.mp4` || name === `${id}.production.json` || name === `${id}.srt`
    )),
    ...(await unlinkMatchingFiles(path.join(root, 'video'), (name) => name.includes(id)))
  );

  return { removed };
}
