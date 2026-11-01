import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TECH } from '../theme';

/** Deterministic tiny stars — same quiet dust as the Discord/Scylla reference. */
function starField(count: number): Array<{ x: number; y: number; r: number; o: number }> {
  const stars: Array<{ x: number; y: number; r: number; o: number }> = [];
  let seed = 42;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: next() * TECH.width,
      y: next() * TECH.height,
      r: 0.6 + next() * 1.4,
      o: 0.12 + next() * 0.28
    });
  }
  return stars;
}

const STARS = starField(70);

/**
 * Reference-style canvas: dark, slight lift, soft center wash, tiny star dust.
 * No grid — diagrams / particles carry attention.
 */
export const TechBackground: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: TECH.bg }}>
      <svg width={TECH.width} height={TECH.height} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="techCleanBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TECH.bgMid} />
            <stop offset="50%" stopColor={TECH.bg} />
            <stop offset="100%" stopColor={TECH.bg} />
          </linearGradient>
          <radialGradient id="techCenterWash" cx="50%" cy="42%" r="45%">
            <stop offset="0%" stopColor={TECH.glow} stopOpacity="0.14" />
            <stop offset="100%" stopColor={TECH.glow} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#techCleanBg)" />
        <rect width="100%" height="100%" fill="url(#techCenterWash)" />
        {STARS.map((star, i) => (
          <circle
            key={i}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill="#FFFFFF"
            opacity={star.o}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};
