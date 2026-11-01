import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listAllBgmLibrary, bgmRootDir, type BgmLibraryGroupId } from '../audio/sfx-library.js';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { ROOT } from './paths.js';

export type BgmTrackView = {
  id: string;
  group: BgmLibraryGroupId;
  label: string;
  /** Relative to assets/audio/bgm/ */
  relativePath: string;
  /** Preview URL under /api/assets/bgm/ */
  url: string;
  durationSeconds?: number;
  sizeBytes: number;
};

export type BgmLibraryResponse = {
  groups: Array<{
    id: BgmLibraryGroupId;
    label: string;
    tracks: BgmTrackView[];
  }>;
  total: number;
};

const GROUP_LABELS: Record<BgmLibraryGroupId, string> = {
  custom: 'Custom',
  divine_mystery: 'Divine mystery',
  dark_mystery: 'Dark mystery',
  epic_battle: 'Epic battle',
  emotional: 'Emotional',
  revelation: 'Revelation'
};

const GROUP_ORDER: BgmLibraryGroupId[] = [
  'custom',
  'divine_mystery',
  'dark_mystery',
  'emotional',
  'revelation',
  'epic_battle'
];

export function bgmAssetsRoot(): string {
  return bgmRootDir(ROOT);
}

export async function listBgmLibraryForUi(): Promise<BgmLibraryResponse> {
  const tracks = await listAllBgmLibrary(ROOT);
  const views: BgmTrackView[] = [];

  for (const track of tracks) {
    try {
      const info = await stat(track.absolutePath);
      let durationSeconds: number | undefined;
      try {
        durationSeconds = Number((await probeAudioDuration(track.absolutePath)).toFixed(1));
      } catch {
        // optional
      }
      const view: BgmTrackView = {
        id: track.id,
        group: track.group,
        label: track.label,
        relativePath: track.relativePath,
        url: `/api/assets/bgm/${track.relativePath.split(path.sep).join('/')}`,
        sizeBytes: info.size
      };
      if (durationSeconds !== undefined) view.durationSeconds = durationSeconds;
      views.push(view);
    } catch {
      // skip missing
    }
  }

  const groups = GROUP_ORDER.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    tracks: views.filter((track) => track.group === id)
  })).filter((group) => group.tracks.length > 0);

  return { groups, total: views.length };
}

export async function resolveBgmAsset(relative: string): Promise<string | null> {
  const cleaned = decodeURIComponent(relative).replace(/^[/\\]+/, '');
  if (!cleaned || cleaned.includes('..')) return null;
  const absolute = path.resolve(bgmAssetsRoot(), cleaned);
  const root = path.resolve(bgmAssetsRoot());
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return null;
    return absolute;
  } catch {
    return null;
  }
}

/** Quick existence check that custom folder is present (even if empty). */
export async function customBgmDirExists(): Promise<boolean> {
  try {
    await access(path.join(bgmAssetsRoot(), 'custom'));
    return true;
  } catch {
    return false;
  }
}

export async function listCustomBgmFileNames(): Promise<string[]> {
  try {
    const names = await readdir(path.join(bgmAssetsRoot(), 'custom'));
    return names.filter((name) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name));
  } catch {
    return [];
  }
}
