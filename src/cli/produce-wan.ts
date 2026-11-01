#!/usr/bin/env node
import '../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { resolveEpisodeNarrationAudio } from '../lib/selectedAssets.js';
import { buildHindiTtsScript } from '../lib/ttsScript.js';
import { synthesizeHindiFree } from '../providers/edgeTts.js';
import { mixEpisodeAudio } from '../audio/mix-episode.js';
import { produceWan } from '../pipeline/produceWan.js';
const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
async function main() {
  const episodePath = value('--episode');
  if (!episodePath) throw new Error('Usage: npm run produce:wan -- --episode file.json [--plan-only] [--audio file.mp3 | --tts] [--reuse-only] [--fallback-still]');
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')));
  const planOnly = args.includes('--plan-only');
  let audioPath = value('--audio');
  if (!planOnly && !audioPath) {
    audioPath = args.includes('--tts')
      ? await synthesizeHindiFree(buildHindiTtsScript(episode), path.resolve('output/audio', `${episode.id}-wan-narration.mp3`))
      : await resolveEpisodeNarrationAudio({ episodeId: episode.id, episodeFile: path.basename(episodePath) });
  }
  if (!planOnly && audioPath && !args.includes('--no-audio-mix') && !value('--audio')) {
    const mix = await mixEpisodeAudio({ episode, narrationPath: audioPath, episodePath, autoPlan: true });
    audioPath = mix.finalMixPath;
  }
  console.log(JSON.stringify(await produceWan({ episode, planOnly,
    ...(audioPath ? { audioPath } : {}), ...(value('--output-dir') ? { outputDir: value('--output-dir')! } : {}),
    maxAttempts: Number(value('--attempts') || '2'), reuseOnly: args.includes('--reuse-only'),
    fallbackStill: args.includes('--fallback-still'), burnSubtitles: !args.includes('--no-subs')
  }), null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
