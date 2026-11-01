import path from 'node:path';
import { generateVeoClip, veoClipsDir } from './veo.js';
import { wanRemoteAnimate } from '../workers/wanRemote.js';
import { generateRunwayClip } from './runway.js';

export const AI_VIDEO_PROVIDERS = ['veo', 'wan', 'runway'] as const;
export type AiVideoProvider = (typeof AI_VIDEO_PROVIDERS)[number];

export type AiVideoClipRequest = {
  provider: AiVideoProvider;
  prompt: string;
  outputPath: string;
  /** Scene still / character image (required for wan; used by veo as first-frame or ref). */
  imagePath?: string;
  /** Extra refs for Veo --mode refs (max 3 total with imagePath). */
  referenceImagePaths?: string[];
  /** Veo: image = first-frame; refs = referenceImages assets. */
  veoMode?: 'image' | 'refs';
  /** Required for Wan: driving-motion mp4. */
  drivingVideoPath?: string;
  /** Passed to Wan Comfy negative CLIP encode when set. */
  negativePrompt?: string;
  durationSeconds?: number;
  seed?: number;
};

export function aiVideoRootDir(): string {
  return path.resolve(process.env.AI_VIDEO_DIR || 'output/ai-video');
}

export function aiVideoEpisodeDir(episodeId: string): string {
  return path.join(aiVideoRootDir(), episodeId);
}

export function aiVideoClipsDir(episodeId: string, provider?: AiVideoProvider): string {
  const base = path.join(aiVideoEpisodeDir(episodeId), 'clips');
  return provider ? path.join(base, provider) : base;
}

/** @deprecated prefer aiVideoClipsDir — kept for older Veo paths */
export function legacyVeoClipsDir(episodeId: string): string {
  return veoClipsDir(episodeId);
}

export async function generateAiVideoClip(request: AiVideoClipRequest): Promise<string> {
  if (request.provider === 'veo') {
    const mode = request.veoMode || 'image';
    if (mode === 'refs') {
      const refs = [...(request.referenceImagePaths || [])];
      if (request.imagePath) refs.unshift(request.imagePath);
      if (!refs.length) throw new Error('Veo refs mode needs --image / scene still or --extra-refs');
      return generateVeoClip({
        prompt: request.prompt,
        outputPath: request.outputPath,
        referenceImagePaths: refs.slice(0, 3),
        ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {})
      });
    }
    return generateVeoClip({
      prompt: request.prompt,
      outputPath: request.outputPath,
      ...(request.imagePath ? { imagePath: request.imagePath } : {}),
      ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {})
    });
  }

  if (request.provider === 'runway') {
    if (!request.imagePath) throw new Error('Runway animate requires a scene still (--image / scene still)');
    return generateRunwayClip({
      imagePath: request.imagePath,
      prompt: request.prompt,
      outputPath: request.outputPath,
      ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {})
    });
  }

  if (request.provider === 'wan') {
    if (!request.imagePath) throw new Error('Wan animate requires a reference image (--image / scene still)');
    const backend = (process.env.WAN_BACKEND || 'comfy').trim().toLowerCase();
    if (backend === 'nim' && !request.drivingVideoPath) {
      throw new Error(
        'Wan NIM requires a driving video. Pass --drive path.mp4 (or set WAN_BACKEND=comfy for I2V).'
      );
    }
    return wanRemoteAnimate({
      imagePath: request.imagePath,
      prompt: request.prompt,
      outputPath: request.outputPath,
      ...(request.drivingVideoPath ? { videoPath: request.drivingVideoPath } : {}),
      ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      ...(request.durationSeconds !== undefined
        ? { frames: Math.max(1, Math.round(request.durationSeconds * 16)) }
        : {})
    });
  }

  throw new Error(`Unknown AI video provider: ${String((request as AiVideoClipRequest).provider)}`);
}
