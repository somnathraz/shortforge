#!/usr/bin/env node
/**
 * Generate placeholder WAV stubs for the SFX/BGM library (dev/MVP).
 * Replace with licensed packs for production — filenames stay the same.
 *
 * Usage: npm run audio:seed-placeholders
 */
import '../lib/loadEnv.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SFX_LIBRARY, bgmRootDir, sfxRootDir } from '../audio/sfx-library.js';
import type { BgmMood } from '../schema/audioPlan.js';

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
      else reject(new Error(stderr.trim().slice(-1500) || `${command} exited ${code}`));
    });
  });
}

type ToneSpec = { freq: number; duration: number; volume: number; noise?: boolean };

const SFX_TONES: Record<string, ToneSpec> = {
  'deep-boom': { freq: 55, duration: 0.55, volume: 0.7 },
  impact: { freq: 90, duration: 0.25, volume: 0.65 },
  whoosh: { freq: 420, duration: 0.35, volume: 0.35, noise: true },
  riser: { freq: 220, duration: 1.4, volume: 0.4 },
  'transition-whoosh': { freq: 380, duration: 0.28, volume: 0.3, noise: true },
  'divine-chime': { freq: 880, duration: 0.9, volume: 0.45 },
  'temple-bell': { freq: 660, duration: 1.2, volume: 0.4 },
  shankh: { freq: 310, duration: 1.1, volume: 0.5 },
  'magical-sparkle': { freq: 1200, duration: 0.5, volume: 0.3 },
  thunder: { freq: 70, duration: 1.5, volume: 0.45, noise: true },
  rain: { freq: 0, duration: 2.0, volume: 0.2, noise: true },
  wind: { freq: 0, duration: 2.0, volume: 0.18, noise: true },
  river: { freq: 0, duration: 2.0, volume: 0.18, noise: true },
  fire: { freq: 0, duration: 1.5, volume: 0.2, noise: true },
  'sword-clash': { freq: 1400, duration: 0.2, volume: 0.55 },
  arrow: { freq: 900, duration: 0.18, volume: 0.4 },
  'heavy-impact': { freq: 60, duration: 0.4, volume: 0.7 },
  'wing-flap': { freq: 180, duration: 0.35, volume: 0.35, noise: true }
};

const BGM_MOODS: BgmMood[] = [
  'divine_mystery',
  'dark_mystery',
  'epic_battle',
  'emotional',
  'revelation'
];

async function writeTone(outPath: string, spec: ToneSpec): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  if (spec.noise || spec.freq <= 0) {
    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anoisesrc=color=pink:amplitude=${spec.volume}:duration=${spec.duration}:sample_rate=44100`,
      '-ac',
      '2',
      outPath
    ]);
    return;
  }
  // Soft sine with fade — placeholder only
  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${spec.freq}:duration=${spec.duration}:sample_rate=44100`,
    '-af',
    `volume=${spec.volume},afade=t=in:st=0:d=0.02,afade=t=out:st=${Math.max(0, spec.duration - 0.12)}:d=0.12`,
    '-ac',
    '2',
    outPath
  ]);
}

async function writeBgm(outPath: string, mood: BgmMood): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const freq =
    mood === 'epic_battle' ? 90 : mood === 'dark_mystery' ? 70 : mood === 'emotional' ? 220 : 110;
  // Quiet loopable pad (~8s)
  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${freq}:duration=8:sample_rate=44100`,
    '-af',
    'volume=0.15,afade=t=in:st=0:d=0.5,afade=t=out:st=7.2:d=0.8',
    '-ac',
    '2',
    outPath
  ]);
}

async function main(): Promise<void> {
  await run('ffmpeg', ['-version']).catch(() => {
    throw new Error('ffmpeg is required. Install with: brew install ffmpeg');
  });

  const sfxRoot = sfxRootDir();
  console.log(`Seeding SFX under ${sfxRoot}`);
  for (const entry of SFX_LIBRARY) {
    const out = path.join(sfxRoot, entry.relativePath);
    const tone = SFX_TONES[entry.id] || { freq: 440, duration: 0.4, volume: 0.4 };
    await writeTone(out, tone);
    console.log(`  ${entry.relativePath}`);
  }

  const bgmRoot = bgmRootDir();
  console.log(`Seeding BGM under ${bgmRoot}`);
  for (const mood of BGM_MOODS) {
    const nameMap: Record<BgmMood, string> = {
      divine_mystery: 'divine-mystery.wav',
      dark_mystery: 'dark-mystery.wav',
      epic_battle: 'epic-battle.wav',
      emotional: 'emotional.wav',
      revelation: 'revelation.wav'
    };
    const out = path.join(bgmRoot, nameMap[mood]);
    await writeBgm(out, mood);
    console.log(`  ${nameMap[mood]}`);
  }

  console.log('Done. Replace placeholders with licensed SFX/BGM when ready (keep filenames).');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
