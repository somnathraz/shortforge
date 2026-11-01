import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';

export type CodePanelCardProps = {
  title?: string;
  subtitle?: string;
  filename?: string;
  language?: 'python' | 'sql' | 'text';
  lines: string[];
  /** How many lines to show (1-based reveal). 0 = none yet; >= lines.length = all. */
  revealCount: number;
  /** 0-based highlight; null = none. */
  highlightIndex: number | null;
  variant?: 'buggy' | 'fixed' | 'neutral';
  badge?: string | null;
  requestA?: string | null;
  requestB?: string | null;
  seatId?: string;
  seatStatus?: 'AVAILABLE' | 'BOOKED' | null;
  /** Template shell clips above y=520, so put the request chips under the panel. */
  chipsBelow?: boolean;
};

const VARIANT_COLOR = {
  buggy: TECH.warn,
  fixed: TECH.accent,
  neutral: TECH.glow
} as const;

function tintLine(line: string, language: string): Array<{ text: string; color: string }> {
  if (!line.trim()) return [{ text: ' ', color: TECH.muted }];
  if (language === 'sql') {
    const parts = line.split(/(\bUPDATE\b|\bSET\b|\bWHERE\b|\bAND\b|'[^']*'|\d+)/gi);
    return parts.filter(Boolean).map((part) => {
      if (/^(UPDATE|SET|WHERE|AND)$/i.test(part)) return { text: part, color: '#7EB6FF' };
      if (/^'.*'$/.test(part)) return { text: part, color: TECH.accent };
      return { text: part, color: TECH.text };
    });
  }
  const parts = line.split(
    /(\bseat\b|\bdb\b|\bif\b|\breturn\b|\bstatus\b|"[^"]*"|'[^']*'|==|=)/gi
  );
  return parts.filter(Boolean).map((part) => {
    if (/^(if|return)$/i.test(part)) return { text: part, color: '#C792EA' };
    if (/^(seat|db|status)$/i.test(part)) return { text: part, color: '#7EB6FF' };
    if (/^["'].*["']$/.test(part)) return { text: part, color: TECH.accent };
    if (part === '==' || part === '=') return { text: part, color: TECH.warn };
    return { text: part, color: TECH.text };
  });
}

/** Remotion monospace code panel — never bake glyphs into AI stills. */
export const CodePanelCard: React.FC<CodePanelCardProps> = ({
  title,
  subtitle,
  filename = 'booking.py',
  language = 'python',
  lines,
  revealCount,
  highlightIndex,
  variant = 'neutral',
  badge,
  requestA,
  requestB,
  seatId = 'A12',
  seatStatus,
  chipsBelow = false
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const accent = VARIANT_COLOR[variant];
  const visible = Math.max(0, Math.min(lines.length, revealCount));
  const lineH = lines.length > 8 ? 52 : 62;
  const panelTop = title || subtitle ? 520 : 460;
  const panelH = Math.min(980, 140 + visible * lineH + 80);
  const chipsTop = chipsBelow ? panelTop + 140 + lines.length * lineH + 80 + 136 : 360;

  return (
    <div style={{ position: 'absolute', inset: 0, opacity, fontFamily: TECH.font }}>
      {title ? (
        <div
          style={{
            position: 'absolute',
            top: 220,
            left: 72,
            right: 72,
            textAlign: 'center',
            color: TECH.text,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 0.5
          }}
        >
          {title}
        </div>
      ) : null}
      {subtitle ? (
        <div
          style={{
            position: 'absolute',
            top: 290,
            left: 80,
            right: 80,
            textAlign: 'center',
            color: TECH.muted,
            fontSize: 28
          }}
        >
          {subtitle}
        </div>
      ) : null}

      {(requestA || requestB || seatStatus) && (
        <div
          style={{
            position: 'absolute',
            top: chipsTop,
            left: 72,
            right: 72,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16
          }}
        >
          <div
            style={{
              flex: 1,
              padding: '14px 18px',
              borderRadius: 14,
              background: requestA ? '#1A2740' : TECH.panel,
              border: `2px solid ${requestA ? TECH.glow : TECH.panelBorder}`,
              color: requestA ? TECH.text : TECH.muted,
              fontSize: 24,
              textAlign: 'center'
            }}
          >
            {requestA || 'Request A'}
          </div>
          <div
            style={{
              minWidth: 150,
              padding: '14px 18px',
              borderRadius: 14,
              background: TECH.panel,
              border: `2px solid ${seatStatus === 'BOOKED' ? TECH.warn : TECH.accent}`,
              color: seatStatus === 'BOOKED' ? TECH.warn : TECH.accent,
              fontSize: 24,
              textAlign: 'center',
              fontWeight: 700
            }}
          >
            {seatId} · {seatStatus || '—'}
          </div>
          <div
            style={{
              flex: 1,
              padding: '14px 18px',
              borderRadius: 14,
              background: requestB ? '#3A2410' : TECH.panel,
              border: `2px solid ${requestB ? TECH.warn : TECH.panelBorder}`,
              color: requestB ? TECH.text : TECH.muted,
              fontSize: 24,
              textAlign: 'center'
            }}
          >
            {requestB || 'Request B'}
          </div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: panelTop,
          left: 56,
          right: 56,
          height: panelH,
          borderRadius: 22,
          background: TECH.panel,
          border: `3px solid ${accent}`,
          boxShadow: `0 0 40px ${accent}33`,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '18px 22px',
            borderBottom: `1px solid ${TECH.panelBorder}`,
            background: '#121218'
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 99, background: '#FF5F56' }} />
          <span style={{ width: 12, height: 12, borderRadius: 99, background: '#FFBD2E' }} />
          <span style={{ width: 12, height: 12, borderRadius: 99, background: '#27C93F' }} />
          <span style={{ marginLeft: 14, color: TECH.muted, fontSize: 22 }}>{filename}</span>
          <span
            style={{
              marginLeft: 'auto',
              color: accent,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase'
            }}
          >
            {variant === 'buggy' ? 'BUGGY' : variant === 'fixed' ? 'FIXED' : language.toUpperCase()}
          </span>
        </div>

        <div style={{ padding: '22px 18px 28px 12px' }}>
          {lines.slice(0, visible).map((line, index) => {
            const active = highlightIndex === index;
            const tokens = tintLine(line, language);
            return (
              <div
                key={`${index}-${line}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  minHeight: lineH,
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: active ? `${accent}22` : 'transparent',
                  borderLeft: active ? `4px solid ${accent}` : '4px solid transparent'
                }}
              >
                <span
                  style={{
                    width: 44,
                    color: TECH.muted,
                    fontSize: 22,
                    textAlign: 'right',
                    paddingRight: 14,
                    userSelect: 'none'
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ flex: 1, fontSize: language === 'sql' ? 28 : 30, lineHeight: 1.35 }}>
                  {tokens.map((token, ti) => (
                    <span key={ti} style={{ color: token.color }}>
                      {token.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {badge ? (
        <div
          style={{
            position: 'absolute',
            top: panelTop + panelH + 36,
            left: 80,
            right: 80,
            textAlign: 'center',
            padding: '18px 24px',
            borderRadius: 16,
            background: '#1A1A22',
            border: `2px solid ${accent}`,
            color: accent,
            fontSize: 32,
            fontWeight: 700
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
};
