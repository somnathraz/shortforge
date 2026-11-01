#!/usr/bin/env node
/**
 * Mux an externally uploaded video with this episode's selected audio.
 * Usage: npm run mux:external -- --episode id --video output/external/<id>/source.mp4 --audio output/audio/<id>-….mp3
 */
import '../lib/loadEnv.js';
import { access, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { muxExternalVideoWithAudio } from '../pipeline/muxExternal.js';
import {
  resolveAudioCandidate,
  resolveOutputPath,
  toOutputRelative
} from '../lib/selectedAssets.js';
import {
  assertAssetBelongsToEpisode,
  assertExternalVideoPath
} from '../lib/episodeAssetGuard.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function resolveEpisodePath(raw?: string): Promise<string> {
  if (!raw) {
    throw new Error(
      'Usage: npm run mux:external -- --episode <id|file.json> --video <path> --audio <path>'
    );
  }
  if (raw.endsWith('.json') || raw.includes('/') || raw.includes('\\')) {
    await access(raw);
    return path.resolve(raw);
  }
  const { readdir } = await import('node:fs/promises');
  const dir = path.resolve('data/episodes');
  const files = await readdir(dir);
  const needle = raw.toLowerCase();
  const byName = files.find((f) => f.toLowerCase().includes(needle) && f.endsWith('.json'));
  if (byName) return path.join(dir, byName);

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as { id?: string };
      if (parsed.id === raw) return path.join(dir, file);
    } catch {
      // continue
    }
  }
  throw new Error(`No episode matching "${raw}" in ${dir}`);
}

async function main(): Promise<void> {
  const episodePath = await resolveEpisodePath(valueFor('--episode'));
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);

  const videoRaw = valueFor('--video');
  const audioRaw = valueFor('--audio');
  if (!videoRaw?.trim() || !audioRaw?.trim()) {
    throw new Error('Both --video and --audio are required (no cross-episode fallback).');
  }

  const videoRel = assertExternalVideoPath(videoRaw, episode.id);
  const videoPath = resolveOutputPath(videoRel);
  if (!videoPath) throw new Error(`Invalid video path: ${videoRaw}`);
  await access(videoPath);

  const audioAbs = await resolveAudioCandidate(audioRaw);
  if (!audioAbs) throw new Error(`Audio not found: ${audioRaw}`);
  const audioRel =
    toOutputRelative(audioAbs) || assertAssetBelongsToEpisode(audioAbs, episode.id, 'Audio');
  assertAssetBelongsToEpisode(audioRel, episode.id, 'Audio');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outRel = `final/${episode.id}-external-mux-${stamp}.mp4`;
  const outputPath = path.resolve('output', outRel);
  await mkdir(path.dirname(outputPath), { recursive: true });

  console.log(`Episode: ${episode.id}`);
  console.log(`Video:   ${videoRel}`);
  console.log(`Audio:   ${audioRel}`);
  console.log(`Output:  ${outRel}`);

  await muxExternalVideoWithAudio({
    episode,
    videoPath,
    audioPath: audioAbs,
    outputPath
  });

  console.log(`Muxed Short: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
