#!/usr/bin/env node
/**
 * Mix narration + SFX (+ BGM) from Sound Director plan.
 * Usage: npm run audio:mix -- --episode id [--audio path] [--bgm path] [--skip-sfx] [--plan] [--hero-bgm]
 */
import '../lib/loadEnv.js';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { mixEpisodeAudio } from '../audio/mix-episode.js';
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
      'Usage: npm run audio:mix -- --episode <id> [--audio out.mp3] [--bgm assets/audio/bgm/...] [--skip-sfx] [--plan] [--hero-bgm]'
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

  const narrationPath = await resolveEpisodeNarrationAudio({
    episodeId: episode.id,
    episodeFile: path.basename(episodePath),
    ...(valueFor('--audio') ? { explicitAudio: valueFor('--audio')! } : {})
  });

  console.log(`Audio mix for ${episode.id}`);
  console.log(`Narration: ${narrationPath}`);

  const result = await mixEpisodeAudio({
    episode,
    narrationPath,
    episodePath,
    autoPlan: args.includes('--plan') || process.env.AUDIO_AUTO_PLAN === 'true',
    heroBgm: args.includes('--hero-bgm') || process.env.HERO_REEL === 'true',
    // Opt-in only — env alone must not auto-generate on mix miss.
    allowElevenLabsSfx: args.includes('--elevenlabs-sfx'),
    ...(valueFor('--bgm') ? { bgmPath: valueFor('--bgm')! } : {}),
    skipSfx: args.includes('--skip-sfx'),
    ...(valueFor('--hero-prompt') ? { heroBgmPrompt: valueFor('--hero-prompt')! } : {}),
    ...(valueFor('--provider') ? { provider: valueFor('--provider')! } : {})
  });

  console.log(`SFX mix: ${result.sfxMixPath}`);
  console.log(`Final mix: ${result.finalMixPath}`);
  if (result.bgmUsed) console.log(`BGM: ${result.bgmUsed}`);
  if (result.plan.heroBgm) console.log('Hero BGM: ElevenLabs Music');
  console.log(`Timing: ${result.plan.timingSource || 'n/a'}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
