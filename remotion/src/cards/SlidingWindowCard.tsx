import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export type SlidingWindowCardProps = {
  values: number[];
  /** Fixed window length k. Ignored in twoPointer mode when left/right set. */
  windowSize: number;
  /** Smooth window start index (fixed mode). */
  windowStart: number;
  /** Two-pointer mode: inclusive left/right. */
  mode?: 'fixed' | 'twoPointer';
  leftIndex?: number | null;
  rightIndex?: number | null;
  showSum?: boolean;
  sumOverride?: number | null;
  formula?: string | null;
  /** GROW RIGHT / ADVANCE LEFT callout */
  actionLabel?: string | null;
  y?: number;
  visible?: boolean;
};

/** Contiguous window bar that slides; cells outside the window stay dim. */
export const SlidingWindowCard: React.FC<SlidingWindowCardProps> = ({
  values,
  windowSize,
  windowStart,
  mode = 'fixed',
  leftIndex = null,
  rightIndex = null,
  showSum = true,
  sumOverride = null,
  formula = null,
  actionLabel = null,
  y = 820,
  visible = true
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!visible || values.length === 0) return null;

  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  const cellW = Math.min(150, Math.floor(900 / values.length));
  const gap = 14;
  const total = values.length * cellW + (values.length - 1) * gap;
  const startX = (TECH.width - total) / 2;
  const cellH = 120;
  const step = cellW + gap;

  let left: number;
  let right: number;
  if (mode === 'twoPointer' && leftIndex !== null && rightIndex !== null) {
    left = Math.max(0, Math.min(leftIndex, values.length - 1));
    right = Math.max(left, Math.min(rightIndex, values.length - 1));
  } else {
    const maxStart = Math.max(0, values.length - windowSize);
    left = Math.max(0, Math.min(windowStart, maxStart));
    right = left + Math.max(1, windowSize) - 1;
  }

  const leftEdge = Math.min(left, right);
  const rightEdge = Math.max(left, right);

  const barX = startX + leftEdge * step - 10;
  const barW = (rightEdge - leftEdge + 1) * cellW + (rightEdge - leftEdge) * gap + 20;
  const barY = y - 18;
  const barH = cellH + 36;

  const coverage = (index: number) => {
    const overlap =
      Math.min(index + 1, rightEdge + 1) - Math.max(index, leftEdge);
    return Math.max(0, Math.min(1, overlap));
  };
  const inWindow = (index: number) => coverage(index) > 0.5;

  // Stable teaching sum: only fully covered cells (avoids mid-lerp garbage).
  const liveSum = values.reduce(
    (acc, value, index) => (coverage(index) > 0.85 ? acc + value : acc),
    0
  );
  const sum = sumOverride ?? liveSum;

  const pulse = 0.88 + 0.12 * Math.sin(frame / 9);
  const leftCx = startX + left * step + cellW / 2;
  const rightCx = startX + right * step + cellW / 2;
  const pointersClose = Math.abs(rightCx - leftCx) < cellW * 0.75;
  const leftLabelX = pointersClose ? leftCx - 28 : leftCx;
  const rightLabelX = pointersClose ? rightCx + 28 : rightCx;

  const isGrow = (actionLabel || '').toLowerCase().includes('grow');
  const isShrink =
    (actionLabel || '').toLowerCase().includes('left') ||
    (actionLabel || '').toLowerCase().includes('shrink');

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="windowGlow" blur={8} />
      <GlowFilter id="windowSoft" blur={14} />
      <GlowFilter id="leftGlow" blur={6} />
      <GlowFilter id="rightGlow" blur={6} />

      {/* Sliding window chrome */}
      <rect
        x={barX}
        y={barY}
        width={Math.max(cellW + 20, barW)}
        height={barH}
        rx={22}
        fill="rgba(61, 220, 151, 0.12)"
        stroke={TECH.accent}
        strokeWidth={4}
        opacity={pulse}
        filter="url(#windowSoft)"
      />
      <rect
        x={barX}
        y={barY - 8}
        width={Math.max(cellW + 20, barW)}
        height={10}
        rx={5}
        fill={TECH.accent}
        opacity={0.95}
        filter="url(#windowGlow)"
      />

      {/* Edge grips — make expand/shrink obvious */}
      <rect
        x={barX - 6}
        y={barY + 16}
        width={12}
        height={barH - 32}
        rx={6}
        fill={isShrink ? TECH.warn : TECH.accent}
        opacity={mode === 'twoPointer' ? 0.95 : 0.55}
        filter={isShrink ? 'url(#leftGlow)' : undefined}
      />
      <rect
        x={barX + Math.max(cellW + 20, barW) - 6}
        y={barY + 16}
        width={12}
        height={barH - 32}
        rx={6}
        fill={isGrow ? TECH.glow : TECH.accent}
        opacity={mode === 'twoPointer' ? 0.95 : 0.55}
        filter={isGrow ? 'url(#rightGlow)' : undefined}
      />

      <text
        x={barX + Math.max(cellW + 20, barW) / 2}
        y={y - 72}
        textAnchor="middle"
        fill={TECH.accent}
        fontSize={30}
        fontFamily={TECH.font}
        fontWeight={700}
      >
        window
      </text>

      {values.map((value, index) => {
        const x = startX + index * step;
        const active = inWindow(index);
        const fill = active ? TECH.cellActive : '#0E1624';
        const stroke = active ? TECH.accent : TECH.panelBorder;
        const textFill = active ? TECH.text : '#4A4A58';
        return (
          <g key={index}>
            <text
              x={x + cellW / 2}
              y={y - 36}
              textAnchor="middle"
              fill={active ? TECH.muted : '#3A3A48'}
              fontSize={28}
              fontFamily={TECH.font}
            >
              {index}
            </text>
            <rect
              x={x}
              y={y}
              width={cellW}
              height={cellH}
              rx={16}
              fill={fill}
              stroke={stroke}
              strokeWidth={active ? 4 : 2}
              opacity={active ? 1 : 0.4}
            />
            <text
              x={x + cellW / 2}
              y={y + 78}
              textAnchor="middle"
              fill={textFill}
              fontSize={active ? 48 : 40}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              {value}
            </text>
          </g>
        );
      })}

      {mode === 'twoPointer' && leftIndex !== null ? (
        <g filter="url(#leftGlow)">
          <line
            x1={leftCx}
            y1={y + cellH + 8}
            x2={leftCx}
            y2={y + cellH + 34}
            stroke={TECH.warn}
            strokeWidth={4}
          />
          <polygon
            points={`${leftLabelX - 20},${y + cellH + 34} ${leftLabelX + 20},${y + cellH + 34} ${leftLabelX},${y + cellH + 62}`}
            fill={TECH.warn}
          />
          <text
            x={leftLabelX}
            y={y + cellH + 98}
            textAnchor="middle"
            fill={TECH.warn}
            fontSize={40}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            L
          </text>
        </g>
      ) : null}

      {mode === 'twoPointer' && rightIndex !== null ? (
        <g filter="url(#rightGlow)">
          <line
            x1={rightCx}
            y1={y + cellH + 8}
            x2={rightCx}
            y2={y + cellH + 34}
            stroke={TECH.glow}
            strokeWidth={4}
          />
          <polygon
            points={`${rightLabelX - 20},${y + cellH + 34} ${rightLabelX + 20},${y + cellH + 34} ${rightLabelX},${y + cellH + 62}`}
            fill={TECH.glow}
          />
          <text
            x={rightLabelX}
            y={y + cellH + 98}
            textAnchor="middle"
            fill={TECH.glow}
            fontSize={40}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            R
          </text>
        </g>
      ) : null}

      {actionLabel ? (
        <g>
          <rect
            x={220}
            y={y - 160}
            width={640}
            height={70}
            rx={18}
            fill={TECH.panel}
            stroke={isShrink ? TECH.warn : TECH.glow}
            strokeWidth={3}
          />
          <text
            x={540}
            y={y - 112}
            textAnchor="middle"
            fill={isShrink ? TECH.warn : TECH.glow}
            fontSize={36}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            {actionLabel}
          </text>
        </g>
      ) : null}

      {showSum ? (
        <g>
          <rect
            x={270}
            y={y + cellH + (mode === 'twoPointer' ? 130 : 70)}
            width={540}
            height={90}
            rx={20}
            fill={TECH.panel}
            stroke={TECH.warn}
            strokeWidth={3}
            filter="url(#windowGlow)"
          />
          <text
            x={540}
            y={y + cellH + (mode === 'twoPointer' ? 190 : 130)}
            textAnchor="middle"
            fill={TECH.warn}
            fontSize={48}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            sum = {sum}
          </text>
        </g>
      ) : null}

      {formula ? (
        <text
          x={540}
          y={y + cellH + (mode === 'twoPointer' ? 260 : 200)}
          textAnchor="middle"
          fill={TECH.muted}
          fontSize={32}
          fontFamily={TECH.font}
        >
          {formula}
        </text>
      ) : null}
    </svg>
  );
};
