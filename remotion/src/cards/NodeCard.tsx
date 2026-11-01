import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export type NodeCardProps = {
  label: string;
  cx?: number;
  cy?: number;
  active?: boolean;
  kind?: 'server' | 'cache' | 'user' | 'generic';
  visible?: boolean;
};

/** Predefined rounded tech node — servers, caches, users. */
export const NodeCard: React.FC<NodeCardProps> = ({
  label,
  cx = 540,
  cy = 700,
  active = false,
  kind = 'generic',
  visible = true
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!visible) return null;
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const w = kind === 'user' ? 140 : 200;
  const h = 88;
  const stroke = active ? TECH.accent : TECH.panelBorder;
  const fill = active ? TECH.cellActive : TECH.panel;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id={`nodeGlow-${label}`} blur={7} />
      <g
        transform={`translate(${cx - w / 2} ${cy - h / 2})`}
        filter={active ? `url(#nodeGlow-${label})` : undefined}
      >
        <rect x={0} y={0} width={w} height={h} rx={18} fill={fill} stroke={stroke} strokeWidth={3} />
        <text
          x={w / 2}
          y={h / 2 + 10}
          textAnchor="middle"
          fill={TECH.text}
          fontSize={28}
          fontFamily={TECH.font}
          fontWeight={700}
        >
          {label}
        </text>
      </g>
    </svg>
  );
};
