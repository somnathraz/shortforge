/** Client mirror of src/lib/wanTiming.ts — keep formulas in sync. */

export type WanClipPlan = {
  narrationSeconds: number;
  durationSeconds: number;
  fps: number;
  frames: number;
  width: number;
  height: number;
  clamped: boolean;
};

export type WanTimingOptions = {
  fps?: number;
  width?: number;
  height?: number;
  maxFrames?: number;
  maxDurationSeconds?: number;
};

function snapWanFrames(frames: number, maxFrames: number): number {
  const capped = Math.min(Math.max(Math.round(frames), 5), maxFrames);
  return Math.max(5, Math.floor((capped - 1) / 4) * 4 + 1);
}

function snapDim(value: number, min = 64): number {
  if (!Number.isFinite(value) || value < min) return min;
  return Math.max(min, Math.round(value / 16) * 16);
}

export function planWanClipFromNarration(
  narrationSeconds: number,
  options: WanTimingOptions = {}
): WanClipPlan {
  const fps = options.fps && options.fps > 0 ? options.fps : 16;
  const maxFrames = snapWanFrames(options.maxFrames ?? 129, 10_000);
  const maxDuration = options.maxDurationSeconds ?? (maxFrames - 1) / fps;
  const safeNarration =
    Number.isFinite(narrationSeconds) && narrationSeconds > 0 ? narrationSeconds : 5;
  const targetSeconds = Math.min(Math.max(safeNarration, 1 / fps), maxDuration);
  const clamped = targetSeconds + 1e-9 < safeNarration;
  const frames = snapWanFrames(Math.floor(targetSeconds * fps + 1), maxFrames);
  const durationSeconds = (frames - 1) / fps;
  const width = snapDim(options.width ?? 704);
  const height = snapDim(options.height ?? 1280);
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
