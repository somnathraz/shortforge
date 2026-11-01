import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { BgmMood } from '../schema/audioPlan.js';
import { findAvailableBgm } from './sfx-library.js';
import { probeAudioDuration } from './ffprobe.js';

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

export function finalMixPath(episodeId: string, cwd = process.cwd()): string {
  const root = path.resolve(cwd, process.env.AUDIO_OUTPUT_DIR || 'output/audio');
  return path.join(root, `${episodeId}-final-mix.wav`);
}

/** Soft background bed; the voice remains the foreground source. */
export const BGM_LOUDNORM_I = Number(process.env.BGM_LOUDNORM_I || '-30');

/** Linear trim after normalization. Allow genuinely quiet settings, including mute. */
export function bgmVolumeForMood(mood: BgmMood): number {
  const raw = process.env.BGM_VOLUME?.trim();
  const value = Number(raw);
  if (raw && Number.isFinite(value) && value >= 0) return Math.min(1.5, value);
  const map: Record<BgmMood, number> = {
    divine_mystery: 0.5,
    dark_mystery: 0.5,
    epic_battle: 0.55,
    emotional: 0.45,
    revelation: 0.5
  };
  return map[mood];
}

/**
 * BGM playback rate. Default 1.0 — generate beds at the right BPM and leave them alone.
 * Override with BGM_ATEMPO only for old sluggish library tracks.
 */
export function bgmAtempo(): number {
  const env = Number(process.env.BGM_ATEMPO);
  if (Number.isFinite(env) && env > 0) {
    return Math.min(1.25, Math.max(0.85, env));
  }
  return 1.0;
}

export type BgmFitPlan = {
  voiceDurationSeconds: number;
  bgmDurationSeconds: number;
  /** Loop BGM when it is shorter than the voice bed. */
  loop: boolean;
  /** Soft fade-out length on BGM at the end of the voice bed. */
  fadeOutSeconds: number;
  fadeOutStartSeconds: number;
};

export type BuildBgmFilterOptions = {
  /** Normalize the music bed to BGM_LOUDNORM_I before the quiet volume trim. Default true unless BGM_LOUDNORM=false. */
  normalizeBgm?: boolean;
  /**
   * Duck BGM against a separate narration input [2:a].
   * When true, filter expects: 0=voice bed, 1=BGM, 2=narration sidechain.
   */
  duckAgainstNarration?: boolean;
};

/**
 * Decide how BGM should fit the full voice/video length:
 * - shorter BGM → loop until voice ends (covers entire short)
 * - longer BGM → trim exactly to voice end
 */
export function planBgmFit(voiceDurationSeconds: number, bgmDurationSeconds: number): BgmFitPlan {
  if (!(voiceDurationSeconds > 0) || !Number.isFinite(voiceDurationSeconds)) {
    throw new Error(`Invalid voice duration: ${voiceDurationSeconds}`);
  }
  if (!(bgmDurationSeconds > 0) || !Number.isFinite(bgmDurationSeconds)) {
    throw new Error(`Invalid BGM duration: ${bgmDurationSeconds}`);
  }

  const loop = bgmDurationSeconds + 0.08 < voiceDurationSeconds;
  const fadeOutSeconds = Math.min(1.2, Math.max(0.3, voiceDurationSeconds * 0.035));
  const fadeOutStartSeconds = Math.max(0, voiceDurationSeconds - fadeOutSeconds);

  return {
    voiceDurationSeconds,
    bgmDurationSeconds,
    loop,
    fadeOutSeconds,
    fadeOutStartSeconds
  };
}

function envFlagTrue(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw !== 'false' && raw !== '0';
}

