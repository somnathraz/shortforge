import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';

export type BookingHallCardProps = {
  title?: string;
  subtitle?: string;
  movieTitle?: string;
  seatId?: string;
  seatStatus?: 'AVAILABLE' | 'BOOKED';
  rows?: number;
  cols?: number;
  /** Show dual BOOK taps under the hall. */
  showDualBook?: boolean;
  /** Optional Remotion code teaser under the hall (hook challenge). */
  teaserLines?: string[];
};

/** Cinema seat map for booking race hooks — all labels are Remotion text. */
export const BookingHallCard: React.FC<BookingHallCardProps> = ({
  title = 'BOOKING MANAGER',
  subtitle = 'Interview scenario · one seat left',
  movieTitle = 'FRIDAY NIGHT · SCREEN 3',
  seatId = 'A12',
  seatStatus = 'AVAILABLE',
  rows = 5,
  cols = 8,
  showDualBook = true,
  teaserLines = []
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const pulse = 0.55 + 0.45 * Math.sin(frame / 8);

  const targetRow = 1;
  const targetCol = Math.min(cols - 1, 3);
  const seatW = Math.min(78, Math.floor(820 / cols) - 8);
  const seatH = 52;
  const gap = 10;
  const gridW = cols * seatW + (cols - 1) * gap;
  const originX = (1080 - gridW) / 2;
  const originY = 520;

  return (
    <div style={{ position: 'absolute', inset: 0, opacity, fontFamily: TECH.font }}>
      <div
        style={{
          position: 'absolute',
          top: 210,
          left: 72,
          right: 72,
          textAlign: 'center',
          color: TECH.text,
          fontSize: 46,
          fontWeight: 700
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 280,
          left: 80,
          right: 80,
          textAlign: 'center',
          color: TECH.muted,
          fontSize: 28
        }}
      >
        {subtitle}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 360,
          left: 120,
          right: 120,
          height: 70,
          borderRadius: 12,
          background: 'linear-gradient(180deg, #2A3140 0%, #1A1F2A 100%)',
          border: `2px solid ${TECH.panelBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: TECH.muted,
          fontSize: 26,
          letterSpacing: 2
        }}
      >
        {movieTitle}
      </div>

      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const x = originX + c * (seatW + gap);
            const y = originY + r * (seatH + gap);
            const isTarget = r === targetRow && c === targetCol;
            const fill = isTarget
              ? seatStatus === 'BOOKED'
                ? TECH.warn
                : `rgba(61, 220, 151, ${0.45 + pulse * 0.45})`
              : TECH.cell;
            const stroke = isTarget ? TECH.accent : TECH.panelBorder;
            return (
              <g key={`${r}-${c}`}>
                <rect
                  x={x}
                  y={y}
                  width={seatW}
                  height={seatH}
                  rx={10}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isTarget ? 3 : 2}
                />
                {isTarget ? (
                  <text
                    x={x + seatW / 2}
                    y={y + seatH / 2 + 8}
                    textAnchor="middle"
                    fill={TECH.text}
                    fontSize={22}
                    fontFamily={TECH.font}
                    fontWeight={700}
                  >
                    {seatId}
                  </text>
                ) : null}
              </g>
            );
          })
        )}
      </svg>

      <div
        style={{
          position: 'absolute',
          top: originY + rows * (seatH + gap) + 24,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: seatStatus === 'BOOKED' ? TECH.warn : TECH.accent,
          fontSize: 32,
          fontWeight: 700
        }}
      >
        Seat {seatId} · {seatStatus}
      </div>

      {showDualBook ? (
        <div
          style={{
            position: 'absolute',
            top: originY + rows * (seatH + gap) + 90,
            left: 72,
            right: 72,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 24
          }}
        >
          {['Request A', 'Request B'].map((label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                borderRadius: 18,
                padding: '22px 16px',
                background: i === 0 ? '#152238' : '#2A1C10',
                border: `2px solid ${i === 0 ? TECH.glow : TECH.warn}`,
                textAlign: 'center'
              }}
            >
              <div style={{ color: TECH.muted, fontSize: 22, marginBottom: 10 }}>{label}</div>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 28px',
                  borderRadius: 999,
                  background: i === 0 ? TECH.glow : TECH.warn,
                  color: '#0A0A0C',
                  fontSize: 28,
                  fontWeight: 800
                }}
              >
                BOOK
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {teaserLines.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            bottom: 220,
            left: 56,
            right: 56,
            borderRadius: 18,
            background: TECH.panel,
            border: `2px solid ${TECH.warn}`,
            padding: '20px 22px'
          }}
        >
          <div style={{ color: TECH.warn, fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            YOUR INTERVIEW CODE
          </div>
          {teaserLines.slice(0, 4).map((line, index) => (
            <div
              key={index}
              style={{
                color: TECH.text,
                fontSize: 24,
                lineHeight: 1.45,
                whiteSpace: 'pre'
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
