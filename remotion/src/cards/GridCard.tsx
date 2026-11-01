import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';
import { GlowFilter } from './GlowFilter';

export const GridCard: React.FC<{
  rows: number;
  columns: number;
  filledCells: number;
  showEquation: boolean;
}> = ({ rows, columns, filledCells, showEquation }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const cell = 110;
  const gap = 14;
  const totalW = columns * cell + (columns - 1) * gap;
  const totalH = rows * cell + (rows - 1) * gap;
  const startX = (TECH.width - totalW) / 2;
  const startY = 720;

  return (
    <svg
      width={TECH.width}
      height={TECH.height}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <GlowFilter id="gridGlow" blur={5} />
      {Array.from({ length: rows * columns }, (_, i) => {
        const r = Math.floor(i / columns);
        const c = i % columns;
        const filled = i < filledCells;
        const x = startX + c * (cell + gap);
        const y = startY + r * (cell + gap);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx={14}
            fill={filled ? TECH.cellActive : TECH.cell}
            stroke={filled ? TECH.accent : TECH.panelBorder}
            strokeWidth={3}
            filter={filled && i === filledCells - 1 ? 'url(#gridGlow)' : undefined}
          />
        );
      })}
      {showEquation ? (
        <text
          x={540}
          y={startY + totalH + 90}
          textAnchor="middle"
          fill={TECH.warn}
          fontSize={48}
          fontFamily={TECH.font}
          fontWeight={700}
        >
          {rows} × {columns} = {rows * columns}
        </text>
      ) : null}
    </svg>
  );
};
