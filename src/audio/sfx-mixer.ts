import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AudioPlan, SfxCue, SfxEffectId } from '../schema/audioPlan.js';
import {
  assertSfxExists,
  customSfxPath,
  resolveLibrarySfxPath,
  resolveSfxPathPreferCustom,
  sfxExists,
  sfxRootDir
} from './sfx-library.js';
import { generateElevenLabsSfxToFile } from '../providers/elevenlabsSfx.js';
import { readAssetMeta, writeAssetMeta } from './asset-meta.js';
import { probeAudio } from './ffprobe.js';

export type SfxSourceKind = 'library' | 'custom' | 'elevenlabs' | 'skipped';

export type ResolvedSfxCue = {
  effect: SfxEffectId;
  path: string;
  source: SfxSourceKind;
  file: string;
};

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-2000) || `${command} exited with code ${code}`));
    });
  });
}

async function resolveFfmpeg(): Promise<string> {
  try {
    await run('ffmpeg', ['-version']);
    return 'ffmpeg';
  } catch {
    throw new Error('ffmpeg is required. Install with: brew install ffmpeg');
  }
}

/**
 * Scale plan volumes for EpicAstra storytelling:
 * narrator dominant, SFX as accents — not a second foreground layer.
 */
export function effectiveSfxMixVolume(cueVolume: number, effect?: string): number {
  const rawGain = Number(process.env.SFX_MIX_GAIN || '0.22');
  const gain = Number.isFinite(rawGain) && rawGain >= 0 ? rawGain : 0.22;
  const ambience =
    effect === 'rain' || effect === 'wind' || effect === 'river' || effect === 'fire';
  const mult = ambience ? Math.min(gain, 0.22) : gain;
  // Hard caps: accents under voice — never near 1:1 with narration.
  return Math.min(ambience ? 0.16 : 0.24, Math.max(0, cueVolume * mult));
}

/** Build adelay/volume labels for each SFX input (index 1..N after narration). */
export function buildSfxFilterComplex(cues: SfxCue[]): string {
  if (!cues.length) {
    throw new Error('No SFX cues to mix');
  }
  const narrGain = Number(process.env.SFX_NARRATION_GAIN || '1.05');
  const narrVolume =
    Number.isFinite(narrGain) && narrGain > 0 ? Math.min(1.25, Math.max(0.5, narrGain)) : 1.05;
  const parts: string[] = [`[0:a]volume=${narrVolume.toFixed(3)}[narr]`];
  const labels: string[] = ['[narr]'];
  for (const [index, cue] of cues.entries()) {
    const inputIndex = index + 1;
    // adelay=0 can drop the first sample in some FFmpeg builds — keep a tiny offset.
    const delayMs = Math.max(cue.time <= 0 ? 40 : 0, Math.round(cue.time * 1000));
    const label = `sfx${index + 1}`;
    const volume = effectiveSfxMixVolume(cue.volume, cue.effect);
    parts.push(
      `[${inputIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${volume.toFixed(3)},adelay=${delayMs}|${delayMs}:all=1[${label}]`
    );
    labels.push(`[${label}]`);
  }
  const inputs = labels.length;
  parts.push(
    `${labels.join('')}amix=inputs=${inputs}:duration=first:dropout_transition=0:normalize=0[mixed]`
  );
  parts.push(`[mixed]alimiter=limit=0.96:attack=5:release=50:level=0[aout]`);
  return parts.join(';\n');
}

export function sfxMixPath(episodeId: string, cwd = process.cwd()): string {
  const root = path.resolve(cwd, process.env.AUDIO_OUTPUT_DIR || 'output/audio');
  return path.join(root, `${episodeId}-sfx-mix.wav`);
}

async function classifyExistingSfx(
  effect: SfxEffectId,
  filePath: string,
  cwd: string
): Promise<SfxSourceKind> {
  const custom = customSfxPath(effect, cwd);
  if (path.resolve(filePath) === path.resolve(custom)) {
    const meta = await readAssetMeta(filePath);
    if (meta?.source === 'elevenlabs') return 'elevenlabs';
    return 'custom';
  }
  return 'library';
}

/**
 * Resolve SFX file: custom override → library → optional ElevenLabs (opt-in only).
 * Default: never auto-generate; callers should skipMissing instead.
 */
