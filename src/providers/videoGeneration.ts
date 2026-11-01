/**
 * Pluggable AI video generation: Wan (self-hosted ComfyUI GPU) or Runway (hosted API, no GPU).
 * UI and CLI must call this layer — never Comfy HTTP directly.
 */
import path from 'node:path';
import { formatWanPlan, planWanClipFromNarration } from '../lib/wanTiming.js';
import {
  resolveWanQualityMode,
  type WanQualityMode
} from '../lib/wanQualityMode.js';
import { generateWanComfyClip, checkWanComfyHealth } from './wan-comfy.js';
import { checkRunwayHealth, generateRunwayClip, runwayConfigured } from './runway.js';

export type VideoGenerationRequest = {
  episodeId: string;
  sceneId: number;
  imagePath: string;
  prompt: string;
  negativePrompt?: string;
  outputPath: string;
  /** Narration-clock length from episode scene (seconds). */
  durationSeconds?: number;
  seed?: number;
  /** quality = 20-step; fast = LightX2V 4-step. */
  qualityMode?: WanQualityMode;
  onProgress?: (progress: {
    percent: number;
    value: number;
    max: number;
    label: string;
  }) => void | Promise<void>;
  onQueued?: (info: { promptId: string; clientId: string }) => void | Promise<void>;
  signal?: AbortSignal;
};

export type VideoGenerationProvider = {
  readonly id: string;
  health(): Promise<string>;
  generate(request: VideoGenerationRequest): Promise<string>;
};

export class WanComfyUIProvider implements VideoGenerationProvider {
  readonly id = 'wan-comfyui';

  async health(): Promise<string> {
    return checkWanComfyHealth();
  }

  async generate(request: VideoGenerationRequest): Promise<string> {
    const plan = planWanClipFromNarration(request.durationSeconds ?? 5);
    const qualityMode = resolveWanQualityMode(request.qualityMode);
    console.log(
      `Wan scene-${request.sceneId}: narration=${plan.narrationSeconds}s → ${formatWanPlan(plan)} · ${qualityMode}`
    );
    return generateWanComfyClip({
      imagePath: request.imagePath,
      prompt: request.prompt,
      outputPath: request.outputPath,
      ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      durationSeconds: plan.durationSeconds,
      fps: plan.fps,
      width: plan.width,
      height: plan.height,
      qualityMode,
      filenamePrefix: `epicastra/${request.episodeId}/scene-${request.sceneId}${
        qualityMode === 'fast' ? '-lightx2v' : ''
      }`,
      ...(request.onProgress ? { onProgress: request.onProgress } : {}),
      ...(request.onQueued ? { onQueued: request.onQueued } : {}),
      ...(request.signal ? { signal: request.signal } : {})
    });
  }
}

export class RunwayVideoProvider implements VideoGenerationProvider {
  readonly id = 'runway';

  async health(): Promise<string> {
    return (await checkRunwayHealth()).message;
  }

  async generate(request: VideoGenerationRequest): Promise<string> {
    return generateRunwayClip({
      imagePath: request.imagePath,
      prompt: request.prompt,
      outputPath: request.outputPath,
      ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {}),
      onQueued: ({ taskId }) => request.onQueued?.({ promptId: taskId, clientId: 'runway' }),
      onProgress: ({ percent, label }) =>
        request.onProgress?.({ percent, value: percent, max: 100, label }),
      ...(request.signal ? { signal: request.signal } : {})
    });
  }
}

/**
 * VIDEO_PROVIDER wins. Otherwise: Runway when a key is set and no Comfy/Wan GPU is configured
 * (the no-setup path), else Wan.
 */
export function defaultVideoProviderName(): string {
  const explicit = process.env.VIDEO_PROVIDER?.trim() || process.env.AI_VIDEO_PROVIDER?.trim();
  if (explicit) return explicit;
  // WAN_COMFY_URL is pre-filled in .env.example, so it does not count; an SSH host or COMFYUI_URL does.
  const hasGpu = Boolean(process.env.WAN_COMFY_SSH_HOST?.trim() || process.env.COMFYUI_URL?.trim());
  return runwayConfigured() && !hasGpu ? 'runway' : 'wan-comfyui';
}

export function resolveVideoProvider(name = defaultVideoProviderName()): VideoGenerationProvider {
  const key = name.trim().toLowerCase();
  if (key === 'runway' || key === 'runwayml') return new RunwayVideoProvider();
  if (key === 'wan' || key === 'wan-comfyui' || key === 'comfy' || key === 'comfyui') {
    return new WanComfyUIProvider();
  }
  throw new Error(
    `Unknown VIDEO_PROVIDER="${name}". Supported: runway (hosted, no GPU) or wan-comfyui (aliases: wan, comfy).`
  );
}

/** Stable per-scene clip path (overwritten on regenerate). */
export function sceneVideoPath(episodeId: string, sceneId: number): string {
  const root = path.resolve(process.env.AI_VIDEO_DIR || 'output/ai-video');
  return path.join(root, episodeId, `scene-${sceneId}.mp4`);
}

export function sceneVideoRelative(episodeId: string, sceneId: number): string {
  return path.posix.join('ai-video', episodeId, `scene-${sceneId}.mp4`);
}
