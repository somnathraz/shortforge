import type { AnimationStep } from './viewState';

export type PointerMotion = {
  /** Continuous index (can be 1.4 while tweening 1→2) */
  smoothIndex: number | null;
  /** Discrete cell under the pointer for fill/highlight */
  activeIndex: number | null;
  /** 0–1 progress within the current hop */
  hopProgress: number;
  /** Orange packets riding the current hop */
  particles: Array<{ indexPos: number; opacity: number; radius: number }>;
};

function easeInOut(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/**
 * Frame-driven pointer motion from discrete JSON beats.
 * Converts teleport steps into smooth hops + traveling particles.
 */
export function pointerMotionAt(
  steps: AnimationStep[],
  t: number,
  fallbackIndex?: number
): PointerMotion {
  const moves = steps
    .filter(
      (step) => step.action === 'traverseTo' || step.action === 'showIndexPointer'
    )
    .map((step) => ({
      at: step.at,
      index: typeof step.index === 'number' ? step.index : fallbackIndex ?? 0
    }))
    .sort((a, b) => a.at - b.at);

  if (!moves.length) {
    return { smoothIndex: null, activeIndex: null, hopProgress: 0, particles: [] };
  }

  // Before first pointer beat — ease onto the first cell.
  if (t < moves[0]!.at) {
    const local = easeInOut(t / Math.max(1e-6, moves[0]!.at));
    const idx = moves[0]!.index;
    return {
      smoothIndex: idx,
      activeIndex: idx,
      hopProgress: local,
      particles: local > 0.15
        ? [{ indexPos: idx, opacity: 0.35 + local * 0.5, radius: 7 }]
        : []
    };
  }

  let i = 0;
  while (i < moves.length && moves[i]!.at <= t + 1e-9) i += 1;
  const prev = moves[i - 1]!;
  const next = moves[i];

  if (!next) {
    // Holding on last cell — soft idle pulse particle.
    return {
      smoothIndex: prev.index,
      activeIndex: prev.index,
      hopProgress: 1,
      particles: [{ indexPos: prev.index, opacity: 0.55, radius: 8 }]
    };
  }

  const span = Math.max(1e-6, next.at - prev.at);
  const hopProgress = easeInOut((t - prev.at) / span);
  const smoothIndex = prev.index + (next.index - prev.index) * hopProgress;
  const activeIndex = hopProgress < 0.5 ? prev.index : next.index;

  // Lead particle + short trail along the hop.
  const particles: PointerMotion['particles'] = [];
  for (let k = 0; k < 4; k += 1) {
    const lag = k * 0.12;
    const p = Math.min(1, Math.max(0, hopProgress - lag));
    if (p <= 0 && k > 0) continue;
    const indexPos = prev.index + (next.index - prev.index) * p;
    particles.push({
      indexPos,
      opacity: 0.9 - k * 0.18,
      radius: 9 - k * 1.2
    });
  }

  return { smoothIndex, activeIndex, hopProgress, particles };
}
