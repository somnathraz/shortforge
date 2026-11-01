import { copyFile, readFile, readdir, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { TechReelAuthoringSchema, TechReelSchema, type TechReel } from '../schema/techReel.js';
import { isTechBrand, currentBrandId } from '../lib/brands.js';
import { ROOT } from './paths.js';

export type TechReelJob = { status: 'running' | 'completed' | 'failed'; startedAt: string; finishedAt?: string; log: string; previewUrl?: string };
const jobs = new Map<string, TechReelJob>();
const directory = path.join(ROOT, 'data/tech-reels');

export function assertTechStudioBrand(): void {
  if (!isTechBrand(currentBrandId())) throw new Error('Motion studio is available only in the Tech Reels pipeline');
}
/** The reel schema is browser-shared, so the tech-kind check lives here. */
function assertTechReelBrand(brandId: string): void {
  if (!isTechBrand(brandId)) throw new Error(`Tech reels need a tech-kind pipeline; "${brandId}" is not one`);
}
export function techReelPath(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid tech reel ID');
  return path.join(directory, `${id}.json`);
}
export async function loadTechReel(id: string): Promise<TechReel> {
  const reel = TechReelSchema.parse(JSON.parse(await readFile(techReelPath(id), 'utf8')));
  assertTechReelBrand(reel.brandId);
  if (reel.id !== id) throw new Error('Storyboard ID must match its filename');
  return reel;
}
export async function techReelDetail(id: string) {
  const reel = await loadTechReel(id);
  const fingerprint = createHash('sha256').update(JSON.stringify(reel)).digest('hex');
  let output: { url: string; duration: number; stale: boolean; modifiedAt: string } | null = null;
  try {
    const base = path.join(ROOT, 'output/tech-reels', id);
    const info = await stat(path.join(base, `${id}.mp4`));
    const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8')) as { frames: number; fps: number; storyboardHash?: string };
    output = { url: `/api/media/tech-reels/${id}/${id}.mp4?v=${info.mtimeMs}`, duration: manifest.frames / manifest.fps, stale: manifest.storyboardHash !== fingerprint, modifiedAt: info.mtime.toISOString() };
  } catch { /* No completed output yet. */ }
  return { reel, output, job: jobs.get(id) || null };
}
export async function listTechReels() {
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).filter(file => /^[a-zA-Z0-9_-]+\.json$/.test(file));
  const reels = await Promise.all(files.map(async file => {
    const id = file.slice(0, -5);
    const detail = await techReelDetail(id);
    return { id, title: detail.reel.title, style: detail.reel.style, beats: detail.reel.beats.length, output: detail.output, job: detail.job };
  }));
  return reels.sort((a, b) => Number(b.style === 'orbital') - Number(a.style === 'orbital') || a.title.localeCompare(b.title));
}
export async function saveTechReel(id: string, value: unknown, create = false): Promise<TechReel> {
  const destination = techReelPath(id);
  const reel = TechReelAuthoringSchema.parse(value);
  assertTechReelBrand(reel.brandId);
  if (reel.id !== id) throw new Error('Storyboard ID must match its filename');
  if (jobs.get(id)?.status === 'running') throw new Error('Wait for this render to finish before saving');
  await mkdir(directory, { recursive: true });
  if (create) {
    await writeFile(destination, `${JSON.stringify(reel, null, 2)}\n`, { flag: 'wx' });
  } else {
    await loadTechReel(id);
    const pending = `${destination}.tmp`;
    await writeFile(pending, `${JSON.stringify(reel, null, 2)}\n`);
    await rename(pending, destination);
  }
  return reel;
}
export async function startTechReelRender(id: string, provider: 'edge' | 'elevenlabs', silent: boolean, episodeId?: string): Promise<TechReelJob> {
  assertTechStudioBrand();
  if ([...jobs.values()].some(job => job.status === 'running')) throw new Error('A motion render is already running. Wait for it to finish.');
  // Render accepts any runtime-valid reel (window-lab / scale-lab / orbital). AuthoringSchema is for new Studio uploads only.
  TechReelSchema.parse(await loadTechReel(id));
  let selectedVoiceEpisode: string | undefined;
  if (!silent && episodeId) {
    if (episodeId !== id) throw new Error('Reusing Desk voice requires a storyboard with the same episode id.');
    const { brandEpisodesDir } = await import('../lib/brands.js');
    const { loadReview } = await import('./episodes.js');
    const dir = brandEpisodesDir(currentBrandId());
    for (const file of (await readdir(dir)).filter(f => f.endsWith('.json'))) {
      const episode = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as { id?: string };
      if (episode.id !== episodeId) continue;
      if ((await loadReview(file))?.selected.audio) selectedVoiceEpisode = path.join(dir, file);
      break;
    }
    if (!selectedVoiceEpisode) throw new Error('Select the episode voice in Desk first. Production reuses that recording.');
  }
  // Recheck after I/O so simultaneous requests cannot launch duplicate renders.
  if ([...jobs.values()].some(job => job.status === 'running')) throw new Error('A motion render is already running. Wait for it to finish.');
  const job: TechReelJob = { status: 'running', startedAt: new Date().toISOString(), log: selectedVoiceEpisode ? 'Reusing selected Desk voice and retiming animation…\n' : 'Preparing narration and animation…\n' };
  jobs.set(id, job);
  const child = spawn(
    process.execPath,
    selectedVoiceEpisode ? ['--import', 'tsx', 'scripts/render-selected-tech-reel.ts', selectedVoiceEpisode, '--no-attach'] : [
      '--import',
      'tsx',
      'src/cli/render-tech-reel.ts',
      '--storyboard',
      techReelPath(id),
      '--tts',
      provider,
      '--legacy-template',
      ...(silent ? ['--silent'] : [])
    ],
    { cwd: ROOT, env: { ...process.env, ACTIVE_BRAND: currentBrandId() }, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const append = (chunk: Buffer) => { job.log = (job.log + chunk.toString()).slice(-6000); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.on('error', error => { job.status = 'failed'; job.finishedAt = new Date().toISOString(); job.log += error.message; });
  child.on('close', code => {
    job.status = code === 0 ? 'completed' : 'failed';
    job.finishedAt = new Date().toISOString();
    if (code === 0) job.previewUrl = `/api/media/tech-reels/${id}/${silent ? 'visuals' : id}.mp4?v=${Date.now()}`;
  });
  return job;
}

/**
 * Copy a rendered tech reel into output/final tagged with the episode id
 * so Desk Review / Publish can treat it as this episode's final.
 *
 * Refuses when the Desk episode already defines Remotion techVisuals
 * (CODE_PANEL / BOOKING_HALL / SYSTEM_FLOW / …) — those must be produced via Produce → Remotion,
 * not by attaching an unrelated Motion Studio storyboard (e.g. request-coalescing).
 */
export async function attachTechReelToEpisode(
  reelId: string,
  episodeId: string
): Promise<{ path: string; url: string; duration: number }> {
  assertTechStudioBrand();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(episodeId)) throw new Error('Invalid episode id');

  const { brandEpisodesDir } = await import('../lib/brands.js');
  const episodesDir = brandEpisodesDir(currentBrandId());
  const files = await readdir(episodesDir);
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    let raw: {
      id?: string;
      hookTechVisual?: unknown;
      scenes?: Array<{ techVisual?: unknown }>;
    };
    try {
      raw = JSON.parse(await readFile(path.join(episodesDir, file), 'utf8')) as typeof raw;
    } catch {
      continue;
    }
    if (raw.id !== episodeId) continue;
    const hasTechVisual =
      Boolean(raw.hookTechVisual) ||
      Boolean(raw.scenes?.some((scene) => Boolean(scene.techVisual)));
    if (hasTechVisual && reelId !== episodeId) {
      throw new Error(
        `Episode "${episodeId}" has Remotion techVisuals (CODE_PANEL / BOOKING_HALL / SYSTEM_FLOW). ` +
          `Do not attach storyboard "${reelId}". Use Produce → Remotion + voice to create a new final.`
      );
    }
    const notes = Array.isArray(
      (raw as { sourceReview?: { notes?: unknown } }).sourceReview?.notes
    )
      ? ((raw as { sourceReview?: { notes?: string[] } }).sourceReview?.notes || [])
      : [];
    const linked = notes.some((note) => {
      const m = String(note).match(/tech-reels\/([a-zA-Z0-9_-]+)/i);
      return m?.[1] === reelId;
    });
    if (reelId !== episodeId && !linked) {
      throw new Error(
        `Storyboard "${reelId}" is not linked to episode "${episodeId}". ` +
          `Attaching it would reuse an unrelated old Motion Studio video. ` +
          `Create data/tech-reels/${episodeId}.json, add a note "tech-reels/${reelId}", ` +
          `or Produce with Remotion techVisuals / scene stills + voice instead.`
      );
    }
    break;
  }

  const detail = await techReelDetail(reelId);
  if (!detail.output) {
    throw new Error(`No rendered video for "${reelId}". Create the video first.`);
  }
  if (detail.output.stale) {
    throw new Error(`Rendered video for "${reelId}" is stale. Create the video again.`);
  }
  const src = path.join(ROOT, 'output/tech-reels', reelId, `${reelId}.mp4`);
  await stat(src);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const relative = `final/${episodeId}-techreel-${reelId}-${stamp}.mp4`;
  const dest = path.join(ROOT, 'output', relative);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return {
    path: relative,
    url: `/api/media/${relative.split('/').map(encodeURIComponent).join('/')}?v=${Date.now()}`,
    duration: detail.output.duration
  };
}
