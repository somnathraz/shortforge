import { access, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { assembleEpisodeFromClips } from '../../providers/ffmpegRender.js';
import { probeAudioDuration } from '../../audio/ffprobe.js';
import { hash, type ExperimentPlan } from './plan.js';
import { ReceiptSchema, type VideoProvider } from './fal.js';
const exec = promisify(execFile);
const ShotStateSchema = z.object({
  id: z.string(), status: z.enum(['pending', 'submitting', 'queued', 'complete']),
  receipt: ReceiptSchema.optional(), error: z.string().nullable(), wallSeconds: z.number().nonnegative()
});
export const ReportSchema = z.object({
  version: z.literal(1), runId: z.string(), comparisonKey: z.string(), model: z.string(), endpoint: z.string(),
  status: z.enum(['planned', 'running', 'partial', 'failed', 'generated', 'complete']),
  finalPath: z.string().nullable(), finalDuration: z.number().nullable(), actualCostUsd: z.number().nullable(),
  estimatedCostUsd: z.number().nullable(), generatedSeconds: z.number(), outputSeconds: z.number(),
  images: z.number(), error: z.string().nullable(), shots: z.array(ShotStateSchema)
});
export type ExperimentReport = z.infer<typeof ReportSchema>;

export async function saveJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2) + '\n');
  await rename(`${file}.tmp`, file);
}
export async function validateVideo(file: string, seconds: number) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames:format=duration', '-of', 'json', file]);
  const value = JSON.parse(stdout);
  if (!value.streams?.[0]?.width || !value.streams[0].height || Number(value.streams[0].nb_frames) === 1 ||
      !(Number(value.format?.duration) >= seconds - 0.08)) throw new Error('Generated video is missing, invalid or too short');
}
export function newReport(plan: ExperimentPlan): ExperimentReport {
  return { version: 1, runId: plan.runId, comparisonKey: plan.comparisonKey, model: plan.model, endpoint: plan.endpoint,
    status: 'planned', finalPath: null, finalDuration: null, actualCostUsd: null, estimatedCostUsd: plan.estimatedCostUsd,
    generatedSeconds: plan.shots.reduce((n, s) => n + s.generationSeconds, 0), outputSeconds: plan.durationSeconds,
    images: new Set(plan.shots.map(s => s.sceneId)).size, error: null,
    shots: plan.shots.map(s => ({ id: s.id, status: 'pending', error: null, wallSeconds: 0 })) };
}

