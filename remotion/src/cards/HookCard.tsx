import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export const HookCard: React.FC<{
  title: string;
  subtitle: string;
  showComplexity: boolean;
  complexityText: string;
  variant?: 'default' | 'slidingWindow';
}> = ({ title, subtitle, showComplexity, complexityText, variant = 'default' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const scale = interpolate(enter, [0, 1], [0.92, 1]);

  const values = [2, 1, 5, 1, 3, 2];
  const k = 3;
  const maxStart = values.length - k;
  const t = durationInFrames <= 1 ? 1 : frame / (durationInFrames - 1);
  const windowStart = interpolate(t, [0.15, 0.9], [0, maxStart], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  const cellW = 88;
  const gap = 10;
  const total = values.length * cellW + (values.length - 1) * gap;
  const originX = 400 - total / 2;
  const originY = 120;
  const barX = originX + windowStart * (cellW + gap) - 8;
  const barW = k * cellW + (k - 1) * gap + 16;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="hookGlow" blur={10} />
      <text
        x={540}
        y={200}
        textAnchor="middle"
        fill={TECH.text}
        fontSize={54}
        fontFamily={TECH.font}
        fontWeight={700}
      >
        {title}
      </text>
      <g transform={`translate(540 850) scale(${scale}) translate(-400 -210)`} filter="url(#hookGlow)">
        <rect
          x={0}
          y={0}
          width={800}
          height={420}
          rx={36}
          fill={TECH.panel}
          stroke={TECH.panelBorder}
          strokeWidth={4}
        />
        {variant === 'slidingWindow' ? (
          <g>
            <rect
              x={barX}
              y={originY - 12}
              width={barW}
              height={124}
              rx={18}
              fill="rgba(61, 220, 151, 0.15)"
              stroke={TECH.accent}
              strokeWidth={4}
            />
            <rect x={barX} y={originY - 20} width={barW} height={8} rx={4} fill={TECH.accent} />
            {values.map((v, i) => {
              const x = originX + i * (cellW + gap);
              const overlap =
                Math.min(i + 1, windowStart + k) - Math.max(i, windowStart);
              const active = overlap > 0.45;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={originY}
                    width={cellW}
                    height={100}
                    rx={14}
                    fill={active ? TECH.cellActive : '#0E1624'}
                    stroke={active ? TECH.accent : TECH.panelBorder}
                    strokeWidth={active ? 3 : 2}
                    opacity={active ? 1 : 0.4}
                  />
                  <text
                    x={x + cellW / 2}
                    y={originY + 64}
                    textAnchor="middle"
                    fill={active ? TECH.text : '#555'}
                    fontSize={36}
                    fontFamily={TECH.font}
                    fontWeight={700}
                  >
                    {v}
                  </text>
                </g>
              );
            })}
            <text
              x={400}
              y={300}
              textAnchor="middle"
              fill={TECH.muted}
              fontSize={34}
              fontFamily={TECH.font}
            >
              {subtitle}
            </text>
          </g>
        ) : (
          <>
            <text
              x={400}
              y={180}
              textAnchor="middle"
              fill={TECH.text}
              fontSize={120}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              n ↑
            </text>
            <text
              x={400}
              y={300}
              textAnchor="middle"
              fill={TECH.muted}
              fontSize={40}
              fontFamily={TECH.font}
            >
              {subtitle}
            </text>
          </>
        )}
      </g>
      {showComplexity ? (
        <g>
          <rect
            x={300}
            y={1200}
            width={480}
            height={110}
            rx={24}
            fill={TECH.panel}
            stroke={TECH.accent}
            strokeWidth={4}
            filter="url(#hookGlow)"
          />
          <text
            x={540}
            y={1272}
            textAnchor="middle"
            fill={TECH.accent}
            fontSize={64}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            {complexityText}
          </text>
        </g>
      ) : null}
    </svg>
  );
};
