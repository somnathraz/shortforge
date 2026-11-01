import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { beatAt, reelFrames, type TechReelProps } from '../../../src/remotion/techReelModel';

const BG = '#07080b';
const INK = '#f1f0ed';
const MUTED = '#8b8e9e';
const PANEL = '#10121b';
const PANEL_EDGE = '#1a1c24';
const mono = 'SFMono-Regular, Menlo, Consolas, monospace';
const sans = 'Arial, Helvetica, sans-serif';
const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Caption({
  captions,
  time,
  accent
}: {
  captions: TechReelProps['captions'];
  time: number;
  accent: string;
}) {
  const active = captions.findIndex(
    (word, i) =>
      time >= word.start &&
      time < Math.max(word.end, Math.min(captions[i + 1]?.start ?? word.end, word.end + 0.18))
  );
  if (active < 0) return null;
  let start = 0;
  let end = 0;
  while (end <= active) {
    start = end;
    let length = 0;
    do {
      length += captions[end]!.text.length + 1;
      end++;
    } while (
      end < captions.length &&
      end - start < 5 &&
      length + captions[end]!.text.length < 35 &&
      !/[.!?]$/.test(captions[end - 1]!.text)
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 1560,
        left: 75,
        right: 75,
        display: 'flex',
        gap: 11,
        justifyContent: 'center',
        flexWrap: 'wrap',
        fontFamily: sans,
        fontSize: 37,
        lineHeight: 1.5,
        fontWeight: 600
      }}
    >
      {captions.slice(start, end).map((word, i) => (
        <span
          key={start + i}
          style={{
            padding: '0 7px',
            borderRadius: 5,
            color: start + i === active ? '#0b0b0e' : '#b9bbc4',
            background: start + i === active ? accent : '#101116'
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}

function tokenX(index: number, count: number, originX = 540, gap = 118) {
  const width = (count - 1) * gap;
  return originX - width / 2 + index * gap;
}

function Token({
  x,
  y,
  value,
  lit,
  dim,
  accent,
  frame,
  radius = 36
}: {
  x: number;
  y: number;
  value: number;
  lit: boolean;
  dim: boolean;
  accent: string;
  frame: number;
  radius?: number;
}) {
  const color = lit ? accent : '#667085';
  const particlesPerSide = radius <= 20 ? 5 : 8;
  const perimeter = Array.from({ length: particlesPerSide * 4 }, (_, i) => {
    const side = Math.floor(i / particlesPerSide);
    const step = (i % particlesPerSide) / Math.max(1, particlesPerSide - 1);
    if (side === 0) return { x: -radius + step * radius * 2, y: -radius };
    if (side === 1) return { x: radius, y: -radius + step * radius * 2 };
    if (side === 2) return { x: radius - step * radius * 2, y: radius };
    return { x: -radius, y: radius - step * radius * 2 };
  });
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.2 : 1}>
      {lit ? (
        <rect
          x={-radius - 10}
          y={-radius - 10}
          width={(radius + 10) * 2}
          height={(radius + 10) * 2}
          rx={8}
          fill={accent}
          opacity={0.12 + 0.025 * Math.sin(frame / 8)}
          filter="url(#windowSoftGlow)"
        />
      ) : null}
      {perimeter.map((point, i) => {
        const shimmer = 0.76 + 0.24 * Math.sin(frame / 13 + i * 0.8);
        return (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={i % particlesPerSide === 0 ? 2.8 : lit ? 2.1 : 1.6}
            fill={color}
            opacity={lit ? shimmer : 0.45}
          />
        );
      })}
      <text y={12} textAnchor="middle" fill={lit ? INK : '#9ca0ad'} fontFamily={mono} fontSize={30} fontWeight={700}>
        {value}
      </text>
    </g>
  );
}

function WindowFrame({
  x,
  y,
  width,
  label,
  accent,
  opacity = 1
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  accent: string;
  opacity?: number;
}) {
  const h = 118;
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      {Array.from({ length: Math.max(12, Math.round(width / 13)) }, (_, i) => {
        const count = Math.max(12, Math.round(width / 13));
        const px = -width / 2 + (i / (count - 1)) * width;
        return (
          <React.Fragment key={i}>
            <circle cx={px} cy={-h / 2} r={i % 4 === 0 ? 2.8 : 1.6} fill={accent} opacity={0.85} />
            <circle cx={px} cy={h / 2} r={i % 4 === 0 ? 2.8 : 1.6} fill={accent} opacity={0.85} />
          </React.Fragment>
        );
      })}
      {Array.from({ length: 9 }, (_, i) => {
        const py = -h / 2 + (i / 8) * h;
        return (
          <React.Fragment key={`side-${i}`}>
            <circle cx={-width / 2} cy={py} r={i % 4 === 0 ? 2.8 : 1.6} fill={accent} opacity={0.85} />
            <circle cx={width / 2} cy={py} r={i % 4 === 0 ? 2.8 : 1.6} fill={accent} opacity={0.85} />
          </React.Fragment>
        );
      })}
      <text y={-h / 2 - 28} textAnchor="middle" fill={accent} fontFamily={mono} fontSize={18} letterSpacing={3}>
        {label}
      </text>
      <circle cx={-width / 2} cy={0} r={5} fill={accent} filter="url(#windowPacketGlow)" />
      <circle cx={width / 2} cy={0} r={5} fill={accent} filter="url(#windowPacketGlow)" />
      <path
        d={`M ${-width / 2 - 10} ${-h / 2 + 24} V ${-h / 2 - 10} H ${-width / 2 + 24}
            M ${width / 2 - 24} ${-h / 2 - 10} H ${width / 2 + 10} V ${-h / 2 + 24}
            M ${-width / 2 - 10} ${h / 2 - 24} V ${h / 2 + 10} H ${-width / 2 + 24}
            M ${width / 2 - 24} ${h / 2 + 10} H ${width / 2 + 10} V ${h / 2 - 24}`}
        fill="none"
        stroke={accent}
        strokeWidth={2}
      />
    </g>
  );
}

function Rail({ count, y, accent }: { count: number; y: number; accent: string }) {
  const left = tokenX(0, count) - 58;
  const right = tokenX(count - 1, count) + 58;
  return (
    <g>
      {Array.from({ length: count * 5 }, (_, i) => (
        <circle
          key={i}
          cx={left + (i / (count * 5 - 1)) * (right - left)}
          cy={y + 60}
          r={i % 5 === 0 ? 2.2 : 1.1}
          fill={i % 5 === 0 ? accent : '#343746'}
          opacity={i % 5 === 0 ? 0.4 : 0.65}
        />
      ))}
    </g>
  );
}

/** Dark editorial Window Lab — same black/grey language as database-scaling / request-coalescing. */
export const WindowLabReel: React.FC<TechReelProps> = ({ reel, captions }) => {
  const frame = useCurrentFrame();
  const clock = beatAt(reel, frame);
  const beat = reel.beats[clock.index]!;
  const previous = reel.beats[Math.max(0, clock.index - 1)]!.window!;
  const next = beat.window!;
  const transition = ease(clock.local / 40);
  const progress = ease(clock.local / 26);
  const accent = reel.accent || '#f5c56b';
  // Match the orbital sample: amber is UI chrome; diagrams use restrained indigo.
  const diagramAccent = '#8d9be8';
  const leavingAccent = '#b5656b';

  const values = next.values;
  const count = values.length;
  const start = lerp(previous.windowStart, next.windowStart, transition);
  const size = lerp(previous.windowSize, next.windowSize, transition);
  const y = 980;
  const gap = 118;
  const frameCenter = tokenX(0, count) + (start + (size - 1) / 2) * gap;
  const frameWidth = size * gap - 20;
  const stage = next.stage;
  const sum =
    next.sum ??
    values.slice(Math.round(start), Math.round(start) + Math.round(size)).reduce((a, b) => a + b, 0);
  const nestedPulse = (frame / 12) % count;
  const previousStart = previous.windowStart;
  const moving = Math.abs(next.windowStart - previousStart) > 0.01;

  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: INK, overflow: 'hidden' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="windowSoftGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id="windowPacketGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {stage === 'compare' ? (
          <g>
            <text x={270} y={700} textAnchor="middle" fontFamily={mono} fontSize={18} fill={diagramAccent} letterSpacing={2}>
              NESTED / RESCAN
            </text>
            <text x={810} y={700} textAnchor="middle" fontFamily={mono} fontSize={18} fill={MUTED} letterSpacing={2}>
              WINDOW / ONE PASS
            </text>
            {[0, 1, 2].map((row) => (
              <g key={row} opacity={0.45 + (row === Math.floor(frame / 18) % 3 ? 0.55 : 0)}>
                {values.slice(0, 5).map((v, i) => (
                  <Token
                    key={i}
                    x={140 + i * 52}
                    y={780 + row * 90}
                    value={v}
                    lit={i >= row && i < row + 3}
                    dim={false}
                    accent={diagramAccent}
                    frame={frame}
                    radius={18}
                  />
                ))}
              </g>
            ))}
            <g transform="translate(620 0)">
              <Rail count={5} y={900} accent={diagramAccent} />
              {values.slice(0, 5).map((v, i) => (
                <Token
                  key={i}
                  x={tokenX(i, 5, 250, 72)}
                  y={900}
                  value={v}
                  lit={i >= Math.round(start) && i < Math.round(start) + Math.round(size)}
                  dim={false}
                  accent={diagramAccent}
                  frame={frame}
                  radius={20}
                />
              ))}
              <WindowFrame
                x={tokenX(0, 5, 250, 72) + (start + (size - 1) / 2) * 72}
                y={900}
                width={size * 72 - 12}
                label="WINDOW"
                accent={diagramAccent}
              />
            </g>
          </g>
        ) : (
          <g>
            <Rail count={count} y={y} accent={diagramAccent} />
            {values.map((v, i) => {
              const inWindow = i >= start - 0.35 && i <= start + size - 0.65;
              const nestedLit =
                stage === 'nested' && Math.floor(nestedPulse) <= i && i < Math.floor(nestedPulse) + 2;
              return (
                <Token
                  key={i}
                  x={tokenX(i, count)}
                  y={y}
                  value={v}
                  lit={stage === 'nested' ? nestedLit : inWindow}
                  dim={stage !== 'nested' && !inWindow}
                  accent={diagramAccent}
                  frame={frame}
                />
              );
            })}
            {values.map((_, i) => (
              <text
                key={`index-${i}`}
                x={tokenX(i, count)}
                y={y + 92}
                textAnchor="middle"
                fill="#565b6b"
                fontFamily={mono}
                fontSize={16}
              >
                {i}
              </text>
            ))}

            {stage !== 'nested' && stage !== 'cta' ? (
              <>
                {moving && transition < 0.96 ? (
                  <WindowFrame
                    x={tokenX(0, count) + (previousStart + (previous.windowSize - 1) / 2) * gap}
                    y={y}
                    width={previous.windowSize * gap - 20}
                    label="PREVIOUS"
                    accent="#565b6b"
                    opacity={(1 - transition) * 0.7}
                  />
                ) : null}
                <WindowFrame
                  x={frameCenter}
                  y={y}
                  width={frameWidth}
                  label={stage === 'pointers' ? 'L ← WINDOW → R' : 'SLIDING WINDOW'}
                  accent={diagramAccent}
                />
              </>
            ) : null}

            {stage === 'nested' ? (
              <g>
                <path
                  d={`M ${tokenX(Math.floor(nestedPulse) % count, count)} ${y - 90}
                      Q 540 ${y - 210} ${tokenX(Math.min(count - 1, (Math.floor(nestedPulse) % count) + 2), count)} ${y - 90}`}
                  fill="none"
                  stroke={diagramAccent}
                  strokeWidth={1.5}
                  strokeDasharray="3 7"
                  opacity={0.75}
                />
                <text x={540} y={1180} textAnchor="middle" fontFamily={mono} fontSize={22} fill={diagramAccent} letterSpacing={2}>
                  EVERY PAIR · RESCAN
                </text>
              </g>
            ) : null}

            {stage === 'update' ? (
              <g>
                <g transform={`translate(${tokenX(previousStart, count)} ${y - 120})`}>
                  <rect x={-46} y={-26} width={92} height={40} rx={8} fill={PANEL} stroke={leavingAccent} strokeWidth={1.6} />
                  <text y={2} textAnchor="middle" fontFamily={mono} fontSize={18} fill={leavingAccent}>
                    − left
                  </text>
                </g>
                <g transform={`translate(${tokenX(next.windowStart + next.windowSize - 1, count)} ${y - 120})`}>
                  <rect x={-46} y={-26} width={92} height={40} rx={8} fill={PANEL} stroke={diagramAccent} strokeWidth={1.6} />
                  <text y={2} textAnchor="middle" fontFamily={mono} fontSize={18} fill={diagramAccent}>
                    + right
                  </text>
                </g>
              </g>
            ) : null}

            {stage === 'slide' || stage === 'update' || stage === 'frame' ? (
              <g>
                <path
                  d={`M ${frameCenter + frameWidth / 2 + 36} ${y} l 40 0 m -12 -12 l 16 12 l -16 12`}
                  fill="none"
                  stroke={diagramAccent}
                  strokeWidth={2.5}
                />
                <text
                  x={frameCenter + frameWidth / 2 + 96}
                  y={y + 6}
                  fill={diagramAccent}
                  fontFamily={mono}
                  fontSize={16}
                  letterSpacing={2}
                >
                  SLIDE
                </text>
              </g>
            ) : null}

            {stage === 'pointers' ? (
              <g>
                <text
                  x={tokenX(next.left ?? Math.round(start), count)}
                  y={y + 130}
                  textAnchor="middle"
                  fontFamily={mono}
                  fontSize={28}
                  fill={leavingAccent}
                  fontWeight={700}
                >
                  L
                </text>
                <text
                  x={tokenX(next.right ?? Math.round(start + size - 1), count)}
                  y={y + 130}
                  textAnchor="middle"
                  fontFamily={mono}
                  fontSize={28}
                  fill={diagramAccent}
                  fontWeight={700}
                >
                  R
                </text>
              </g>
            ) : null}

            {stage === 'cta' ? (
              <g>
                <rect x={220} y={860} width={640} height={170} rx={16} fill={PANEL} stroke={diagramAccent} strokeWidth={1.8} />
                <text x={540} y={935} textAnchor="middle" fill={INK} fontFamily={sans} fontSize={40} fontWeight={700}>
                  Next: Two Pointers
                </text>
                <text x={540} y={985} textAnchor="middle" fill={diagramAccent} fontFamily={mono} fontSize={20} letterSpacing={2}>
                  ARRAY PROBLEMS · FASTER
                </text>
              </g>
            ) : null}

            {stage !== 'nested' && stage !== 'cta' && next.sum !== undefined ? (
              <g transform="translate(540 1185)">
                <rect x={-130} y={-34} width={260} height={68} rx={12} fill={PANEL} stroke={diagramAccent} strokeWidth={1.6} />
                <text y={12} textAnchor="middle" fill={diagramAccent} fontFamily={mono} fontSize={34} fontWeight={700}>
                  sum = {sum}
                </text>
              </g>
            ) : null}
          </g>
        )}
      </svg>

      <div style={{ position: 'absolute', top: 212, left: 80, right: 80 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: mono,
            fontSize: 17,
            letterSpacing: 2.5
          }}
        >
          <span style={{ color: accent }}>{beat.chapter.toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 7 }}>
            {reel.beats.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 25,
                  height: 5,
                  borderRadius: 5,
                  background: i <= clock.index ? accent : '#272831'
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: sans,
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: -2.4,
            whiteSpace: 'pre-line',
            opacity: 0.5 + 0.5 * progress,
            transform: `translateY(${(1 - progress) * 9}px)`
          }}
        >
          {beat.headline}
        </div>
        <div style={{ marginTop: 23, color: MUTED, fontFamily: mono, fontSize: 20, lineHeight: 1.6 }}>
          {beat.subhead}
        </div>
      </div>

      {beat.metric ? (
        <div
          style={{
            position: 'absolute',
            top: 1435,
            left: 80,
            right: 80,
            textAlign: 'center',
            fontFamily: mono,
            opacity: progress
          }}
        >
          <div style={{ fontSize: 17, letterSpacing: 3, color: '#878b9c', marginBottom: 8 }}>
            {beat.metric.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 38, color: accent, letterSpacing: -1 }}>{beat.metric.value}</div>
        </div>
      ) : null}

      <Caption captions={captions} time={frame / 30} accent={accent} />

      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          bottom: 165,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: mono,
          fontSize: 16,
          letterSpacing: 2,
          color: '#5e6272'
        }}
      >
        <span>CODEWITHSOME</span>
        <span>
          {String(clock.index + 1).padStart(2, '0')} / {String(reel.beats.length).padStart(2, '0')}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          bottom: 139,
          height: 2,
          background: '#1a1c24'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(frame / Math.max(1, reelFrames(reel) - 1)) * 100}%`,
            background: accent,
            opacity: 0.55
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
