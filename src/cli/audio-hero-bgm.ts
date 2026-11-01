#!/usr/bin/env node
/**
 * Generate hero-Reel BGM via ElevenLabs Music (paid — not for default library).
 *
 *   npm run audio:hero-bgm -- --episode id [--mood divine_mystery] [--prompt "..."] [--seconds 60]
 */
import '../lib/loadEnv.js';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { BgmMoodSchema, type BgmMood } from '../schema/audioPlan.js';
import {
  composeElevenLabsMusic,
  defaultHeroBgmPath,
  heroBgmPromptForMood
} from '../providers/elevenlabsMusic.js';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { resolveEpisodeNarrationAudio } from '../lib/selectedAssets.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return undefined;
}

async function resolveEpisodePath(raw?: string): Promise<string> {
  if (!raw) throw new Error('Usage: npm run audio:hero-bgm -- --episode <id>');
  if (raw.endsWith('.json') || raw.includes('/') || raw.includes('\\')) {
    await access(raw);
    return path.resolve(raw);
  }
  const { readdir } = await import('node:fs/promises');
  const dir = path.resolve('data/episodes');
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    if (file.toLowerCase().includes(raw.toLowerCase())) return path.join(dir, file);
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as { id?: string };
      if (parsed.id === raw) return path.join(dir, file);
    } catch {
      // continue
    }
  }
  throw new Error(`No episode matching "${raw}"`);
}

async function main() {
  const episodePath = await resolveEpisodePath(valueFor('--episode'));
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const moodRaw = valueFor('--mood') || episode.audioPlan?.bgmMood || 'divine_mystery';
  const mood = BgmMoodSchema.parse(moodRaw) as BgmMood;
  const extra = valueFor('--prompt');
  const prompt = heroBgmPromptForMood(mood, extra);

  let seconds = Number(valueFor('--seconds') || '');
  if (!Number.isFinite(seconds) || seconds <= 0) {
    try {
      const narration = await resolveEpisodeNarrationAudio({
        episodeId: episode.id,
        episodeFile: path.basename(episodePath)
      });
      seconds = (await probeAudioDuration(narration)) + 3;
    } catch {
      seconds = episode.targetDurationSeconds || 55;
    }
  }

  const out = valueFor('--output') || defaultHeroBgmPath(episode.id);
  console.log(`Hero BGM for ${episode.id} mood=${mood} length=${seconds}s`);
  console.log(`Prompt: ${prompt.slice(0, 120)}…`);
  const pathOut = await composeElevenLabsMusic({
    prompt,
    musicLengthMs: Math.round(seconds * 1000),
    outputPath: path.resolve(out)
  });
  console.log(`Saved → ${pathOut}`);
  console.log('Use with: npm run audio:mix -- --episode ' + episode.id + ' --hero-bgm');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
