import { access, mkdir, readdir, stat } from 'node:fs/promises';
import { estimateRunwayCostUsd, runwayClipSeconds } from '../providers/runway.js';
import path from 'node:path';
import type { Episode } from '../schema/episode.js';
import { visualSource, lastImageSceneId, type SceneVisuals } from '../lib/sceneVisualPlan.js';
import { payoffIsSpoken, resolveSpokenHook } from '../lib/ttsScript.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import { enrichVisualPrompt } from '../lib/characters.js';
import { sceneMotionNegativePrompt, sceneMotionPrompt } from '../lib/sceneMotionPrompt.js';
import {
  type SceneGenerationRecord,
  buildProductionReport,
  estimateVeoCostUsd,
  estimateWanCostUsd,
  finalRootDir,
  writeProductionReport
} from '../lib/productionCost.js';
import {
  assembleEpisodeFromClips,
  type VisualInput
} from '../providers/ffmpegRender.js';
import {
  type AiVideoProvider,
  aiVideoClipsDir,
  generateAiVideoClip
} from '../providers/aiVideo.js';

export type ProduceInput = {
  episode: Episode;
  audioPath: string;
  /** Provider for AI_VIDEO scenes only. */
  provider: AiVideoProvider;
  motion?: 'low' | 'medium' | 'high';
  drivingVideoPath?: string;
  /** Generate missing AI clips (default true). */
  generateAi?: boolean;
  /** Max attempts per AI_VIDEO scene. */
  maxAttempts?: number;
  burnSubtitles?: boolean;
  outputPath?: string;
  veoMode?: 'image' | 'refs';
  /** Absolute paths locked by UI review (sceneId → clip). */
  selectedClips?: Record<number, string>;
  /** Absolute paths locked by UI review (sceneId → still). */
  selectedImages?: Record<number, string>;
  sceneVisuals?: SceneVisuals;
  /** Tech only: remotion | ffmpeg — tagged on final filename for A/B compare. */
  techVisualEngine?: 'remotion' | 'ffmpeg';
};

async function findSceneImage(imagesDir: string, sceneId: number): Promise<string> {
  for (const name of [`scene-${sceneId}.png`, `scene-${sceneId}.jpg`, `scene-${sceneId}.jpeg`]) {
    const full = path.join(imagesDir, name);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  throw new Error(`Missing still for scene ${sceneId} in ${imagesDir}`);
}

async function newestProviderClip(
  clipsDir: string,
  sceneId: number,
  provider: AiVideoProvider,
  episodeId: string
): Promise<string | undefined> {
  const searchDirs = [
    clipsDir,
    path.resolve('output/veo', episodeId, 'clips'),
    path.resolve('output/clips', episodeId),
    path.resolve('output/ai-video', episodeId, 'clips'),
    path.resolve('output/ai-video', episodeId, 'clips', 'upload'),
    path.resolve('output/ai-video', episodeId, 'clips', provider)
  ];

  const candidates: string[] = [];
  for (const dir of searchDirs) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.mp4')) continue;
      const matchProvider =
        name.startsWith(`scene-${sceneId}-${provider}`) ||
        name.startsWith(`scene-${sceneId}-upload`) ||
        (provider === 'veo' && name.startsWith(`scene-${sceneId}-veo`)) ||
        (provider === 'wan' && name.startsWith(`scene-${sceneId}-wan`)) ||
        name === `scene-${sceneId}.mp4`;
      if (matchProvider) candidates.push(path.join(dir, name));
    }
  }
  if (!candidates.length) return undefined;
  const ranked = await Promise.all(
    candidates.map(async (full) => ({ full, mtimeMs: (await stat(full)).mtimeMs }))
  );
  ranked.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return ranked[0]?.full;
}

