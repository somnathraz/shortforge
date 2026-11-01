import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export const HalvingCard: React.FC<{
  sequence: number[];
  halvingLevel: number;
}> = ({ sequence, halvingLevel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const max = Math.max(...sequence, 1);
  const barMaxW = 720;
  const startY = 640;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="halveGlow" blur={6} />
      {sequence.map((value, i) => {
        const visible = halvingLevel > i;
        if (!visible) return null;
        const w = Math.max(80, (value / max) * barMaxW);
        const y = startY + i * 120;
        const active = halvingLevel === i + 1;
        return (
          <g key={i} filter={active ? 'url(#halveGlow)' : undefined}>
            <rect
              x={(TECH.width - w) / 2}
              y={y}
              width={w}
              height={72}
              rx={16}
              fill={active ? TECH.cellActive : TECH.cell}
              stroke={active ? TECH.accent : TECH.panelBorder}
              strokeWidth={3}
            />
            <text
              x={540}
              y={y + 48}
              textAnchor="middle"
              fill={TECH.text}
              fontSize={36}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              {value}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
