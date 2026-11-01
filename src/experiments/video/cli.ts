#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { EpisodeSchema } from '../../schema/episode.js';
import { resolveEpisodeNarrationAudio } from '../../lib/selectedAssets.js';
import { createExperimentPlan, resolveExperimentImages } from './plan.js';
import { modelNamed } from './models.js';
import { FalVideoProvider } from './fal.js';
import { compareExperiments, runExperiment, saveJson } from './runner.js';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    episode: { type: 'string' }, model: { type: 'string', default: 'kling' }, audio: { type: 'string' },
    'images-dir': { type: 'string' }, 'output-root': { type: 'string' }, limit: { type: 'string' },
    'usd-per-second': { type: 'string' }, 'no-subs': { type: 'boolean' }, help: { type: 'boolean' }
  } });
  const command = positionals[0] || 'plan';
  if (values.help) {
    console.log('video:experiment plan|run|assemble --episode file.json --model kling|ltx [--audio mix.wav] [--limit 1] [--usd-per-second RATE]\nvideo:experiment compare report1.json report2.json\nPlan is offline. Run submits paid requests. Assemble uses local clips only. Same inputs resume the same run.'); return;
  }
  if (command === 'compare') {
    if (positionals.length < 3) throw new Error('compare needs at least two report.json paths');
    console.table(await compareExperiments(positionals.slice(1))); return;
  }
  if (!['plan', 'run', 'assemble'].includes(command) || positionals.length > 1) throw new Error('Choose plan | run | assemble | compare');
  if (!values.episode) throw new Error('Supply --episode path/to/episode.json (see --help)');
  const model = modelNamed(values.model!);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(values.episode, 'utf8')));
  if (!/^[a-zA-Z0-9_-]+$/.test(episode.id)) throw new Error('Episode ID must contain only letters, digits, hyphens or underscores');
  const images = await resolveExperimentImages(episode, values.episode, values['images-dir']);
  let audioPath: string | undefined;
  if (values.audio) {
    audioPath = path.resolve(values.audio);
    await readFile(audioPath); // Explicit missing audio must never fall back to another recording.
  } else {
    try { audioPath = await resolveEpisodeNarrationAudio({ episodeId: episode.id, episodeFile: path.basename(values.episode) }); }
    catch (error) { if (command !== 'plan') throw error; }
  }
  const plan = await createExperimentPlan({ episode, images, model,
    ...(audioPath ? { audioPath } : {}),
    ...(values['usd-per-second'] !== undefined ? { rateUsdPerSecond: Number(values['usd-per-second']) } : {}) });
  const directory = path.resolve(values['output-root'] || 'output/experiments/video', episode.id, `${model}-${plan.runId}`);
  console.log(`${model}: ${episode.scenes.length} images → ${plan.shots.length} clips → ${plan.durationSeconds.toFixed(2)}s`);
  console.log(`Generation requested: ${plan.shots.reduce((n, s) => n + s.generationSeconds, 0)}s; estimate: ${plan.estimatedCostUsd === null ? 'unknown (supply current --usd-per-second)' : '$' + plan.estimatedCostUsd.toFixed(2)}`);
  if (command === 'plan') {
    await saveJson(path.join(directory, 'preview.json'), plan);
    console.log(`Offline preview: ${directory}/preview.json${audioPath ? '' : '\nPlanned timing only: supply narration before running.'}`);
    return;
  }
  const report = await runExperiment(plan, directory, {
    mode: command as 'run' | 'assemble',
    ...(command === 'run' ? { provider: new FalVideoProvider(process.env.FAL_KEY || '') } : {}),
    ...(values.limit !== undefined ? { limit: Number(values.limit) } : {}), burnSubtitles: !values['no-subs']
  });
  console.log(`${report.status}: ${directory}/report.json`);
  if (report.finalPath) console.log(`Final: ${report.finalPath}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
