import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { AnimationStep } from '../lib/viewState';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

function barRevealProgress(steps: AnimationStep[] | undefined, t: number, barIndex: number): number {
  const hits = (steps || [])
    .filter((step) => step.action === 'growthStep' && step.index === barIndex)
    .sort((a, b) => a.at - b.at);
  if (!hits.length) {
    // Fallback: reveal when discrete growthStep says so (caller still passes growthStep).
    return 1;
  }
  const at = hits[0]!.at;
  const next = (steps || [])
    .filter((step) => step.action === 'growthStep' && (step.index ?? 0) > barIndex)
    .sort((a, b) => a.at - b.at)[0];
  const end = next ? next.at : Math.min(1, at + 0.18);
  if (t < at) return 0;
  if (t >= end) return 1;
  const u = (t - at) / Math.max(1e-6, end - at);
  return u * u * (3 - 2 * u);
}

export const GrowthBarsCard: React.FC<{
  inputSizes: number[];
  operations: number[];
  growthStep: number;
  t?: number;
  animationSteps?: AnimationStep[];
}> = ({ inputSizes, operations, growthStep, t, animationSteps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const maxOps = Math.max(...operations, 1);
  const barMaxH = 520;
  const gap = 80;
  const barW = 140;
  const total = inputSizes.length * barW + (inputSizes.length - 1) * gap;
  const startX = (TECH.width - total) / 2;
  const baseY = 1280;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="barGlow" blur={6} />
      {inputSizes.map((size, i) => {
        const morph =
          typeof t === 'number'
            ? barRevealProgress(animationSteps, t, i)
            : growthStep > i
              ? 1
              : 0;
        // Keep bars that already completed fully grown.
        const progress = growthStep > i + 1 ? 1 : morph;
        const targetH = (operations[i]! / maxOps) * barMaxH;
        const barH = Math.max(8, targetH * progress);
        const active = (progress > 0 && progress < 1) || growthStep === i + 1;
        const x = startX + i * (barW + gap);
        const showLabel = progress > 0.55;
        return (
          <g key={i} filter={active ? 'url(#barGlow)' : undefined}>
            <rect
              x={x}
              y={baseY - barH}
              width={barW}
              height={barH}
              rx={16}
              fill={active ? TECH.cellActive : progress > 0 ? TECH.cellDone : TECH.cell}
              stroke={active ? TECH.accent : TECH.panelBorder}
              strokeWidth={3}
            />
            <text
              x={x + barW / 2}
              y={baseY + 48}
              textAnchor="middle"
              fill={TECH.muted}
              fontSize={28}
              fontFamily={TECH.font}
            >
              n={size}
            </text>
            {showLabel ? (
              <text
                x={x + barW / 2}
                y={baseY - barH - 20}
                textAnchor="middle"
                fill={TECH.text}
                fontSize={30}
                fontFamily={TECH.font}
                fontWeight={700}
                opacity={Math.min(1, (progress - 0.55) / 0.45)}
              >
                {operations[i]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};