/** Isolated orchestration. Dependencies are injected for offline failure/resume tests. */
export async function runExperiment(plan: ExperimentPlan, directory: string, options: {
  provider?: VideoProvider; mode: 'run' | 'assemble'; limit?: number; burnSubtitles?: boolean;
  validate?: typeof validateVideo; assemble?: typeof assembleEpisodeFromClips; probe?: typeof probeAudioDuration;
}): Promise<ExperimentReport> {
  if (!plan.audioPath || !plan.audioHash) throw new Error('An experiment needs real --audio before generating or assembling.');
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  const validate = options.validate || validateVideo;
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, '.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error(`Experiment is locked: ${lockPath}. Check for an active process before removing a stale lock.`); });
  const reportFile = path.join(directory, 'report.json');
  let report: ExperimentReport | undefined;
  try {
    await lock.writeFile(String(process.pid));
    // Fail before any submission when source assets changed or disappeared.
    if (hash(await readFile(plan.audioPath)) !== plan.audioHash) throw new Error('Audio changed since planning');
    for (const shot of plan.shots) {
      if (hash(await readFile(shot.imagePath)) !== shot.imageHash) throw new Error(`Image changed for ${shot.id}`);
    }
    if (await access(reportFile).then(() => true, () => false)) {
      report = ReportSchema.parse(JSON.parse(await readFile(reportFile, 'utf8')));
      if (report.runId !== plan.runId || report.comparisonKey !== plan.comparisonKey ||
          report.shots.map(s => s.id).join() !== plan.shots.map(s => s.id).join()) throw new Error('Report does not match experiment plan');
    } else report = newReport(plan);
    report.status = 'running'; report.error = null;
    await saveJson(path.join(directory, 'plan.json'), plan);
    await saveJson(reportFile, report);
    let submissions = 0;
    for (const [index, shot] of plan.shots.entries()) {
      const state = report.shots[index]!;
      const clip = path.join(directory, `${shot.id}.mp4`);
      const started = Date.now();
      try {
        if (state.status === 'complete') {
          const valid = await validate(clip, shot.durationSeconds).then(() => true, () => false);
          if (valid) continue;
          if (!state.receipt) throw new Error(`${shot.id}: invalid clip without a saved request ID`);
          state.status = 'queued'; // Re-download same generation, never resubmit.
        }
        if (options.mode === 'assemble') throw new Error(`Missing valid clip ${shot.id}; run the experiment first.`);
        if (!options.provider) throw new Error('A video provider is required for generation');
        if (state.status === 'submitting') {
          throw new Error(`${shot.id}: previous submission has unknown acceptance. Check fal's dashboard and recover the receipt in report.json before resuming; no automatic resubmit.`);
        }
        if (!state.receipt) {
          if (submissions >= limit) { report.status = 'partial'; break; }
          const bytes = await readFile(shot.imagePath);
          const mime = /\.jpe?g$/i.test(shot.imagePath) ? 'image/jpeg' : /\.webp$/i.test(shot.imagePath) ? 'image/webp' : 'image/png';
          state.status = 'submitting'; state.error = null;
          await saveJson(reportFile, report); // Crash between POST and receipt persistence is marked ambiguous.
          const receipt = await options.provider.submit(plan.endpoint, { ...shot.input,
            image_url: `data:${mime};base64,${bytes.toString('base64')}` });
          state.receipt = ReceiptSchema.parse(receipt);
          state.status = 'queued'; submissions++;
          await saveJson(reportFile, report);
        }
        console.log(`${plan.model}: ${shot.id} (${state.receipt.request_id})`);
        const url = await options.provider.result(state.receipt);
        const pending = path.join(directory, `${shot.id}.pending.mp4`);
        await writeFile(pending, await options.provider.download(url));
        await validate(pending, shot.durationSeconds);
        await rename(pending, clip);
        state.status = 'complete'; state.error = null;
      } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        state.wallSeconds += (Date.now() - started) / 1000;
        await saveJson(reportFile, report);
      }
    }
    if (report.shots.every(s => s.status === 'complete')) {
      report.status = 'generated';
      await saveJson(reportFile, report);
      const finalPath = path.join(directory, 'final.mp4');
      await (options.assemble || assembleEpisodeFromClips)({ episode: plan.episode, audioPath: plan.audioPath,
        outputPath: finalPath, productionShots: plan.shots.map(s => ({ clipPath: path.join(directory, `${s.id}.mp4`),
          durationSeconds: s.durationSeconds, camera: s.camera })), width: 1080, height: 1920, fps: 30,
        burnSubtitles: options.burnSubtitles !== false });
      report.finalPath = finalPath;
      report.finalDuration = await (options.probe || probeAudioDuration)(finalPath);
      report.status = 'complete';
    }
    return report;
  } catch (e) {
    if (report) { report.status = 'failed'; report.error = e instanceof Error ? e.message : String(e); }
    throw e;
  } finally {
    try { if (report) await saveJson(reportFile, report); }
    finally { await lock.close(); await rm(lockPath, { force: true }); }
  }
}

export async function compareExperiments(files: string[]) {
  const reports = await Promise.all(files.map(async file => ({ file,
    report: ReportSchema.parse(JSON.parse(await readFile(file, 'utf8'))) })));
  return reports.map(({ file, report }) => ({
    model: report.model, comparable: reports.every(r => r.report.comparisonKey === report.comparisonKey),
    status: report.status, clips: `${report.shots.filter(s => s.status === 'complete').length}/${report.shots.length}`,
    plannedGenerationSeconds: report.generatedSeconds, outputSeconds: report.finalDuration ?? report.outputSeconds,
    observedWallSeconds: Math.round(report.shots.reduce((sum, s) => sum + s.wallSeconds, 0)),
    estimatedCostUsd: report.estimatedCostUsd, actualCostUsd: report.actualCostUsd,
    errors: report.shots.filter(s => s.error).length, file
  }));
}
