#!/usr/bin/env node
import '../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import { EpisodeSchema } from '../schema/episode.js';
import { synthesizeHindiFree } from '../providers/edgeTts.js';
import { buildHindiTtsScript, resolveSpokenHook } from '../lib/ttsScript.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  const directText = valueFor('--text');
  const outputPath = valueFor('--output');
  if (!episodePath && !directText) {
    throw new Error(
      'Usage: npm run tts:free -- --episode data/episodes/file.json [--output narration.mp3]'
    );
  }

  let narration = directText;
  let defaultOut: string | undefined;
  if (episodePath) {
    const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
    narration = buildHindiTtsScript(episode);
    defaultOut = `output/audio/${episode.id}-edge-${Date.now()}.mp3`;
    if (resolveSpokenHook(episode)) {
      console.log('TTS includes spokenHook before scenes (title is not spoken)');
    }
  }
  const destination = await synthesizeHindiFree(narration || '', outputPath || defaultOut);
  console.log(`Created: ${destination}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