/** Build BGM graph: loop → tempo → trim → loudnorm → fade → volume → optional duck → mix → limit. */
export function buildBgmFilter(
  volume: number,
  fit: BgmFitPlan,
  atempo = bgmAtempo(),
  options: BuildBgmFilterOptions = {}
): string {
  const d = fit.voiceDurationSeconds.toFixed(4);
  const fadeStart = fit.fadeOutStartSeconds.toFixed(4);
  const fadeDur = fit.fadeOutSeconds.toFixed(4);
  const tempo = Math.min(1.25, Math.max(0.85, atempo));
  const normalizeBgm = options.normalizeBgm ?? envFlagTrue('BGM_LOUDNORM', true);
  const duck = options.duckAgainstNarration === true;

  // Order matters: atempo before atrim so sped-up beds still cover full narration.
  const bgmChain: string[] = [];
  if (fit.loop) bgmChain.push('aloop=loop=-1:size=2e+09');
  if (Math.abs(tempo - 1) > 0.01) bgmChain.push(`atempo=${tempo.toFixed(3)}`);
  bgmChain.push(`atrim=0:${d}`, 'asetpts=PTS-STARTPTS');
  if (normalizeBgm) bgmChain.push(`loudnorm=I=${BGM_LOUDNORM_I}:TP=-1.5:LRA=7`);
  bgmChain.push(
    'afade=t=in:st=0:d=0.2',
    `afade=t=out:st=${fadeStart}:d=${fadeDur}`,
    `volume=${volume.toFixed(4)}`
  );

  const parts: string[] = [];
  if (duck) {
    parts.push(`[1:a]${bgmChain.join(',')}[bgmpre]`);
    parts.push(`[2:a]aformat=sample_rates=44100:channel_layouts=stereo[sc]`);
    // A quiet narration track must still trigger ducking; never amplify the music afterward.
    parts.push(
      '[bgmpre][sc]sidechaincompress=threshold=0.035:ratio=4:attack=25:release=400:makeup=1:knee=4:detection=rms:link=average[bgm]'
    );
  } else {
    parts.push(`[1:a]${bgmChain.join(',')}[bgm]`);
  }

  parts.push(`[0:a]aformat=sample_rates=44100:channel_layouts=stereo[voice]`);
  // Equal weights — bed level is controlled only by volume= / duck, not a second cut.
  parts.push(`[voice][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]`);
  parts.push(`[mixed]alimiter=limit=0.95:attack=5:release=50:level=0[aout]`);
  return parts.join(';');
}

/**
 * Mix voice(+SFX) bed with BGM fitted to the full voice length, then soft limiter.
 * Short BGM loops to cover the entire short; long BGM is trimmed to the voice end.
 * When `narrationPath` is set, BGM ducks against clean narration (not SFX impacts).
 */
export async function mixWithBgm(options: {
  voicePath: string;
  mood: BgmMood;
  outputPath: string;
  bgmPath?: string;
  /** Clean narration for sidechain ducking (preferred over voicePath which may include SFX). */
  narrationPath?: string;
  cwd?: string;
  bgmVolume?: number;
  bgmAtempo?: number;
  normalizeBgm?: boolean;
  duckAgainstNarration?: boolean;
}): Promise<{ outputPath: string; bgmUsed?: string; fit?: BgmFitPlan }> {
  const cwd = options.cwd || process.cwd();
  await access(options.voicePath);
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const bgmPath = options.bgmPath || (await findAvailableBgm(options.mood, cwd));
  if (!bgmPath) {
    const ffmpeg = await resolveFfmpeg();
    await run(ffmpeg, [
      '-y',
      '-i',
      options.voicePath,
      '-ac',
      '2',
      '-ar',
      '44100',
      options.outputPath
    ]);
    return { outputPath: options.outputPath };
  }

  const voiceDurationSeconds = await probeAudioDuration(options.voicePath);
  const bgmDurationSeconds = await probeAudioDuration(bgmPath);
  const fit = planBgmFit(voiceDurationSeconds, bgmDurationSeconds);
  const volume = options.bgmVolume ?? bgmVolumeForMood(options.mood);
  const tempo = options.bgmAtempo ?? bgmAtempo();
  const duck =
    options.duckAgainstNarration ??
    (Boolean(options.narrationPath) && envFlagTrue('BGM_DUCK', true));
  const normalizeBgm = options.normalizeBgm ?? envFlagTrue('BGM_LOUDNORM', true);
  const ffmpeg = await resolveFfmpeg();
  const filter = buildBgmFilter(volume, fit, tempo, {
    normalizeBgm,
    duckAgainstNarration: duck && Boolean(options.narrationPath)
  });

  const loudnormTag = normalizeBgm ? ` loudnorm=${BGM_LOUDNORM_I}LUFS` : '';
  const duckTag = duck && options.narrationPath ? ' +duck' : '';
  if (fit.loop) {
    console.log(
      `BGM fit: ${bgmDurationSeconds.toFixed(1)}s track → loop full ${voiceDurationSeconds.toFixed(1)}s voice @ vol ${volume.toFixed(2)} tempo ${tempo.toFixed(2)}${loudnormTag}${duckTag}`
    );
  } else {
    console.log(
      `BGM fit: ${bgmDurationSeconds.toFixed(1)}s track → trim to full ${voiceDurationSeconds.toFixed(1)}s voice @ vol ${volume.toFixed(2)} tempo ${tempo.toFixed(2)}${loudnormTag}${duckTag}`
    );
  }

  const args = ['-y', '-i', options.voicePath, '-i', bgmPath];
  if (duck && options.narrationPath) {
    await access(options.narrationPath);
    args.push('-i', options.narrationPath);
  }
  args.push(
    '-filter_complex',
    filter,
    '-map',
    '[aout]',
    '-t',
    fit.voiceDurationSeconds.toFixed(4),
    '-ac',
    '2',
    '-ar',
    '44100',
    options.outputPath
  );

  await run(ffmpeg, args);
  return { outputPath: options.outputPath, bgmUsed: bgmPath, fit };
}
