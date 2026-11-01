import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export const ComplexityBadge: React.FC<{ text: string; visible: boolean }> = ({
  text,
  visible
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!visible) return null;
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const scale = interpolate(enter, [0, 1], [0.85, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <GlowFilter id="badgeGlow" blur={6} />
      <g
        transform={`translate(540 1735) scale(${scale}) translate(-240 -55)`}
        opacity={opacity}
        filter="url(#badgeGlow)"
      >
        <rect
          x={0}
          y={0}
          width={480}
          height={110}
          rx={24}
          fill={TECH.panel}
          stroke={TECH.accent}
          strokeWidth={4}
        />
        <text
          x={240}
          y={72}
          textAnchor="middle"
          fill={TECH.accent}
          fontSize={64}
          fontFamily={TECH.font}
          fontWeight={700}
        >
          {text}
        </text>
      </g>
    </svg>
  );
};