export async function resolveOrGenerateSfx(
  effect: SfxEffectId,
  cwd = process.cwd(),
  options?: { allowElevenLabs?: boolean }
): Promise<ResolvedSfxCue> {
  const rel = (abs: string) => path.relative(sfxRootDir(cwd), abs).split(path.sep).join('/');

  if (await sfxExists(effect, cwd)) {
    const filePath = await assertSfxExists(effect, cwd);
    const source = await classifyExistingSfx(effect, filePath, cwd);
    return { effect, path: filePath, source, file: rel(filePath) };
  }

  // Never treat env alone as auto-gen on mix — require an explicit allowElevenLabs flag
  // (Desk "Generate EL" job or CLI --elevenlabs-sfx).
  const allowEl = options?.allowElevenLabs === true && Boolean(process.env.ELEVENLABS_API_KEY);

  if (!allowEl) {
    throw new Error(
      `Missing SFX "${effect}". Upload WAV to ${customSfxPath(effect, cwd)} ` +
        `(or library ${resolveLibrarySfxPath(effect, cwd)}), or opt-in Generate EL. Mix skips missing by default.`
    );
  }

  const dest = customSfxPath(effect, cwd);
  console.warn(`SFX miss "${effect}" — generating via ElevenLabs → custom/${effect}.wav`);
  await generateElevenLabsSfxToFile({ effectId: effect, destWavPath: dest });
  const probe = await probeAudio(dest);
  await writeAssetMeta(dest, {
    id: effect,
    file: `custom/${effect}.wav`,
    category: 'custom',
    source: 'elevenlabs',
    sourceUrl: 'https://api.elevenlabs.io/v1/sound-generation',
    downloadedAt: new Date().toISOString().slice(0, 10),
    commercialUse: true,
    contentId: false,
    durationSeconds: Number(probe.durationSeconds.toFixed(3)),
    note: 'Opt-in ElevenLabs generation (not auto on mix miss)'
  });
  return { effect, path: dest, source: 'elevenlabs', file: rel(dest) };
}

export async function listMissingSfxEffects(
  effects: readonly SfxEffectId[],
  cwd = process.cwd()
): Promise<SfxEffectId[]> {
  const missing: SfxEffectId[] = [];
  const seen = new Set<string>();
  for (const effect of effects) {
    if (seen.has(effect)) continue;
    seen.add(effect);
    if (!(await sfxExists(effect, cwd))) missing.push(effect);
  }
  return missing;
}

/**
 * Mix narration + timed SFX via FFmpeg adelay/amix.
 * Missing library/custom files are skipped by default (optional upload later) —
 * never auto-billed via ElevenLabs unless allowElevenLabsMiss is true.
 */
export async function mixNarrationWithSfx(options: {
  narrationPath: string;
  plan: AudioPlan;
  outputPath: string;
  cwd?: string;
  allowElevenLabsMiss?: boolean;
  /** When true (default), missing cues are omitted with a warning instead of failing. */
  skipMissing?: boolean;
}): Promise<{ outputPath: string; resolved: ResolvedSfxCue[]; skipped: SfxEffectId[] }> {
  const cwd = options.cwd || process.cwd();
  await access(options.narrationPath);
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const skipMissing = options.skipMissing !== false;
  const allowEl = options.allowElevenLabsMiss === true;
  const cues = options.plan.sfx;
  const mixCues: SfxCue[] = [];
  const resolved: ResolvedSfxCue[] = [];
  const skipped: SfxEffectId[] = [];

  for (const cue of cues) {
    if (await sfxExists(cue.effect, cwd)) {
      const item = await resolveOrGenerateSfx(cue.effect, cwd, { allowElevenLabs: false });
      resolved.push(item);
      mixCues.push(cue);
      continue;
    }
    if (allowEl) {
      const item = await resolveOrGenerateSfx(cue.effect, cwd, { allowElevenLabs: true });
      resolved.push(item);
      mixCues.push(cue);
      continue;
    }
    if (skipMissing) {
      console.warn(
        `Skipping missing SFX "${cue.effect}" @ ${cue.time}s — upload to custom/${cue.effect}.wav or Generate EL (optional)`
      );
      skipped.push(cue.effect);
      resolved.push({
        effect: cue.effect,
        path: '',
        source: 'skipped',
        file: `(missing — upload custom/${cue.effect}.wav)`
      });
      continue;
    }
    throw new Error(
      `Missing SFX "${cue.effect}". Expected ${resolveLibrarySfxPath(cue.effect, cwd)} (or custom/).`
    );
  }

  if (!mixCues.length) {
    console.warn('No resolvable SFX cues — writing narration-only sfx-mix');
    await copyFile(options.narrationPath, options.outputPath);
    return { outputPath: options.outputPath, resolved, skipped };
  }

  const ffmpeg = await resolveFfmpeg();
  const filter = buildSfxFilterComplex(mixCues);
  const args = ['-y', '-i', options.narrationPath];
  for (const item of resolved) {
    if (item.source === 'skipped' || !item.path) continue;
    args.push('-i', item.path);
  }
  args.push(
    '-filter_complex',
    filter,
    '-map',
    '[aout]',
    '-ac',
    '2',
    '-ar',
    '44100',
    options.outputPath
  );

  await run(ffmpeg, args);
  return { outputPath: options.outputPath, resolved, skipped };
}

export function summarizeSfxUsage(resolved: ResolvedSfxCue[]): NonNullable<AudioPlan['sfxUsage']> {
  let local = 0;
  let elevenlabs = 0;
  let skipped = 0;
  for (const item of resolved) {
    if (item.source === 'elevenlabs') elevenlabs += 1;
    else if (item.source === 'skipped') skipped += 1;
    else local += 1;
  }
  return {
    local,
    elevenlabs,
    ...(skipped ? { skipped } : {}),
    cues: resolved.map((item) => ({
      effect: item.effect,
      source: item.source,
      file: item.file
    }))
  };
}

/** @deprecated prefer resolveOrGenerateSfx — kept for callers that only need a path */
export async function resolveSfxFilePath(
  effect: SfxEffectId,
  cwd = process.cwd()
): Promise<string> {
  return resolveSfxPathPreferCustom(effect, cwd);
}
