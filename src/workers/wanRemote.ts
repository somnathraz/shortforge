/**
 * Generic remote Wan worker interface.
 * Backends:
 *   WAN_BACKEND=comfy  → ComfyUI on Vast/RunPod (I2V, no driving video)
 *   WAN_BACKEND=nim    → NVIDIA NIM container (image + driving video)
 */
import { animateWithWanNim, checkWanNimHealth } from '../providers/wan-nim.js';
import { checkWanComfyHealth, generateWanComfyClip } from '../providers/wan-comfy.js';

export type WanRemoteAnimateInput = {
  imagePath: string;
  /** Required for NIM; ignored for Comfy I2V. */
  videoPath?: string;
  prompt: string;
  negativePrompt?: string;
  outputPath?: string;
  seed?: number;
  width?: number;
  height?: number;
  frames?: number;
};

export type WanBackend = 'comfy' | 'nim';

export function wanBackend(): WanBackend {
  const value = (process.env.WAN_BACKEND || 'comfy').trim().toLowerCase();
  if (value === 'nim' || value === 'comfy') return value;
  throw new Error(`WAN_BACKEND must be comfy|nim (got ${process.env.WAN_BACKEND})`);
}

export async function wanRemoteHealth(): Promise<string> {
  if (wanBackend() === 'comfy') return checkWanComfyHealth();
  return checkWanNimHealth();
}

export async function wanRemoteAnimate(input: WanRemoteAnimateInput): Promise<string> {
  const backend = wanBackend();
  if (backend === 'comfy') {
    const outputPath =
      input.outputPath ||
      `output/wan/comfy-${Date.now()}.mp4`;
    return generateWanComfyClip({
      imagePath: input.imagePath,
      prompt: input.prompt,
      outputPath,
      ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      ...(input.frames !== undefined ? { frames: input.frames } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {})
    });
  }

  if (!input.videoPath) {
    throw new Error('Wan NIM requires a driving video (--drive / videoPath)');
  }
  return animateWithWanNim({
    imagePath: input.imagePath,
    videoPath: input.videoPath,
    prompt: input.prompt,
    ...(input.outputPath ? { outputPath: input.outputPath } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {})
  });
}
