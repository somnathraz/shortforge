import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Episode } from '../schema/episode.js';
import { buildNarrationTimeline } from '../audio/narration-timeline.js';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { directShots } from '../lib/shotDirector.js';
import { enrichVisualPrompt } from '../lib/characters.js';
import { generateGeminiImage } from '../providers/geminiImage.js';
import { generateWanComfyClip, checkWanComfyHealth } from '../providers/wan-comfy.js';
import { assembleEpisodeFromClips, type ProductionVisual } from '../providers/ffmpegRender.js';

const exec = promisify(execFile);
export async function validateWanClip(file: string, minimumDuration: number): Promise<void> {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames:format=duration', '-of', 'json', file]);
  const data = JSON.parse(stdout);
  if (!data.streams?.[0]?.width || !(Number(data.format?.duration) >= minimumDuration - 0.08)
      || Number(data.streams[0].nb_frames) === 1) {
    throw new Error(`Invalid or too short Wan video: ${file}`);
  }
}

export async function produceWan(input: {
  episode: Episode; audioPath?: string; planOnly?: boolean; outputDir?: string;
  maxAttempts?: number; reuseOnly?: boolean; fallbackStill?: boolean; burnSubtitles?: boolean;
}) {
  const root = path.resolve(input.outputDir || path.join('output/wan-production', input.episode.id));
  await mkdir(root, { recursive: true });
  const save = async (name: string, value: unknown) => {
    const file = path.join(root, name);
    await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
    await rename(`${file}.tmp`, file);
  };
  if (input.audioPath) await probeAudioDuration(input.audioPath); // Do not silently plan against unprobeable audio.
  const timeline = await buildNarrationTimeline(input.episode, input.audioPath);
  const plan = directShots(input.episode, timeline);
  await save('production-plan.json', plan);
  if (input.planOnly) return { planPath: path.join(root, 'production-plan.json'), shots: plan.shots.length };
  if (!input.audioPath) throw new Error('Narration audio is required for production');
  const attempts = input.maxAttempts ?? 2;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('maxAttempts must be 1–5');
  const records: Array<Record<string, unknown>> = [];
  const visuals: ProductionVisual[] = [];
  const report = { episodeId: input.episode.id, storyScenes: plan.storyScenes, shots: plan.shots.length,
    status: 'running', error: null as string | null, wanWallSeconds: 0, gpuSeconds: null, costUsd: null,
    finalDuration: null as number | null, outputPath: null as string | null, records };
  try {
  if (!input.reuseOnly) {
    await checkWanComfyHealth();
    const rawWorkflow = await readFile(path.resolve(process.env.WAN_COMFY_WORKFLOW || 'workflows/wan/wan22-i2v-a14b-api.json'), 'utf8');
    if (rawWorkflow.trimStart().startsWith('#')) throw new Error('Wan workflow is a placeholder. Export a ComfyUI Wan I2V workflow in API format and set WAN_COMFY_WORKFLOW.');
    const workflow = JSON.parse(rawWorkflow);
    if (!Object.keys(workflow.prompt || workflow).length) throw new Error('Configure a real Wan ComfyUI API workflow first');
  }
    for (const shot of plan.shots) {
      const scene = input.episode.scenes.find(s => s.id === shot.sceneId) ||
        input.episode.scenes[shot.sceneId === -1 ? input.episode.scenes.length - 1 : 0]!;
      const refs = await enrichVisualPrompt(shot.visualPrompt);
      const identity = createHash('sha256').update(JSON.stringify({ shot, lords: input.episode.featuredLords,
        model: process.env.GOOGLE_IMAGE_MODEL, refs: await Promise.all(refs.masterImagePaths.map(f => readFile(f).then(b => b.toString('base64')))) })).digest('hex').slice(0, 12);
      const dir = path.join(root, `${shot.id}-${identity}`);
      await mkdir(dir, { recursive: true });
      let imagePath = '';
      for (const ext of ['png', 'jpg']) {
        const candidate = path.join(dir, `keyframe.${ext}`);
        if (await access(candidate).then(() => true, () => false)) { imagePath = candidate; break; }
      }
      if (!imagePath) {
        if (input.reuseOnly) throw new Error(`Missing keyframe for ${shot.id}`);
        imagePath = await generateGeminiImage({ visualPrompt: shot.visualPrompt,
          outputPath: path.join(dir, 'keyframe.png'), referenceImagePaths: refs.masterImagePaths,
          style: { episode: input.episode, scene: shot.sceneId === 0 ? {
            ...scene, appearingLords: input.episode.hookAppearingLords || scene.appearingLords
          } : scene, camera: shot.camera, scenes: input.episode.scenes } });
      }
      const keyframeHash = createHash('sha256').update(await readFile(imagePath)).digest('hex').slice(0, 12);
      const clip = path.join(dir, `wan-${keyframeHash}.mp4`);
      const record = { shotId: shot.id, attempts: 0, reused: false, fallback: false, seconds: 0, errors: [] as string[] };
      records.push(record);
      let valid = await validateWanClip(clip, shot.durationSeconds).then(() => true, () => false);
      record.reused = valid;
      while (!valid && !input.reuseOnly && record.attempts < attempts) {
        record.attempts++;
        const started = Date.now();
        try {
          console.log(`${shot.id}: Wan attempt ${record.attempts}/${attempts}`);
          const partial = path.join(dir, 'pending.mp4');
          await generateWanComfyClip({ imagePath, outputPath: partial,
            prompt: `Subject: ${shot.visualPrompt} ${shot.subjectMotion} Environment: ${shot.environmentMotion} Camera: ${shot.camera}.`,
            negativePrompt: shot.negativeMotion,
            frames: Math.ceil((shot.durationSeconds * 16 - 1) / 4) * 4 + 1 });
          await validateWanClip(partial, shot.durationSeconds);
          await rename(partial, clip);
          valid = true;
        } catch (e) { record.errors.push(e instanceof Error ? e.message : String(e)); }
        record.seconds += (Date.now() - started) / 1000;
        await save('production-report.json', report);
      }
      report.wanWallSeconds += record.seconds;
      if (!valid && !input.fallbackStill) throw new Error(`${shot.id}: ${record.errors.at(-1) || 'Missing valid cached Wan clip'}`);
      record.fallback = !valid;
      visuals.push({ ...(valid ? { clipPath: clip } : { imagePath }), durationSeconds: shot.durationSeconds, camera: shot.camera });
      await save('production-report.json', report);
    }
    const outputPath = path.join(root, 'final.mp4');
    await assembleEpisodeFromClips({ episode: input.episode, audioPath: input.audioPath, outputPath,
      productionShots: visuals, width: 1080, height: 1920, fps: 30, burnSubtitles: input.burnSubtitles !== false });
    report.finalDuration = await probeAudioDuration(outputPath);
    report.outputPath = outputPath;
    report.status = records.some(r => r.fallback) ? 'completed-with-still-fallback' : 'completed';
    return { outputPath, reportPath: path.join(root, 'production-report.json') };
  } catch (e) { report.status = 'failed'; report.error = e instanceof Error ? e.message : String(e); throw e; }
  finally { await save('production-report.json', report); }
}
