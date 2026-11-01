import React from 'react';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function tokenX(index: number, count: number, originX = 540, gap = 118) {
  return originX - ((count - 1) * gap) / 2 + index * gap;
}

const WindowArrayScene: React.FC<{ context: SceneContext }> = ({ context }) => {
  const { beat, previous, localFrame, durationInFrames } = context;
  const next = beat.window;
  const prev = previous.window || next;
  if (!next) {
    return (
      <div style={{ color: theme.danger, fontFamily: theme.mono, padding: 40 }}>
        window.array requires beat.window
      </div>
    );
  }
  const transition = ease(localFrame / 40);
  const values = next.values;
  const count = values.length;
  const start = lerp(prev!.windowStart, next.windowStart, transition);
  const size = lerp(prev!.windowSize, next.windowSize, transition);
  const y = 200;
  const gap = 118;
  const frameCenter = tokenX(0, count) + (start + (size - 1) / 2) * gap;
  const frameWidth = size * gap - 20;
  const stage = next.stage;
  const accent = theme.node;
  const nestedPulse = (localFrame / 12) % count;
  const sum =
    next.sum ??
    values.slice(Math.round(start), Math.round(start) + Math.round(size)).reduce((a, b) => a + b, 0);

  return (
    <svg width={1080} height={720} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <filter id="tplSoftGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      {values.map((v, i) => {
        const inWindow = i >= start - 0.35 && i <= start + size - 0.65;
        const lit =
          stage === 'nested'
            ? Math.floor(nestedPulse) <= i && i < Math.floor(nestedPulse) + 2
            : inWindow;
        const dim = stage !== 'nested' && !inWindow;
        const color = lit ? accent : '#667085';
        const x = tokenX(i, count);
        const radius = 34;
        return (
          <g key={i} transform={`translate(${x} ${y})`} opacity={dim ? 0.22 : 1}>
            {lit ? (
              <rect
                x={-radius - 8}
                y={-radius - 8}
                width={(radius + 8) * 2}
                height={(radius + 8) * 2}
                rx={8}
                fill={accent}
                opacity={0.12}
                filter="url(#tplSoftGlow)"
              />
            ) : null}
            {Array.from({ length: 28 }, (_, p) => {
              const side = Math.floor(p / 7);
              const step = (p % 7) / 6;
              const pt =
                side === 0
                  ? { x: -radius + step * radius * 2, y: -radius }
                  : side === 1
                    ? { x: radius, y: -radius + step * radius * 2 }
                    : side === 2
                      ? { x: radius - step * radius * 2, y: radius }
                      : { x: -radius, y: radius - step * radius * 2 };
              return (
                <circle
                  key={p}
                  cx={pt.x}
                  cy={pt.y}
                  r={p % 7 === 0 ? 2.6 : 1.7}
                  fill={color}
                  opacity={lit ? 0.85 : 0.4}
                />
              );
            })}
            <text
              y={10}
              textAnchor="middle"
              fill={lit ? theme.text : '#9ca0ad'}
              fontFamily={theme.mono}
              fontSize={28}
              fontWeight={700}
            >
              {v}
            </text>
            <text y={72} textAnchor="middle" fill="#565b6b" fontFamily={theme.mono} fontSize={15}>
              {i}
            </text>
          </g>
        );
      })}
      {stage !== 'nested' && stage !== 'cta' ? (
        <g transform={`translate(${frameCenter} ${y})`}>
          {Array.from({ length: 16 }, (_, i) => {
            const px = -frameWidth / 2 + (i / 15) * frameWidth;
            return (
              <React.Fragment key={i}>
                <circle cx={px} cy={-56} r={i % 4 === 0 ? 2.6 : 1.5} fill={accent} />
                <circle cx={px} cy={56} r={i % 4 === 0 ? 2.6 : 1.5} fill={accent} />
              </React.Fragment>
            );
          })}
          <text y={-72} textAnchor="middle" fill={accent} fontFamily={theme.mono} fontSize={16} letterSpacing={2}>
            SLIDING WINDOW
          </text>
        </g>
      ) : null}
      {next.sum !== undefined && stage !== 'nested' && stage !== 'cta' ? (
        <g transform="translate(540 420)">
          <rect x={-120} y={-30} width={240} height={60} rx={12} fill="#10121b" stroke={accent} strokeWidth={1.5} />
          <text y={10} textAnchor="middle" fill={accent} fontFamily={theme.mono} fontSize={30} fontWeight={700}>
            sum = {sum}
          </text>
        </g>
      ) : null}
      <text x={540} y={520} textAnchor="middle" fill={theme.muted} fontFamily={theme.mono} fontSize={18}>
        stage={stage} · progress {Math.round((localFrame / Math.max(1, durationInFrames - 1)) * 100)}%
      </text>
    </svg>
  );
};

export const meta = {
  id: 'window.array',
  title: 'Sliding-window particle array',
  pack: 'window',
  llm: 'Array sliding window / two pointers. Requires beat.window.',
  status: 'ready' as const
};

export const Scene = WindowArrayScene;
export default { meta, Scene } satisfies SceneTemplateModule;
