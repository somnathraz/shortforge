import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export const LadderCard: React.FC<{
  ladder: string[];
  revealCount: number;
}> = ({ ladder, revealCount }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const startY = 620;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="ladderGlow" blur={6} />
      {ladder.map((item, i) => {
        if (i >= revealCount) return null;
        const y = startY + i * 140;
        const active = i === revealCount - 1;
        return (
          <g key={item} filter={active ? 'url(#ladderGlow)' : undefined}>
            <rect
              x={180}
              y={y}
              width={720}
              height={100}
              rx={20}
              fill={active ? TECH.cellActive : TECH.panel}
              stroke={active ? TECH.accent : TECH.panelBorder}
              strokeWidth={3}
            />
            <text
              x={540}
              y={y + 64}
              textAnchor="middle"
              fill={TECH.text}
              fontSize={44}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              {item}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