async function resolveDrive(sceneId: number, explicit?: string): Promise<string> {
  if (explicit) {
    await access(explicit);
    return path.resolve(explicit);
  }
  const candidates = [
    path.resolve(`assets/driving/scene-${sceneId}.mp4`),
    path.resolve(process.env.WAN_DRIVE_VIDEO || 'assets/driving/default.mp4'),
    path.resolve('assets/driving/leap.mp4'),
    path.resolve('assets/driving/default.mp4')
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error(
    `Wan needs a driving video for scene ${sceneId}. Pass --drive or add assets/driving/default.mp4`
  );
}

function stampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Final composer: STILL → FFmpeg Ken Burns; AI_VIDEO → Wan/Veo clip; assemble → output/final/.
 */
export async function produceEpisode(input: ProduceInput): Promise<{
  finalPath: string;
  reportPath: string;
}> {
  const imagesDir = path.join(imagesRootDir(), input.episode.id);
  const clipsDir = aiVideoClipsDir(input.episode.id, input.provider);
  const workDir = path.join(finalRootDir(), input.episode.id, 'scene-clips');
  await mkdir(workDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });

  const generateAi = input.generateAi !== false;
  const maxAttempts = Math.max(1, input.maxAttempts ?? Number(process.env.AI_VIDEO_MAX_ATTEMPTS || '2'));
  const records: SceneGenerationRecord[] = [];
  const assembled: string[] = [];
  const stamp = stampNow();

  for (const scene of input.episode.scenes) {
    const outClip = path.join(workDir, `scene-${scene.id}.mp4`);
    const source = visualSource(scene.id, scene.renderMode, input.sceneVisuals);
    const selectedClip = input.selectedClips?.[scene.id];
    if (source === 'upload') {
      if (!selectedClip) throw new Error(`Scene ${scene.id}: upload and select an avatar/video clip, or switch to Image.`);
      await access(selectedClip);
      assembled.push(selectedClip);
      records.push({ sceneId: scene.id, renderMode: 'AI_VIDEO', provider: 'upload', attempts: 0,
        generationSeconds: 0, costUsd: 0, accepted: true, clipPath: selectedClip });
      continue;
    }
    // Tech teaching diagrams are rendered in assemble (Remotion → FFmpeg mux, or SVG fallback).
    if (scene.techVisual && source === 'image') {
      const started = Date.now();
      const engine = input.techVisualEngine || 'remotion';
      console.log(
        `Scene ${scene.id}: techVisual ${scene.techVisual.visualType} (${engine} in assemble)`
      );
      records.push({
        sceneId: scene.id,
        renderMode: 'STILL',
        provider: engine === 'ffmpeg' ? 'ffmpeg' : 'remotion',
        attempts: 1,
        generationSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
        costUsd: 0,
        accepted: true
      });
      assembled.push('');
      continue;
    }
    let still = input.selectedImages?.[scene.id];
    if (source === 'image') still ||= await findSceneImage(imagesDir, scene.id);

    if (source === 'image') {
      const started = Date.now();
      console.log(`Scene ${scene.id}: STILL → FFmpeg motion (${path.basename(still!)})`);
      records.push({
        sceneId: scene.id,
        renderMode: 'STILL',
        provider: 'ffmpeg',
        attempts: 1,
        generationSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
        costUsd: 0,
        accepted: true,
        clipPath: still!
      });
      assembled.push(still!);
      continue;
    }

    // AI_VIDEO — prefer reviewer-locked clip, else newest matching file, else generate.
    let clipPath =
      input.selectedClips?.[scene.id] ||
      (await newestProviderClip(clipsDir, scene.id, input.provider, input.episode.id));
    let attempts = 0;
    let generated = false;
    let lastError: string | undefined;
    const started = Date.now();

    if (input.selectedClips?.[scene.id]) {
      console.log(
        `Scene ${scene.id}: AI_VIDEO → selected ${path.basename(input.selectedClips[scene.id]!)}`
      );
    }

    if (!clipPath && !generateAi) {
      throw new Error(
        `Scene ${scene.id} is AI_VIDEO but no ${input.provider} clip found in ${clipsDir}. Run with generate enabled or npm run animate first.`
      );
    }

    if (!clipPath && generateAi) {
      still ||= await findSceneImage(imagesDir, scene.id);
      const motion = sceneMotionPrompt(scene);
      const negativePrompt = sceneMotionNegativePrompt(scene);
      const { prompt, masterImagePaths } = await enrichVisualPrompt(motion);
      while (attempts < maxAttempts && !clipPath) {
        attempts += 1;
        const fileName = `scene-${scene.id}-${input.provider}-${stamp}-a${attempts}.mp4`;
        const outputPath = path.join(clipsDir, fileName);
        console.log(
          `Scene ${scene.id}: AI_VIDEO → ${input.provider} (attempt ${attempts}/${maxAttempts})`
        );
        try {
          if (input.provider === 'wan') {
            const drive = await resolveDrive(scene.id, input.drivingVideoPath);
            await generateAiVideoClip({
              provider: 'wan',
              prompt,
              negativePrompt,
              outputPath,
              imagePath: still,
              drivingVideoPath: drive,
              durationSeconds: scene.durationSeconds
            });
          } else if (input.provider === 'runway') {
            await generateAiVideoClip({
              provider: 'runway',
              prompt,
              outputPath,
              imagePath: still,
              durationSeconds: scene.durationSeconds
            });
          } else {
            await generateAiVideoClip({
              provider: 'veo',
              prompt,
              outputPath,
              imagePath: still,
              referenceImagePaths: masterImagePaths,
              veoMode: input.veoMode || (masterImagePaths.length ? 'refs' : 'image'),
              durationSeconds: Math.min(8, scene.durationSeconds)
            });
          }
          clipPath = outputPath;
          generated = true;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          console.error(`Scene ${scene.id} attempt ${attempts} failed: ${lastError}`);
        }
      }
    } else if (clipPath) {
      attempts = 1;
      console.log(`Scene ${scene.id}: AI_VIDEO → reuse ${path.basename(clipPath)}`);
    }

    const generationSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
    if (!clipPath) {
      records.push({
        sceneId: scene.id,
        renderMode: 'AI_VIDEO',
        provider: input.provider,
        ...(input.provider === 'wan' ? { gpu: process.env.WAN_GPU_LABEL || 'RTX4090' } : {}),
        attempts,
        generationSeconds,
        costUsd: 0,
        accepted: false,
        ...(lastError ? { error: lastError } : {})
      });
      throw new Error(
        `Scene ${scene.id} AI_VIDEO failed after ${attempts} attempt(s): ${lastError || 'unknown'}`
      );
    }

    // Copy/normalize path into work dir via assemble later; point assembled at source
    assembled.push(clipPath);
    const costUsd = !generated ? 0 :
      input.provider === 'veo'
        ? estimateVeoCostUsd(Math.min(8, scene.durationSeconds))
        : input.provider === 'runway'
          ? estimateRunwayCostUsd(runwayClipSeconds(scene.durationSeconds)) ?? 0
          : estimateWanCostUsd(generationSeconds);

    records.push({
      sceneId: scene.id,
      renderMode: 'AI_VIDEO',
      provider: input.provider,
      ...(input.provider === 'wan' ? { gpu: process.env.WAN_GPU_LABEL || 'RTX4090' } : {}),
      attempts: Math.max(1, attempts),
      generationSeconds,
      costUsd,
      accepted: true,
      clipPath
    });
  }

  const techEngine = input.techVisualEngine;
  const engineTag =
    techEngine &&
    (input.episode.hookTechVisual || input.episode.scenes.some((s) => s.techVisual))
      ? `-${techEngine}`
      : '';
  const finalPath = path.resolve(
    input.outputPath ||
      path.join(finalRootDir(), `${input.episode.id}-final-${stamp}${engineTag}.mp4`)
  );
  console.log(
    `Composing final Short${techEngine ? ` (tech engine: ${techEngine})` : ''}…`
  );
  const visualSources: Record<number, VisualInput> = {};
  for (const [index, scene] of input.episode.scenes.entries()) {
    const settings = input.sceneVisuals?.[scene.id];
    if (scene.techVisual && visualSource(scene.id, scene.renderMode, input.sceneVisuals) === 'image') {
      // Empty source → assemble renders techVisual (ignores leftover AI stills).
      visualSources[scene.id] = {};
      continue;
    }
    visualSources[scene.id] = visualSource(scene.id, scene.renderMode, input.sceneVisuals) === 'image'
      ? { imagePath: input.selectedImages?.[scene.id] || await findSceneImage(imagesDir, scene.id) }
      : { clipPath: assembled[index]!, trimStartSeconds: settings?.trimStartSeconds, shortClip: settings?.shortClip };
  }
  for (const id of [0, -1]) {
    if (id === 0 && !resolveSpokenHook(input.episode)) continue;
    if (id === -1 && !payoffIsSpoken(input.episode)) continue;
    const settings = input.sceneVisuals?.[id];
    const clip = input.selectedClips?.[id];
    // Prefer a locked clip whenever present — don't require sceneVisuals.source=ai
    // (opening/ending default to STILL in the script, which used to force Ken Burns).
    const wantsVideo =
      settings?.source === 'upload' ||
      settings?.source === 'ai' ||
      (Boolean(clip) && settings?.source !== 'image');
    if (wantsVideo) {
      if (!clip) {
        throw new Error(
          `${id === 0 ? 'Opening hook' : 'Ending'}: upload and select a video, or choose Image.`
        );
      }
      visualSources[id] = {
        clipPath: clip,
        trimStartSeconds: settings?.trimStartSeconds,
        shortClip: settings?.shortClip
      };
    } else if (
      (id === 0 && input.episode.hookTechVisual) ||
      (id === -1 && input.episode.scenes.at(-1)?.techVisual)
    ) {
      visualSources[id] = {};
    } else {
      const clipKeys = input.selectedClips
        ? Object.fromEntries(Object.entries(input.selectedClips).map(([key, value]) => [String(key), value]))
        : undefined;
      const fallback =
        lastImageSceneId(input.episode.scenes, input.sceneVisuals, clipKeys) ??
        input.episode.scenes[id === 0 ? 0 : input.episode.scenes.length - 1]!.id;
      let image = input.selectedImages?.[id] || input.selectedImages?.[fallback];
      if (id === 0 && !input.selectedImages?.[0]) {
        for (const ext of ['png', 'jpg', 'jpeg']) {
          const candidate = path.join(imagesDir, `scene-hook.${ext}`);
          if (await access(candidate).then(() => true, () => false)) { image = candidate; break; }
        }
      }
      visualSources[id] = { imagePath: image || await findSceneImage(imagesDir, fallback) };
    }
  }
  await assembleEpisodeFromClips({
    episode: input.episode,
    audioPath: input.audioPath,
    outputPath: finalPath,
    clipPaths: assembled,
    visualSources,
    ...(input.sceneVisuals ? { sceneVisuals: input.sceneVisuals } : {}),
    ...(input.motion ? { motion: input.motion } : {}),
    ...(input.burnSubtitles !== undefined ? { burnSubtitles: input.burnSubtitles } : {}),
    ...(input.techVisualEngine ? { techVisualEngine: input.techVisualEngine } : {})
  });

  const report = buildProductionReport(input.episode.id, records, finalPath);
  const reportPath = await writeProductionReport(report);
  console.log(`Production report: ${reportPath}`);
  console.log(
    `Estimated AI cost: $${report.totals.costUsd} (${report.totals.generationSeconds}s gen time tracked)`
  );
  return { finalPath, reportPath };
}
