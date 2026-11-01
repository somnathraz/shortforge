#!/usr/bin/env node
/**
 * EpicAstra Wan scene video CLI — same service layer as the UI.
 *
 *   npm run wan:health
 *   npm run wan:scene -- --episode data/episodes/file.json --scene 4
 *   npm run wan:batch -- --episode data/episodes/file.json
 *   npm run wan:retry -- --episode data/episodes/file.json
 */
import '../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { resolveVideoProvider } from '../providers/videoGeneration.js';
import {
  buildSceneVideoStatus,
  generateEpisodeVideos,
  generateSceneVideo
} from '../pipeline/sceneVideo.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function command(): string {
  // npm run wan:scene → argv often includes the script path; detect by npm_lifecycle_event
  const life = process.env.npm_lifecycle_event || '';
  if (life.startsWith('wan:')) return life.slice('wan:'.length);
  if (args.includes('--health') || args[0] === 'health') return 'health';
  if (args.includes('--retry') || args[0] === 'retry') return 'retry';
  if (args.includes('--batch') || args[0] === 'batch') return 'batch';
  if (args.includes('--scene') || args[0] === 'scene') return 'scene';
  return args[0] || 'help';
}

async function main(): Promise<void> {
  const cmd = command();

  if (cmd === 'health' || args.includes('--health')) {
    const provider = resolveVideoProvider();
    const url = await provider.health();
    console.log(`Wan provider=${provider.id} ready at ${url}`);
    return;
  }

  if (cmd === 'help' || args.includes('--help')) {
    console.log(
      [
        'EpicAstra Wan renderer',
        '  npm run wan:health',
        '  npm run wan:scene -- --episode data/episodes/file.json --scene 4 [--force]',
        '  npm run wan:batch -- --episode data/episodes/file.json [--force]',
        '  npm run wan:retry -- --episode data/episodes/file.json'
      ].join('\n')
    );
    return;
  }

  const episodePath = valueFor('--episode');
  if (!episodePath) throw new Error('Pass --episode data/episodes/file.json');
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const episodeFile = path.basename(episodePath);
  const force = args.includes('--force');

  if (cmd === 'scene') {
    const sceneId = Number(valueFor('--scene'));
    if (!Number.isFinite(sceneId) || sceneId < 1) throw new Error('Pass --scene N');
    console.log(`Wan scene ${sceneId} for ${episode.id}…`);
    const record = await generateSceneVideo({
      episode,
      episodeFile,
      sceneId,
      force: force || true
    });
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (cmd === 'batch') {
    console.log(`Wan batch (AI_VIDEO) for ${episode.id}…`);
    const state = await generateEpisodeVideos({
      episode,
      episodeFile,
      mode: 'all',
      force,
      onStatus: (s) => {
        const b = s.batch;
        if (b?.currentSceneId) {
          console.log(
            `[${b.completed + b.failed}/${b.total}] scene ${b.currentSceneId}…`
          );
        }
      }
    });
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (cmd === 'retry') {
    console.log(`Wan retry failed/stale/missing for ${episode.id}…`);
    const state = await generateEpisodeVideos({
      episode,
      episodeFile,
      mode: 'retry',
      force: false
    });
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (cmd === 'status') {
    console.log(JSON.stringify(await buildSceneVideoStatus(episode, episodeFile), null, 2));
    return;
  }

  throw new Error(`Unknown wan command: ${cmd}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
