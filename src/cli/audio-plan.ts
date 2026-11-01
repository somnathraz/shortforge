#!/usr/bin/env node
/**
 * Sound Director — LLM audio plan (BGM mood + timed SFX cues).
 * Usage: npm run audio:plan -- --episode janmashtami-001 [--audio narration.mp3]
 */
import '../lib/loadEnv.js';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { planEpisodeAudio } from '../audio/sound-director.js';
import { AudioPlanSchema } from '../schema/audioPlan.js';
import { resolveEpisodeNarrationAudio } from '../lib/selectedAssets.js';

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
      'Usage: npm run audio:plan -- --episode data/episodes/file.json | <episode-id> [--audio path]'
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
  const raw = JSON.parse(await readFile(episodePath, 'utf8')) as unknown;
  const episode = EpisodeSchema.parse(raw);
  const provider = valueFor('--provider');

  let narrationPath: string | undefined = valueFor('--audio');
  if (!narrationPath && !args.includes('--no-audio')) {
    try {
      narrationPath = await resolveEpisodeNarrationAudio({
        episodeId: episode.id,
        episodeFile: path.basename(episodePath)
      });
    } catch {
      narrationPath = undefined;
    }
  }

  console.log(`Sound Director: planning audio for ${episode.id}`);
  if (narrationPath) console.log(`Narration clock: ${narrationPath}`);
  const { plan, planPath, timeline } = await planEpisodeAudio({
    episode,
    episodePath,
    ...(narrationPath ? { narrationPath } : {}),
    ...(provider ? { provider } : {}),
    persistOnEpisode: !args.includes('--no-episode-write')
  });

  AudioPlanSchema.parse(plan);
  console.log(`Plan: ${planPath}`);
  console.log(`Timing: ${timeline.method} (${timeline.narrationDurationSeconds}s)`);
  console.log(`BGM mood: ${plan.bgmMood}`);
  for (const cue of plan.sfx) {
    console.log(`  ${cue.time.toFixed(2)}s  ${cue.effect}  vol=${cue.volume}  — ${cue.reason}`);
  }
  console.log('Next: npm run audio:mix -- --episode ' + episode.id);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
