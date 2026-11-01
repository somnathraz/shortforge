#!/usr/bin/env node
/**
 * Generate SFX into the library via ElevenLabs Sound Effects API.
 *
 *   npm run audio:gen-sfx -- --only divine,nature
 *   npm run audio:gen-sfx -- --id temple-bell
 *   npm run audio:gen-sfx -- --ids temple-bell,shankh --to-custom --force
 *   npm run audio:gen-sfx -- --all
 *
 * Default writes into the library path. `--to-custom` saves under sfx/custom/
 * so Mixkit library stays intact and episode upgrades reuse custom next mix.
 * Skips existing files unless --force. Writes .meta.json beside each WAV.
 */
import '../lib/loadEnv.js';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SFX_LIBRARY, customSfxPath, resolveSfxPath, sfxRootDir, type SfxCategory } from '../audio/sfx-library.js';
import type { SfxEffectId } from '../schema/audioPlan.js';
import { SFX_EFFECT_IDS } from '../schema/audioPlan.js';

const PROMPTS: Record<
  SfxEffectId,
  { text: string; durationSeconds: number; loop?: boolean }
> = {
  'deep-boom': {
    text: 'Deep cinematic boom hit, trailer braam, short powerful low-frequency impact, no music',
    durationSeconds: 1.2
  },
  impact: {
    text: 'Short heavy cinematic impact hit, punchy thud, clean, no music',
    durationSeconds: 0.6
  },
  whoosh: {
    text: 'Fast air whoosh swoosh transition, short motion sound, no music',
    durationSeconds: 0.5
  },
  riser: {
    text: 'Cinematic tension riser building upward, suspenseful whoosh rise, no music melody',
    durationSeconds: 1.8
  },
  'transition-whoosh': {
    text: 'Soft gentle whoosh for scene transition, airy swipe, no music',
    durationSeconds: 0.45
  },
  'divine-chime': {
    text: 'Soft magical divine chimes, sparkling sacred bells cluster, ethereal, no music',
    durationSeconds: 1.5
  },
  'temple-bell': {
    text: 'Single large temple brass bell ring with long resonant decay, sacred, no music',
    durationSeconds: 2.0
  },
  shankh: {
    text: 'Indian conch shell shankh horn blast, sacred temple call, resonant, no music',
    durationSeconds: 1.8
  },
  'magical-sparkle': {
    text: 'Soft magical sparkle glitter shimmer fairy dust, delicate, no music',
    durationSeconds: 1.0
  },
  thunder: {
    text: 'Distant thunder rumble with crack, stormy, cinematic, no music',
    durationSeconds: 2.2
  },
  rain: {
    text: 'Light steady rain ambience, soft rainfall, no thunder, no music',
    durationSeconds: 3.0,
    loop: true
  },
  wind: {
    text: 'Gentle night wind ambience blowing through trees, soft, no music',
    durationSeconds: 3.0,
    loop: true
  },
  river: {
    text: 'Flowing river stream water ambience, calm Yamuna-like river, no music',
    durationSeconds: 3.0,
    loop: true
  },
  fire: {
    text: 'Campfire crackle and torch flames, close-up fire ambience, no music',
    durationSeconds: 2.5,
    loop: true
  },
  'sword-clash': {
    text: 'Two swords clash metallic ring, sharp weapon hit, short, no music',
    durationSeconds: 0.7
  },
  arrow: {
    text: 'Bow arrow release with air whoosh, archery shot, short, no music',
    durationSeconds: 0.55
  },
  'heavy-impact': {
    text: 'Heavy stone door slam or massive impact thud, deep, short, no music',
    durationSeconds: 0.9
  },
  'wing-flap': {
    text: 'Large bird wings flapping, powerful Garuda-like wing beats, no music',
    durationSeconds: 1.0
  }
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-1500) || `${command} exited ${code}`));
    });
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateSoundEffect(
  apiKey: string,
  text: string,
  durationSeconds: number,
  loop: boolean | undefined,
  mp3Path: string
): Promise<void> {
  const response = await fetch(
    'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds,
        prompt_influence: 0.45,
        model_id: 'eleven_text_to_sound_v2',
        ...(loop ? { loop: true } : {})
      })
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs SFX ${response.status}: ${err.slice(0, 400)}`);
  }
  await mkdir(path.dirname(mp3Path), { recursive: true });
  await writeFile(mp3Path, Buffer.from(await response.arrayBuffer()));
}

async function mp3ToWav(mp3Path: string, wavPath: string): Promise<void> {
  await mkdir(path.dirname(wavPath), { recursive: true });
  await run('ffmpeg', ['-y', '-i', mp3Path, '-ac', '2', '-ar', '44100', wavPath]);
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required');

  const force = has('--force');
  const toCustom = has('--to-custom');
  const onlyId = arg('--id') as SfxEffectId | undefined;
  const idsRaw = arg('--ids') || '';
  const onlyIds = idsRaw
    .split(/[,+\s]+/)
    .map((s) => s.trim())
    .filter(Boolean) as SfxEffectId[];
  const onlyCats = (arg('--only') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as SfxCategory[];
  const all = has('--all');

  if (!onlyId && onlyIds.length === 0 && onlyCats.length === 0 && !all) {
    console.error(
      'Usage:\n' +
        '  npm run audio:gen-sfx -- --only divine,nature\n' +
        '  npm run audio:gen-sfx -- --id temple-bell\n' +
        '  npm run audio:gen-sfx -- --ids temple-bell,shankh --to-custom --force\n' +
        '  npm run audio:gen-sfx -- --all [--force]'
    );
    process.exit(1);
  }

  for (const id of onlyIds) {
    if (!SFX_EFFECT_IDS.includes(id)) {
      throw new Error(`Unknown SFX id: ${id}`);
    }
  }

  const cwd = process.cwd();
  const rawDir = path.join(sfxRootDir(cwd), '_el-raw');
  await mkdir(rawDir, { recursive: true });

  const targets = SFX_LIBRARY.filter((entry) => {
    if (onlyId) return entry.id === onlyId;
    if (onlyIds.length) return onlyIds.includes(entry.id);
    if (onlyCats.length) return onlyCats.includes(entry.category);
    return true;
  });

  if (targets.length === 0) throw new Error('No matching SFX ids');

  console.log(
    `Generating ${targets.length} SFX via ElevenLabs${toCustom ? ' → custom/' : ' → library'}…`
  );
  for (const entry of targets) {
    const dest = toCustom ? customSfxPath(entry.id, cwd) : resolveSfxPath(entry.id, cwd);
    if (!force && (await exists(dest))) {
      console.log(`  skip ${entry.id} (exists; use --force to overwrite)`);
      continue;
    }
    const prompt = PROMPTS[entry.id];
    const mp3Path = path.join(rawDir, `${entry.id}.mp3`);
    process.stdout.write(`  → ${entry.id} … `);
    await generateSoundEffect(
      apiKey,
      prompt.text,
      prompt.durationSeconds,
      prompt.loop,
      mp3Path
    );
    await mp3ToWav(mp3Path, dest);
    await writeFile(
      `${dest}.meta.json`,
      `${JSON.stringify(
        {
          id: entry.id,
          file: toCustom ? `custom/${entry.id}.wav` : entry.relativePath,
          category: toCustom ? 'custom' : entry.category,
          source: 'elevenlabs',
          sourceUrl: 'https://api.elevenlabs.io/v1/sound-generation',
          prompt: prompt.text,
          durationSeconds: prompt.durationSeconds,
          downloadedAt: new Date().toISOString().slice(0, 10),
          commercialUse: true,
          contentId: false,
          note: toCustom
            ? 'Episode-approved ElevenLabs override; preferred over Mixkit library on mix'
            : undefined
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    console.log('ok');
  }
  console.log('Done.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
