import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { EpisodeSchema } from '../schema/episode.js';
import { createExperimentPlan, resolveExperimentImages } from '../experiments/video/plan.js';
import { runExperiment, ReportSchema, saveJson } from '../experiments/video/runner.js';
import { FalVideoProvider } from '../experiments/video/fal.js';
import { resolveEpisodeNarrationAudio } from '../lib/selectedAssets.js';
import { getEpisodeDetail } from './episodes.js';
import { episodesDir, outputDir } from './paths.js';

export const ExperimentActionSchema = z.object({
  action: z.enum(['plan', 'test', 'run', 'assemble']), model: z.enum(['kling', 'ltx']),
  runId: z.string().regex(/^[a-f0-9]{16}$/).optional()
}).strict();
const active = new Set<string>();
const failures = new Map<string, string>();
function experimentRoot(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid episode ID');
  return path.join(outputDir(), 'experiments/video', id);
}
const mediaUrl = (file: string) => `/api/media/${path.relative(outputDir(), file).split(path.sep).map(encodeURIComponent).join('/')}`;

export async function experimentStatus(file: string) {
  const detail = await getEpisodeDetail(file);
  const root = experimentRoot(detail.episode.id);
  const directories = await readdir(root).catch(() => [] as string[]);
  const runs = [];
  for (const name of directories.filter(n => /^(kling|ltx)-[a-f0-9]{16}$/.test(n))) {
    const dir = path.join(root, name);
    const reportFile = path.join(dir, 'report.json');
    const report = await readFile(reportFile, 'utf8').then(s => ReportSchema.parse(JSON.parse(s))).catch(() => null);
    if (!report) continue;
    const clips = [];
    for (const shot of report.shots) {
      if (!/^shot-\d+$/.test(shot.id)) continue;
      const clip = path.join(dir, `${shot.id}.mp4`);
      if (shot.status === 'complete' && await access(clip).then(() => true, () => false)) {
        clips.push({ id: shot.id, url: mediaUrl(clip) });
      }
    }
    const final = path.join(dir, 'final.mp4');
    runs.push({ runId: report.runId, model: report.model, comparisonKey: report.comparisonKey,
      status: active.has(dir) ? 'running' : report.status === 'running' ? 'interrupted' : report.status,
      active: active.has(dir), completed: clips.length, total: report.shots.length,
      durationSeconds: report.finalDuration ?? report.outputSeconds,
      error: failures.get(dir) || report.error, clips,
      finalUrl: report.status === 'complete' && await access(final).then(() => true, () => false) ? mediaUrl(final) : null });
  }
  const a = detail.review?.approvals;
  return { configured: Boolean(process.env.FAL_KEY?.trim()), error: [...failures].find(([dir]) => path.dirname(dir) === root)?.[1] || null,
    approved: Boolean(a?.script && a.tts && a.images), busy: [...active].some(dir => path.dirname(dir) === root), runs };
}

export async function experimentAction(file: string, body: z.infer<typeof ExperimentActionSchema>) {
  // Read raw episode so CLI and UI produce identical fingerprints.
  const detail = await getEpisodeDetail(file);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(path.join(episodesDir(), file), 'utf8')));
  const root = experimentRoot(episode.id);
  if ([...active].some(dir => path.dirname(dir) === root)) throw new Error('An experiment is already running for this episode');
  const images = await resolveExperimentImages(episode, file);
  const audioPath = await resolveEpisodeNarrationAudio({ episodeId: episode.id, episodeFile: file });
  const plan = await createExperimentPlan({ episode, images, model: body.model, audioPath });
  const dir = path.join(root, `${body.model}-${plan.runId}`);
  const summary = { runId: plan.runId, model: plan.model, images: episode.scenes.length,
    clips: plan.shots.length, durationSeconds: plan.durationSeconds,
    generationSeconds: plan.shots.reduce((n, shot) => n + shot.generationSeconds, 0) };
  if (body.action === 'plan') {
    await saveJson(path.join(dir, 'preview.json'), plan);
    return { ...summary, started: false };
  }
  if (body.runId !== plan.runId) throw new Error('Selections changed. Preview again before generating.');
  const a = detail.review?.approvals;
  if (!(a?.script && a.tts && a.images)) throw new Error('Approve script, voice and visuals before generating video.');
  const provider = body.action === 'assemble' ? undefined : new FalVideoProvider(process.env.FAL_KEY || '');
  if ([...active].some(folder => path.dirname(folder) === root)) throw new Error('An experiment is already running for this episode');
  active.add(dir); failures.delete(dir);
  void runExperiment(plan, dir, { mode: body.action === 'assemble' ? 'assemble' : 'run',
    ...(provider ? { provider } : {}), ...(body.action === 'test' ? { limit: 1 } : {}),
    burnSubtitles: detail.review?.selected?.burnSubtitles !== false
  }).catch(error => { failures.set(dir, error instanceof Error ? error.message : String(error)); })
    .finally(() => active.delete(dir));
  return { ...summary, started: true };
}
