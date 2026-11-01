/**
 * Map narration scene length → Wan I2V duration / frames / resolution.
 *
 * EpicAstra Wan2.2 workflow derives length as floor(duration * fps + 1).
 * Latent length should stay on the Wan-friendly 4n+1 grid.
 */

export type WanClipPlan = {
  narrationSeconds: number;
  /** Value patched into Comfy duration node (seconds). */
  durationSeconds: number;
  fps: number;
  /** Expected frames after floor(duration * fps + 1), always 4n+1. */
  frames: number;
  width: number;
  height: number;
  /** True when narration was longer than Wan max and we clamped. */
  clamped: boolean;
};

export type WanTimingOptions = {
  fps?: number;
  width?: number;
  height?: number;
  maxFrames?: number;
  maxDurationSeconds?: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Snap to nearest multiple of 16 (Wan / VAE friendly). */
export function snapDim(value: number, min = 64): number {
  if (!Number.isFinite(value) || value < min) return min;
  return Math.max(min, Math.round(value / 16) * 16);
}

export function resolveWanResolution(options: WanTimingOptions = {}): {
  width: number;
  height: number;
} {
  const width = snapDim(options.width ?? envNumber('WAN_COMFY_WIDTH', envNumber('WAN_WIDTH', 704)));
  const height = snapDim(
    options.height ?? envNumber('WAN_COMFY_HEIGHT', envNumber('WAN_HEIGHT', 1280))
  );
  return { width, height };
}

/** Snap frame count onto Wan's 4n+1 latent grid. */
export function snapWanFrames(frames: number, maxFrames: number): number {
  const capped = Math.min(Math.max(Math.round(frames), 5), maxFrames);
  return Math.max(5, Math.floor((capped - 1) / 4) * 4 + 1);
}

/**
 * Plan Wan clip length from the episode scene's narration clock.
 * Duration is chosen so Comfy's floor(duration * fps + 1) equals a 4n+1 frame count.
 */
export function planWanClipFromNarration(
  narrationSeconds: number,
  options: WanTimingOptions = {}
): WanClipPlan {
  const fps = options.fps ?? envNumber('WAN_COMFY_FPS', 16);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Wan fps must be a positive number');
  }

  const maxFrames = snapWanFrames(
    options.maxFrames ?? envNumber('WAN_COMFY_MAX_FRAMES', 129),
    10_000
  );
  const maxDuration =
    options.maxDurationSeconds ??
    envNumber('WAN_COMFY_MAX_DURATION_SECONDS', (maxFrames - 1) / fps);

  const safeNarration =
    Number.isFinite(narrationSeconds) && narrationSeconds > 0 ? narrationSeconds : 5;
  const targetSeconds = Math.min(Math.max(safeNarration, 1 / fps), maxDuration);
  const clamped = targetSeconds + 1e-9 < safeNarration;

  // Prefer covering the narration beat, then snap up onto 4n+1.
  const rawFrames = Math.floor(targetSeconds * fps + 1);
  const frames = snapWanFrames(rawFrames, maxFrames);
  // Exact duration that yields `frames` via floor(duration * fps + 1).
  const durationSeconds = (frames - 1) / fps;
  const { width, height } = resolveWanResolution(options);

  return {
    narrationSeconds: safeNarration,
    durationSeconds,
    fps,
    frames,
    width,
    height,
    clamped
  };
}

export function formatWanPlan(plan: WanClipPlan): string {
  const clampNote = plan.clamped ? ' · clamped' : '';
  return `${plan.durationSeconds.toFixed(2)}s · ${plan.frames}f @ ${plan.fps}fps · ${plan.width}×${plan.height}${clampNote}`;
}
