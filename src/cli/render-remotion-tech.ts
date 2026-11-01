#!/usr/bin/env node
/**
 * Remotion silent teaching video for tech episodes.
 * FFmpeg (produce / assemble) muxes narration afterward.
 *
 * Usage:
 *   npm run remotion:big-o
 *   npm run remotion:episode -- --episode data/episodes-tech/1792080056105-big-o-time-and-space-complexity.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import {
  remotionSilentPath,
  renderRemotionTechSilent
} from '../remotion/renderTechEpisode.js';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const episodeArg =
    argValue('--episode') ||
    process.env.REMOTION_EPISODE_JSON ||
    'data/episodes-tech/1792080056105-big-o-time-and-space-complexity.json';
  const absolute = path.resolve(process.cwd(), episodeArg);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(absolute, 'utf8')));
  const outputPath = path.resolve(
    process.cwd(),
    argValue('--out') || remotionSilentPath(episode.id)
  );

  const rendered = await renderRemotionTechSilent({
    episode,
    episodeJsonPath: absolute,
    outputPath
  });
  console.log('Done:', rendered);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
