import path from 'node:path';
import { access, readdir } from 'node:fs/promises';
import {
  SFX_EFFECT_IDS,
  type BgmMood,
  type SfxEffectId
} from '../schema/audioPlan.js';

export type SfxCategory = 'cinematic' | 'divine' | 'nature' | 'battle';

export type SfxLibraryEntry = {
  id: SfxEffectId;
  category: SfxCategory;
  /** Relative to assets/audio/sfx/ */
  relativePath: string;
  description: string;
};

export { SFX_EFFECT_IDS };
export type { SfxEffectId };

export const SFX_LIBRARY: SfxLibraryEntry[] = [
  { id: 'deep-boom', category: 'cinematic', relativePath: 'cinematic/deep-boom.wav', description: 'Opening cinematic hit' },
  { id: 'impact', category: 'cinematic', relativePath: 'cinematic/impact.wav', description: 'General impact' },
  { id: 'whoosh', category: 'cinematic', relativePath: 'cinematic/whoosh.wav', description: 'Motion / cut whoosh' },
  { id: 'riser', category: 'cinematic', relativePath: 'cinematic/riser.wav', description: 'Tension build before reveal' },
  { id: 'transition-whoosh', category: 'cinematic', relativePath: 'cinematic/transition-whoosh.wav', description: 'Soft scene transition' },
  { id: 'divine-chime', category: 'divine', relativePath: 'divine/divine-chime.wav', description: 'Miracle / divine glow' },
  { id: 'temple-bell', category: 'divine', relativePath: 'divine/temple-bell.wav', description: 'Temple / cow bells / soft sacred village bells' },
  { id: 'shankh', category: 'divine', relativePath: 'divine/shankh.wav', description: 'Conch — soft ritual or divine conclusion (keep volume low for intimate scenes)' },
  { id: 'magical-sparkle', category: 'divine', relativePath: 'divine/magical-sparkle.wav', description: 'Soft sparkle / flute-like shimmer / tanpura swell proxy' },
  { id: 'thunder', category: 'nature', relativePath: 'nature/thunder.wav', description: 'Storm / distant ominous rumble (use sparingly, soft for Kamsa threat)' },
  { id: 'rain', category: 'nature', relativePath: 'nature/rain.wav', description: 'Rain ambience' },
  { id: 'wind', category: 'nature', relativePath: 'nature/wind.wav', description: 'Soft village breeze / night wind / straw air' },
  { id: 'river', category: 'nature', relativePath: 'nature/river.wav', description: 'River / Yamuna' },
  { id: 'fire', category: 'nature', relativePath: 'nature/fire.wav', description: 'Fire / yagna' },
  { id: 'sword-clash', category: 'battle', relativePath: 'battle/sword-clash.wav', description: 'Weapon clash' },
  { id: 'arrow', category: 'battle', relativePath: 'battle/arrow.wav', description: 'Arrow release' },
  { id: 'heavy-impact', category: 'battle', relativePath: 'battle/heavy-impact.wav', description: 'Doors / heavy strike' },
  { id: 'wing-flap', category: 'battle', relativePath: 'battle/wing-flap.wav', description: 'Garuda / wings' }
];

/** Mood folder under assets/audio/bgm/ (3+ tracks each). */
export const BGM_MOOD_DIRS: Record<BgmMood, string> = {
  divine_mystery: 'divine_mystery',
  dark_mystery: 'dark_mystery',
  epic_battle: 'epic_battle',
  emotional: 'emotional',
  revelation: 'revelation'
};

/** Legacy flat filenames (still accepted as fallback). */
const BGM_LEGACY_FILES: Record<BgmMood, string> = {
  divine_mystery: 'divine-mystery.wav',
  dark_mystery: 'dark-mystery.wav',
  epic_battle: 'epic-battle.wav',
  emotional: 'emotional.wav',
  revelation: 'revelation.wav'
};

const AUDIO_EXTS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac']);

function isAudioFile(name: string): boolean {
  return AUDIO_EXTS.has(path.extname(name).toLowerCase());
}

/** Sound profiles the LLM chooses as bgmMood — continuous bed + typical cue palette. */
export const SOUND_PROFILES: Record<
  BgmMood,
  { label: string; bed: string; typicalCues: SfxEffectId[] }
> = {
  divine_mystery: {
    label: 'DIVINE_MYSTERY',
    bed: 'soft drone + chime + bell + subtle shankh',
    typicalCues: ['divine-chime', 'temple-bell', 'shankh', 'magical-sparkle', 'wind']
  },
  dark_mystery: {
    label: 'DARK_MYSTERY',
    bed: 'low rumble + soft riser + distant thunder',
    typicalCues: ['riser', 'thunder', 'wind', 'transition-whoosh', 'impact']
  },
  epic_battle: {
    label: 'EPIC_BATTLE',
    bed: 'war drums + sword + boom + whoosh',
    typicalCues: ['sword-clash', 'arrow', 'heavy-impact', 'whoosh', 'deep-boom']
  },
  emotional: {
    label: 'EMOTIONAL',
    bed: 'soft pad + wind + subtle chime',
    typicalCues: ['wind', 'divine-chime', 'river', 'magical-sparkle', 'temple-bell']
  },
  revelation: {
    label: 'REVELATION',
    bed: 'riser + silence + impact + divine bell',
    typicalCues: ['riser', 'temple-bell', 'shankh', 'divine-chime', 'magical-sparkle']
  }
};

export function sfxRootDir(cwd = process.cwd()): string {
  return path.resolve(cwd, process.env.SFX_DIR || 'assets/audio/sfx');
}

