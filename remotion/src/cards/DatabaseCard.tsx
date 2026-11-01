import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export type DatabaseCardProps = {
  label?: string;
  active?: boolean;
  cx?: number;
  cy?: number;
  visible?: boolean;
};

/** Predefined cylinder DB node — reuse for system design + space visuals. */
export const DatabaseCard: React.FC<DatabaseCardProps> = ({
  label = 'DB',
  active = false,
  cx = 540,
  cy = 1100,
  visible = true
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!visible) return null;
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const pulse = active ? 1 + Math.sin(frame / 8) * 0.03 : 1;
  const w = 180;
  const h = 140;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="dbGlow" blur={8} />
      <g
        transform={`translate(${cx} ${cy}) scale(${pulse}) translate(${-w / 2} ${-h / 2})`}
        filter={active ? 'url(#dbGlow)' : undefined}
      >
        <ellipse
          cx={w / 2}
          cy={28}
          rx={w / 2}
          ry={28}
          fill={TECH.panel}
          stroke={active ? TECH.accent : TECH.panelBorder}
          strokeWidth={3}
        />
        <rect
          x={0}
          y={28}
          width={w}
          height={h - 56}
          fill={TECH.panel}
          stroke={active ? TECH.accent : TECH.panelBorder}
          strokeWidth={3}
        />
        <ellipse
          cx={w / 2}
          cy={h - 28}
          rx={w / 2}
          ry={28}
          fill={TECH.cell}
          stroke={active ? TECH.accent : TECH.panelBorder}
          strokeWidth={3}
        />
        <text
          x={w / 2}
          y={h / 2 + 10}
          textAnchor="middle"
          fill={TECH.text}
          fontSize={36}
          fontFamily={TECH.font}
          fontWeight={700}
        >
          {label}
        </text>
      </g>
    </svg>
  );
};
