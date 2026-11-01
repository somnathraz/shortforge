import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { Episode } from '../../schema/episode.js';
import { buildNarrationTimeline } from '../../audio/narration-timeline.js';
import { imagesRootDir } from '../../lib/sceneImage.js';
import { loadReviewSelected, resolveOutputPath } from '../../lib/selectedAssets.js';
import { sceneMotionNegativePrompt, sceneMotionPrompt } from '../../lib/sceneMotionPrompt.js';
import { MODELS, generationDuration, type ModelName } from './models.js';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export type ExperimentShot = {
  id: string; sceneId: number; imagePath: string; imageHash: string; prompt: string;
  camera: string; startSecond: number; durationSeconds: number; generationSeconds: number;
  input: Record<string, unknown>;
};
export type ExperimentPlan = {
  version: 1; runId: string; comparisonKey: string; model: ModelName; endpoint: string;
  episode: Episode; audioPath: string | null; audioHash: string | null;
  durationSeconds: number; timingMethod: string; shots: ExperimentShot[];
  estimatedCostUsd: number | null; rateUsdPerSecond: number | null;
};

export async function resolveExperimentImages(episode: Episode, episodeFile: string, imagesDir?: string) {
  const selected = imagesDir ? null : await loadReviewSelected(path.basename(episodeFile));
  const images: Record<number, string> = {};
  for (const scene of episode.scenes) {
    const chosen = selected?.images?.[String(scene.id)];
    if (chosen) {
      const file = resolveOutputPath(chosen);
      if (!file) throw new Error(`Invalid selected image path for scene ${scene.id}`);
      await access(file); // Never silently switch away from a reviewed image.
      images[scene.id] = file;
      continue;
    }
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      const file = path.resolve(imagesDir || path.join(imagesRootDir(), episode.id), `scene-${scene.id}.${ext}`);
      if (await access(file).then(() => true, () => false)) { images[scene.id] = file; break; }
    }
    if (!images[scene.id]) throw new Error(`Missing image for scene ${scene.id}. Select it in review or supply --images-dir.`);
  }
  return images;
}

export async function createExperimentPlan(options: {
  episode: Episode; images: Record<number, string>; model: ModelName; audioPath?: string;
  rateUsdPerSecond?: number;
}): Promise<ExperimentPlan> {
  const { episode, images, model } = options;
  if (new Set(episode.scenes.map(s => s.id)).size !== episode.scenes.length) throw new Error('Scene IDs must be unique');
  if (options.rateUsdPerSecond !== undefined && (!Number.isFinite(options.rateUsdPerSecond) || options.rateUsdPerSecond < 0)) {
    throw new Error('--usd-per-second must be a nonnegative number');
  }
  const audioPath = options.audioPath ? path.resolve(options.audioPath) : null;
  const audioHash = audioPath ? hash(await readFile(audioPath)) : null;
  const timeline = await buildNarrationTimeline(episode, audioPath || undefined);
  if (audioPath && timeline.method !== 'narration-aligned') throw new Error('Cannot probe narration. Check ffprobe and --audio.');
  // Opening uses the first selected image, ending the last. No extra image generation.
  const slots: Array<{ sceneId: number; duration: number }> = [];
  for (const [index, section] of timeline.scenes.entries()) {
    const sceneId = section.kind === 'spokenHook' ? episode.scenes[0]!.id
      : section.kind === 'ending' ? episode.scenes.at(-1)!.id : Number(section.id);
    const end = timeline.scenes[index + 1]?.startSecond ?? timeline.narrationDurationSeconds;
    const duration = end - section.startSecond;
    if (!(duration > 0)) throw new Error('Invalid narration timeline');
    if (slots.at(-1)?.sceneId === sceneId) slots.at(-1)!.duration += duration;
    else slots.push({ sceneId, duration });
  }
  const shots: ExperimentShot[] = [];
  let cursor = 0;
  for (const slot of slots) {
    const scene = episode.scenes.find(s => s.id === slot.sceneId)!;
    const imagePath = path.resolve(images[scene.id] || '');
    if (!images[scene.id]) throw new Error(`Missing image for scene ${scene.id}`);
    if (!/\.(png|jpe?g|webp)$/i.test(imagePath)) throw new Error(`Unsupported image format: ${imagePath}`);
    const imageHash = hash(await readFile(imagePath));
    // Common 10-second ceiling keeps the visual edit identical across models.
    const parts = Math.ceil(slot.duration / 10);
    for (let part = 0; part < parts; part++) {
      const durationSeconds = slot.duration / parts;
      const prompt = sceneMotionPrompt(scene);
      const negativePrompt = sceneMotionNegativePrompt(scene);
      const generationSeconds = generationDuration(model, durationSeconds);
      shots.push({ id: `shot-${String(shots.length + 1).padStart(3, '0')}`, sceneId: scene.id,
        imagePath, imageHash, prompt, camera: scene.camera, startSecond: cursor,
        durationSeconds, generationSeconds, input: { ...MODELS[model].input(prompt, generationSeconds), negative_prompt: negativePrompt } });
      cursor += durationSeconds;
    }
  }
  const comparisonKey = hash(JSON.stringify({ episode, audioHash,
    shots: shots.map(({ imagePath: _path, input: _input, generationSeconds: _seconds, ...shot }) => shot) }));
  const runId = hash(JSON.stringify({ version: 1, comparisonKey, endpoint: MODELS[model].endpoint,
    inputs: shots.map(s => s.input) })).slice(0, 16);
  const generatedSeconds = shots.reduce((sum, shot) => sum + shot.generationSeconds, 0);
  return { version: 1, runId, comparisonKey, model, endpoint: MODELS[model].endpoint, episode,
    audioPath, audioHash, durationSeconds: timeline.narrationDurationSeconds, timingMethod: timeline.method, shots,
    estimatedCostUsd: options.rateUsdPerSecond === undefined ? null : generatedSeconds * options.rateUsdPerSecond,
    rateUsdPerSecond: options.rateUsdPerSecond ?? null };
}