export function bgmRootDir(cwd = process.cwd()): string {
  return path.resolve(cwd, process.env.BGM_DIR || 'assets/audio/bgm');
}

export function customSfxDir(cwd = process.cwd()): string {
  return path.join(sfxRootDir(cwd), 'custom');
}

export function customSfxPath(effect: string, cwd = process.cwd()): string {
  return path.join(customSfxDir(cwd), `${effect}.wav`);
}

/** Library catalog path (not custom override). */
export function resolveLibrarySfxPath(effect: SfxEffectId, cwd = process.cwd()): string {
  const entry = SFX_LIBRARY.find((item) => item.id === effect);
  if (!entry) throw new Error(`Unknown SFX effect: ${effect}`);
  return path.join(sfxRootDir(cwd), entry.relativePath);
}

export function resolveSfxPath(effect: SfxEffectId, cwd = process.cwd()): string {
  return resolveLibrarySfxPath(effect, cwd);
}

/** Prefer custom/{id}.wav override, else library path. */
export async function resolveSfxPathPreferCustom(
  effect: SfxEffectId,
  cwd = process.cwd()
): Promise<string> {
  const custom = customSfxPath(effect, cwd);
  try {
    await access(custom);
    return custom;
  } catch {
    return resolveLibrarySfxPath(effect, cwd);
  }
}

/** Prefer mood folder tracks; fall back to legacy flat file. */
export function resolveBgmPath(mood: BgmMood, cwd = process.cwd()): string {
  return path.join(bgmRootDir(cwd), BGM_LEGACY_FILES[mood]);
}

export function bgmMoodDir(mood: BgmMood, cwd = process.cwd()): string {
  return path.join(bgmRootDir(cwd), BGM_MOOD_DIRS[mood]);
}

export async function listBgmTracks(mood: BgmMood, cwd = process.cwd()): Promise<string[]> {
  const dir = bgmMoodDir(mood, cwd);
  try {
    const names = await readdir(dir);
    return names
      .filter(isAudioFile)
      .map((name) => path.join(dir, name))
      .sort();
  } catch {
    return [];
  }
}

export type BgmLibraryGroupId = BgmMood | 'custom';

export type BgmLibraryTrack = {
  id: string;
  group: BgmLibraryGroupId;
  label: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Path relative to assets/audio/bgm/ using `/`. */
  relativePath: string;
};

function displayBgmLabel(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_#]+/g, ' ')
    .replace(/-\d{10,}$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function listCustomBgmTracks(cwd = process.cwd()): Promise<string[]> {
  const dir = path.join(bgmRootDir(cwd), 'custom');
  try {
    const names = await readdir(dir);
    return names
      .filter(isAudioFile)
      .map((name) => path.join(dir, name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  } catch {
    return [];
  }
}

/** All selectable BGM: mood libraries + custom/ drops. */
export async function listAllBgmLibrary(cwd = process.cwd()): Promise<BgmLibraryTrack[]> {
  const root = bgmRootDir(cwd);
  const tracks: BgmLibraryTrack[] = [];

  for (const mood of Object.keys(BGM_MOOD_DIRS) as BgmMood[]) {
    const files = await listBgmTracks(mood, cwd);
    for (const absolutePath of files) {
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      tracks.push({
        id: relativePath,
        group: mood,
        label: displayBgmLabel(path.basename(absolutePath)),
        absolutePath,
        relativePath
      });
    }
  }

  for (const absolutePath of await listCustomBgmTracks(cwd)) {
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    tracks.push({
      id: relativePath,
      group: 'custom',
      label: displayBgmLabel(path.basename(absolutePath)),
      absolutePath,
      relativePath
    });
  }

  return tracks;
}

/** Resolve a user-picked BGM path (absolute, or relative to cwd / assets/audio/bgm). */
export function resolveUserBgmPath(raw: string, cwd = process.cwd()): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('BGM path is empty');
  if (path.isAbsolute(trimmed)) return trimmed;
  const fromCwd = path.resolve(cwd, trimmed);
  const fromBgm = path.resolve(bgmRootDir(cwd), trimmed.replace(/^assets[/\\]audio[/\\]bgm[/\\]/, ''));
  return trimmed.startsWith('assets/') || trimmed.includes('audio/bgm') ? fromCwd : fromBgm;
}

export async function assertSfxExists(effect: SfxEffectId, cwd = process.cwd()): Promise<string> {
  const filePath = await resolveSfxPathPreferCustom(effect, cwd);
  await access(filePath);
  return filePath;
}

export async function sfxExists(effect: SfxEffectId, cwd = process.cwd()): Promise<boolean> {
  try {
    await assertSfxExists(effect, cwd);
    return true;
  } catch {
    return false;
  }
}

/** Pick a random track from the mood folder; else legacy flat file. */
export async function findAvailableBgm(mood: BgmMood, cwd = process.cwd()): Promise<string | undefined> {
  const tracks = await listBgmTracks(mood, cwd);
  if (tracks.length > 0) {
    return tracks[Math.floor(Math.random() * tracks.length)];
  }
  const legacy = resolveBgmPath(mood, cwd);
  try {
    await access(legacy);
    return legacy;
  } catch {
    return undefined;
  }
}

export function allowedEffectsPromptList(): string {
  return SFX_LIBRARY.map((entry) => `${entry.id} — ${entry.description}`).join('\n');
}

export function isAllowedEffect(value: string): value is SfxEffectId {
  return (SFX_EFFECT_IDS as readonly string[]).includes(value);
}
