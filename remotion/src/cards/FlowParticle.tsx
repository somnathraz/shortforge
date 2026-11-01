import React from 'react';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export type Point = { x: number; y: number };

/** Linear interpolate along a polyline; progress ∈ [0,1]. */
export function pointOnPath(points: Point[], progress: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const t = Math.min(1, Math.max(0, progress));
  const segs = points.length - 1;
  const scaled = t * segs;
  const i = Math.min(segs - 1, Math.floor(scaled));
  const local = scaled - i;
  const a = points[i]!;
  const b = points[i + 1]!;
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

/**
 * Reference-style packet: ONE purposeful orange glow + short trail.
 * Not confetti — used for “ask once”, traversal hops, request heat.
 */
export const FlowParticle: React.FC<{
  points: Point[];
  progress: number;
  /** How many faded trail dots behind the lead */
  trail?: number;
  visible?: boolean;
  color?: string;
}> = ({
  points,
  progress,
  trail = 3,
  visible = true,
  color = TECH.warn
}) => {
  if (!visible || points.length < 2 || progress <= 0) return null;

  const dots: Array<{ p: Point; opacity: number; r: number }> = [];
  for (let k = 0; k <= trail; k += 1) {
    const lag = k * 0.045;
    const pr = progress - lag;
    if (pr <= 0) continue;
    dots.push({
      p: pointOnPath(points, pr),
      opacity: 1 - k * 0.22,
      r: 11 - k * 1.8
    });
  }

  return (
    <g>
      <GlowFilter id="flowParticleGlow" blur={7} />
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.p.x}
          cy={dot.p.y}
          r={Math.max(3, dot.r)}
          fill={color}
          opacity={dot.opacity}
          filter={i === 0 ? 'url(#flowParticleGlow)' : undefined}
        />
      ))}
    </g>
  );
};

/** Dotted connector path — like the Discord→servers→DB lines in the reference. */
export const DottedConnector: React.FC<{
  points: Point[];
  progress?: number;
  color?: string;
  opacity?: number;
}> = ({
  points,
  progress = 1,
  color = 'rgba(200,210,230,0.55)',
  opacity = 1
}) => {
  if (points.length < 2 || progress <= 0) return null;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const approxLen = points.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1]!;
    return sum + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0);
  const dash = 8;
  const gap = 10;
  const pattern = dash + gap;
  const draw = approxLen * Math.min(1, Math.max(0, progress));

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeDasharray={`${dash} ${gap}`}
      strokeDashoffset={approxLen - draw}
      strokeLinecap="round"
      opacity={opacity}
      pathLength={approxLen}
      style={{
        strokeDasharray: `${pattern}`,
        // Reveal by clipping dash length conceptually via opacity + full path
      }}
    />
  );
};

/** Simpler reveal: stroke draws itself with dashoffset. */
export const AnimatedConnector: React.FC<{
  points: Point[];
  progress: number;
  color?: string;
  hot?: boolean;
}> = ({ points, progress, color, hot }) => {
  if (points.length < 2) return null;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const len = 900;
  const p = Math.min(1, Math.max(0, progress));
  const stroke = color || (hot ? TECH.warn : 'rgba(180,195,220,0.5)');
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={hot ? 3 : 2}
      strokeDasharray={`${len}`}
      strokeDashoffset={len * (1 - p)}
      strokeLinecap="round"
      opacity={0.35 + p * 0.55}
    />
  );
};
