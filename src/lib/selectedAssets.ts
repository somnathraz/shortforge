import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Paths are always relative to `output/` using `/` separators. */
export type SelectedAssets = {
  sceneVisuals?: import('./sceneVisualPlan.js').SceneVisuals | undefined;
  burnSubtitles?: boolean | undefined;
  audio?: string | undefined;
  /** sceneId → image path under output/ */
  images?: Record<string, string> | undefined;
  /** sceneId → AI/ffmpeg clip path under output/ */
  clips?: Record<string, string> | undefined;
  /** Full assembled Short path under output/ */
  final?: string | undefined;
  /** Externally uploaded full video under output/external/<episodeId>/ */
  externalVideo?: string | undefined;
};

export type EpisodeReviewSelected = {
  episodeFile: string;
  episodeId: string;
  selected?: SelectedAssets;
};

function reviewsDir(cwd = process.cwd()): string {
  return path.resolve(cwd, 'data/reviews');
}

function outputRoot(cwd = process.cwd()): string {
  return path.resolve(cwd, 'output');
}

export function toOutputRelative(absoluteOrPublic: string, cwd = process.cwd()): string | null {
  const root = outputRoot(cwd);
  let cleaned = absoluteOrPublic.trim();
  if (cleaned.startsWith('/api/media/')) cleaned = cleaned.slice('/api/media/'.length);
  cleaned = cleaned.replace(/^[/\\]+/, '').split(path.sep).join('/');
  if (!cleaned || cleaned.includes('..')) return null;

  const absolute = path.isAbsolute(absoluteOrPublic)
    ? path.resolve(absoluteOrPublic)
    : path.resolve(root, cleaned);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  return path.relative(root, absolute).split(path.sep).join('/');
}

export function resolveOutputPath(relative: string, cwd = process.cwd()): string | null {
  const normalized = toOutputRelative(relative, cwd);
  if (!normalized) return null;
  return path.resolve(outputRoot(cwd), normalized);
}

export async function loadReviewSelected(
  episodeFile: string,
  cwd = process.cwd()
): Promise<SelectedAssets | null> {
  const base = episodeFile.replace(/\.json$/i, '');
  const reviewPath = path.join(reviewsDir(cwd), `${base}.review.json`);
  try {
    const raw = JSON.parse(await readFile(reviewPath, 'utf8')) as EpisodeReviewSelected;
    return raw.selected && typeof raw.selected === 'object' ? raw.selected : null;
  } catch {
    return null;
  }
}

export async function loadReviewSelectedByEpisodeId(
  episodeId: string,
  episodeFileHint?: string,
  cwd = process.cwd()
): Promise<SelectedAssets | null> {
  if (episodeFileHint) {
    const fromHint = await loadReviewSelected(episodeFileHint, cwd);
    if (fromHint) return fromHint;
  }
  try {
    const names = await readdir(reviewsDir(cwd));
    for (const name of names.filter((n) => n.endsWith('.review.json'))) {
      try {
        const raw = JSON.parse(
          await readFile(path.join(reviewsDir(cwd), name), 'utf8')
        ) as EpisodeReviewSelected;
        if (raw.episodeId === episodeId && raw.selected) return raw.selected;
      } catch {
        // continue
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveSelectedAudio(
  selected: SelectedAssets | null | undefined,
  cwd = process.cwd()
): Promise<string | undefined> {
  if (!selected?.audio) return undefined;
  return resolveAudioCandidate(selected.audio, cwd);
}

/** Resolve a narration path from CLI `--audio`, review selection, or absolute/output-relative forms. */
export async function resolveAudioCandidate(
  raw: string | undefined,
  cwd = process.cwd()
): Promise<string | undefined> {
  if (!raw?.trim()) return undefined;
  const value = raw.trim();
  const candidates: string[] = [];

  if (path.isAbsolute(value)) {
    candidates.push(path.resolve(value));
  }

  // output-relative: "audio/foo.mp3"
  const fromOutput = resolveOutputPath(value, cwd);
  if (fromOutput) candidates.push(fromOutput);

  // "output/audio/foo.mp3" from repo root
  candidates.push(path.resolve(cwd, value));

  // strip leading output/ then resolve under output/
  const stripped = value.replace(/^output[/\\]/, '');
  if (stripped !== value) {
    const again = resolveOutputPath(stripped, cwd);
    if (again) candidates.push(again);
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return undefined;
}

/**
 * Pick narration for an episode: explicit --audio → review selection → newest episode-tagged mp3.
 * Never falls back to a different episode's hardcoded filename.
 */
export async function resolveEpisodeNarrationAudio(options: {
  episodeId: string;
  episodeFile?: string;
  explicitAudio?: string;
  cwd?: string;
}): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const fromExplicit = await resolveAudioCandidate(options.explicitAudio, cwd);
  if (fromExplicit) return fromExplicit;

  const selected = options.episodeFile
    ? await loadReviewSelected(path.basename(options.episodeFile), cwd)
    : await loadReviewSelectedByEpisodeId(options.episodeId, undefined, cwd);
  const fromReview = await resolveSelectedAudio(selected, cwd);
  if (fromReview) return fromReview;

  const audioDir = path.resolve(cwd, process.env.TTS_OUTPUT_DIR || 'output/audio');
  try {
    const names = (await readdir(audioDir))
      .filter((name) => name.includes(options.episodeId) && /\.mp3$/i.test(name))
      .sort()
      .reverse();
    for (const name of names) {
      const absolute = path.join(audioDir, name);
      try {
        await access(absolute);
        return absolute;
      } catch {
        // continue
      }
    }
  } catch {
    // no audio dir
  }

  throw new Error(
    `Audio not found for episode "${options.episodeId}". Select a voice in the desk and save, or pass --audio path.mp3`
  );
}

export async function resolveSelectedClip(
  selected: SelectedAssets | null | undefined,
  sceneId: number,
  cwd = process.cwd()
): Promise<string | undefined> {
  const relative = selected?.clips?.[String(sceneId)];
  if (!relative) return undefined;
  const absolute = resolveOutputPath(relative, cwd);
  if (!absolute) return undefined;
  try {
    await access(absolute);
    return absolute;
  } catch {
    return undefined;
  }
}

export async function resolveSelectedImage(
  selected: SelectedAssets | null | undefined,
  sceneId: number,
  cwd = process.cwd()
): Promise<string | undefined> {
  const relative = selected?.images?.[String(sceneId)];
  if (!relative) return undefined;
  const absolute = resolveOutputPath(relative, cwd);
  if (!absolute) return undefined;
  try {
    await access(absolute);
    return absolute;
  } catch {
    return undefined;
  }
}
