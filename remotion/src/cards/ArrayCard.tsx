import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { pointerMotionAt } from '../lib/pointerMotion';
import type { AnimationStep } from '../lib/viewState';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export type ArrayCardProps = {
  values: number[];
  /** Fallback discrete pointer when steps are not provided */
  pointerIndex: number | null;
  highlightIndex: number | null;
  filledCells?: number;
  showIndexes?: boolean;
  y?: number;
  mode?: 'fill' | 'all';
  visible?: boolean;
  /** Scene progress 0–1 — enables smooth hops + particles */
  t?: number;
  animationSteps?: AnimationStep[];
  /** Show traveling request packets during traversal */
  particles?: boolean;
};

/** Predefined array teaching card — tweened pointer + optional flow particles. */
export const ArrayCard: React.FC<ArrayCardProps> = ({
  values,
  pointerIndex,
  highlightIndex,
  filledCells = values.length,
  showIndexes = true,
  y = 820,
  mode = 'all',
  visible = true,
  t,
  animationSteps,
  particles: enableParticles = true
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!visible) return null;

  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const cellW = Math.min(160, Math.floor(860 / values.length));
  const gap = 12;
  const total = values.length * cellW + (values.length - 1) * gap;
  const startX = (TECH.width - total) / 2;

  const motion =
    typeof t === 'number' && animationSteps?.length
      ? pointerMotionAt(animationSteps, t, pointerIndex ?? undefined)
      : null;

  const smoothIndex =
    motion?.smoothIndex ??
    (pointerIndex !== null && pointerIndex >= 0 ? pointerIndex : null);
  const activeIndex =
    motion?.activeIndex ??
    highlightIndex ??
    (pointerIndex !== null ? pointerIndex : null);

  const visualFilled =
    mode === 'fill' && smoothIndex !== null
      ? Math.max(filledCells, Math.floor(smoothIndex) + (motion && motion.hopProgress > 0.35 ? 1 : 0))
      : filledCells;

  const cellCenterX = (index: number) => startX + index * (cellW + gap) + cellW / 2;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="arrayGlow" blur={7} />
      <GlowFilter id="particleGlow" blur={5} />

      {values.map((value, index) => {
        const x = startX + index * (cellW + gap);
        const filled = mode === 'all' ? true : visualFilled > index;
        const active = filled && activeIndex === index;
        const done =
          filled &&
          smoothIndex !== null &&
          index < Math.floor(smoothIndex + (motion && motion.hopProgress > 0.85 ? 0.2 : 0));
        const fill = !filled
          ? '#0E1624'
          : active
            ? TECH.cellActive
            : done
              ? TECH.cellDone
              : TECH.cell;
        const stroke = active ? TECH.accent : TECH.panelBorder;
        return (
          <g key={index} filter={active ? 'url(#arrayGlow)' : undefined}>
            {showIndexes ? (
              <text
                x={x + cellW / 2}
                y={y - 28}
                textAnchor="middle"
                fill={TECH.muted}
                fontSize={28}
                fontFamily={TECH.font}
              >
                {index}
              </text>
            ) : null}
            <rect
              x={x}
              y={y}
              width={cellW}
              height={120}
              rx={16}
              fill={fill}
              stroke={stroke}
              strokeWidth={active ? 5 : 3}
            />
            <text
              x={x + cellW / 2}
              y={y + 78}
              textAnchor="middle"
              fill={filled ? TECH.text : TECH.muted}
              fontSize={filled ? 48 : 36}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              {filled ? value : '·'}
            </text>
          </g>
        );
      })}

      {/* Traveling orange particles along the hop */}
      {enableParticles &&
        motion?.particles.map((particle, i) => {
          const px = cellCenterX(particle.indexPos);
          const py = y + 60;
          return (
            <circle
              key={`p-${i}`}
              cx={px}
              cy={py}
              r={particle.radius}
              fill={TECH.warn}
              opacity={particle.opacity}
              filter="url(#particleGlow)"
            />
          );
        })}

      {/* Smooth pointer under the cells */}
      {smoothIndex !== null && smoothIndex >= -0.5 && smoothIndex < values.length + 0.5 ? (
        <g>
          {(() => {
            const x = cellCenterX(smoothIndex);
            const bounce = Math.sin(frame / 6) * 3;
            return (
              <>
                <circle
                  cx={x}
                  cy={y + 60}
                  r={14}
                  fill="none"
                  stroke={TECH.warn}
                  strokeWidth={3}
                  opacity={0.45}
                  filter="url(#arrayGlow)"
                />
                <polygon
                  points={`${x - 22},${y + 150 + bounce} ${x + 22},${y + 150 + bounce} ${x},${y + 185 + bounce}`}
                  fill={TECH.warn}
                  filter="url(#arrayGlow)"
                />
                <text
                  x={x}
                  y={y + 230 + bounce}
                  textAnchor="middle"
                  fill={TECH.warn}
                  fontSize={40}
                  fontFamily={TECH.font}
                  fontWeight={700}
                >
                  ↑
                </text>
              </>
            );
          })()}
        </g>
      ) : null}
    </svg>
  );
};
