#!/usr/bin/env node
/**
 * Ingest a downloaded SFX/BGM file: ffprobe → normalize/convert → library path → .meta.json
 *
 * SFX:
 *   npm run audio:add -- --file ~/Downloads/bell.wav --id temple-bell --source mixkit --url "https://..."
 *
 * BGM:
 *   npm run audio:add -- --file ~/Downloads/ambient.mp3 --mood divine_mystery --id divine-01 --source pixabay --url "https://..."
 *
 * Custom one-off (ElevenLabs / special):
 *   npm run audio:add -- --file ./lock.wav --custom divine-prison-lock --source elevenlabs
 */
import '../lib/loadEnv.js';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeAssetMeta } from '../audio/asset-meta.js';
import { probeAudio } from '../audio/ffprobe.js';
import { convertToWav, normalizeToWav } from '../audio/normalize-audio.js';
import {
  BGM_MOOD_DIRS,
  SFX_LIBRARY,
  bgmMoodDir,
  customSfxDir,
  sfxRootDir
} from '../audio/sfx-library.js';
import type { BgmMood } from '../schema/audioPlan.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const file = arg('--file');
  if (!file) {
    console.error(
      'Usage:\n' +
        '  audio:add --file <path> --id <sfx-id> [--source mixkit] [--url URL] [--normalize]\n' +
        '  audio:add --file <path> --mood <bgmMood> --id <track-id> [--source pixabay] [--url URL]\n' +
        '  audio:add --file <path> --custom <name> [--source elevenlabs]'
    );
    process.exit(1);
  }

  const id = arg('--id');
  const customName = arg('--custom');
  const mood = arg('--mood') as BgmMood | undefined;
  const source = arg('--source') || 'mixkit';
  const sourceUrl = arg('--url') || '';
  const contentId = has('--content-id');
  const doNormalize = has('--normalize');
  const cwd = process.cwd();
  const absSrc = path.resolve(file);
  const downloadedAt = new Date().toISOString().slice(0, 10);

  const probe = await probeAudio(absSrc);
  console.log(
    `Probe: ${probe.durationSeconds.toFixed(2)}s  ${probe.codec || '?'}  ${probe.sampleRate || '?'}Hz`
  );

  let dest: string;
  let metaCategory: string;
  let relativeForMeta: string;
  let assetId: string;

  if (mood) {
    if (!(mood in BGM_MOOD_DIRS)) {
      throw new Error(`Unknown mood: ${mood}. Use: ${Object.keys(BGM_MOOD_DIRS).join(', ')}`);
    }
    assetId = id || path.basename(absSrc, path.extname(absSrc));
    const dir = bgmMoodDir(mood, cwd);
    await mkdir(dir, { recursive: true });
    // Keep mp3 for BGM beds (smaller); convert only if --wav
    if (has('--wav') || path.extname(absSrc).toLowerCase() === '.wav') {
      dest = path.join(dir, `${assetId}.wav`);
      if (doNormalize) await normalizeToWav(absSrc, dest, { peak: 0.9 });
      else await convertToWav(absSrc, dest);
    } else {
      dest = path.join(dir, `${assetId}${path.extname(absSrc).toLowerCase() || '.mp3'}`);
      await copyFile(absSrc, dest);
    }
    metaCategory = mood;
    relativeForMeta = path.join(BGM_MOOD_DIRS[mood], path.basename(dest));
  } else if (customName) {
    assetId = customName.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const dir = customSfxDir(cwd);
    await mkdir(dir, { recursive: true });
    dest = path.join(dir, `${assetId}.wav`);
    if (doNormalize) await normalizeToWav(absSrc, dest, { maxSeconds: 8 });
    else await convertToWav(absSrc, dest, { maxSeconds: 8 });
    metaCategory = 'custom';
    relativeForMeta = path.join('custom', `${assetId}.wav`);
  } else {
    if (!id) throw new Error('SFX requires --id (e.g. temple-bell) or --custom <name>');
    const entry = SFX_LIBRARY.find((e) => e.id === id);
    if (!entry) throw new Error(`Unknown SFX id: ${id}. Use --custom for one-offs.`);
    assetId = id;
    dest = path.join(sfxRootDir(cwd), entry.relativePath);
    await mkdir(path.dirname(dest), { recursive: true });
    if (doNormalize) await normalizeToWav(absSrc, dest, { maxSeconds: 8 });
    else await convertToWav(absSrc, dest, { maxSeconds: 8 });
    metaCategory = entry.category;
    relativeForMeta = entry.relativePath;
  }

  const after = await probeAudio(dest);
  const metaPath = await writeAssetMeta(dest, {
    id: assetId,
    file: relativeForMeta,
    category: metaCategory,
    source,
    sourceUrl,
    downloadedAt,
    commercialUse: true,
    contentId,
    durationSeconds: Number(after.durationSeconds.toFixed(3)),
    ...(after.sampleRate ? { sampleRate: after.sampleRate } : {}),
    ...(after.channels ? { channels: after.channels } : {}),
    ...(after.codec ? { codec: after.codec } : {}),
    normalized: doNormalize
  });

  console.log(`Saved → ${path.relative(cwd, dest)}`);
  console.log(`Meta  → ${path.relative(cwd, metaPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
