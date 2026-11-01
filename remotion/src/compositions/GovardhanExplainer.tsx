import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  CLAIM_LABEL,
  govardhanScript,
  type ClaimType,
  type DemoScene
} from '../demo/govardhanScript';

export const C = {
  bg: '#0B0A14',
  panel: '#15131F',
  line: '#2B2740',
  grid: 'rgba(245,197,66,0.06)',
  saffron: '#F29A3C',
  gold: '#F5C542',
  cyan: '#4FD1C5',
  text: '#F4F1EA',
  muted: '#9A95AE',
  font: "'Kohinoor Devanagari','Noto Sans Devanagari','Devanagari Sangam MN','Mukta',system-ui,sans-serif"
};

export const CLAIM_COLOR: Record<ClaimType, string> = {
  SCRIPTURE: C.gold,
  ESTIMATE: C.cyan,
  ASSUMPTION: C.saffron,
  INTERPRETATION: '#B79CFF',
  TRADITION: '#F28BB0'
};

export const ease = (f: number, from: number, to: number, a = 0, b = 1) =>
  interpolate(f, [from, to], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const useSpring = (delay = 0) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping: 18, stiffness: 120 } });
};

export const Background: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <svg width="1080" height="1920" style={{ position: 'absolute' }}>
      {Array.from({ length: 28 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={1920} stroke={C.grid} strokeWidth={2} />
      ))}
      {Array.from({ length: 49 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 40} x2={1080} y2={i * 40} stroke={C.grid} strokeWidth={2} />
      ))}
    </svg>
    <AbsoluteFill
      style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(242,154,60,0.10), transparent 60%)' }}
    />
  </AbsoluteFill>
);

export const ClaimBadge: React.FC<{ type: ClaimType }> = ({ type }) => {
  const s = useSpring(6);
  const color = CLAIM_COLOR[type];
  return (
    <div
      style={{
        position: 'absolute',
        top: 150,
        left: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 26px',
        borderRadius: 999,
        border: `3px solid ${color}`,
        background: 'rgba(11,10,20,0.8)',
        color,
        fontFamily: C.font,
        fontWeight: 700,
        fontSize: 38,
        letterSpacing: 3,
        opacity: s,
        transform: `translateY(${(1 - s) * -20}px)`
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: 8, background: color }} />
      {CLAIM_LABEL[type].en}
    </div>
  );
};

/** Karaoke-style captions: lines timed by length, words light up as they are spoken. */
export const Captions: React.FC<{ lines: string[]; frames: number }> = ({ lines, frames }) => {
  const f = useCurrentFrame();
  const total = lines.reduce((n, l) => n + l.length, 0);
  let start = 0;
  const timed = lines.map((l) => {
    const dur = (l.length / total) * frames;
    const t = { text: l, start, end: start + dur };
    start += dur;
    return t;
  });
  const cur = timed.find((t) => f >= t.start && f < t.end) ?? timed[timed.length - 1];
  const words = cur.text.split(' ');
  const p = ease(f, cur.start, cur.end - 6);
  const enter = ease(f, cur.start, cur.start + 8);
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        bottom: 250,
        textAlign: 'center',
        fontFamily: C.font,
        fontWeight: 800,
        fontSize: 66,
        lineHeight: 1.3,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 16}px)`,
        textShadow: '0 4px 24px rgba(0,0,0,0.9)'
      }}
    >
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span style={{ color: p >= (i + 0.5) / words.length ? C.gold : C.text }}>{w}</span>{' '}
        </React.Fragment>
      ))}
    </div>
  );
};

export const Mountain: React.FC<{ lift?: number; glow?: number; scale?: number }> = ({ lift = 0, glow = 0.5, scale = 1 }) => (
  <g transform={`translate(0 ${-lift}) scale(${scale})`} style={{ transformOrigin: '540px 700px' }}>
    <defs>
      <linearGradient id="mt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={C.saffron} stopOpacity="0.55" />
        <stop offset="1" stopColor={C.saffron} stopOpacity="0.05" />
      </linearGradient>
    </defs>
    <path
      d="M120 700 L260 520 L340 580 L470 380 L560 470 L650 340 L760 500 L850 450 L960 700 Z"
      fill="url(#mt)"
      stroke={C.saffron}
      strokeWidth={6}
      strokeLinejoin="round"
      style={{ filter: `drop-shadow(0 0 ${20 * glow}px ${C.saffron})` }}
    />
    {/* wireframe facets */}
    <path
      d="M260 520 L470 380 M340 580 L560 470 M470 380 L650 340 M560 470 L760 500 M650 340 L850 450 M470 380 L340 580 M650 340 L560 470"
      stroke={C.saffron}
      strokeOpacity={0.35}
      strokeWidth={3}
      fill="none"
    />
  </g>
);

export const Figure: React.FC<{ x: number; y: number; s?: number; armUp?: boolean }> = ({ x, y, s = 1, armUp = true }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} stroke={C.text} strokeWidth={6} strokeLinecap="round" fill="none">
    <circle cx={0} cy={-70} r={16} fill={C.text} />
    <path d="M0 -50 L0 20 M0 20 L-18 70 M0 20 L18 70" />
    <path d={armUp ? 'M0 -35 L-30 -75 L-30 -120' : 'M0 -35 L-26 0'} />
    <path d="M0 -35 L26 0" />
  </g>
);

const HookScene: React.FC = () => {
  const f = useCurrentFrame();
  const lift = spring({ frame: f - 10, fps: 30, config: { damping: 14, stiffness: 60 } }) * 70;
  const pulse = 0.5 + 0.5 * Math.sin(f / 8);
  const seven = ease(f, 0, 14);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute', top: 330 }}>
        <Mountain lift={lift} glow={0.6 + pulse * 0.6} />
        <Figure x={540} y={880} s={1.6} />
        <line x1={120} y1={940} x2={960} y2={940} stroke={C.line} strokeWidth={4} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 160,
          width: '100%',
          textAlign: 'center',
          fontFamily: C.font,
          fontWeight: 900,
          fontSize: 240,
          color: C.gold,
          opacity: seven,
          transform: `scale(${0.7 + 0.3 * seven})`,
          textShadow: `0 0 60px rgba(245,197,66,0.4)`,
          lineHeight: 1
        }}
      >
        7
        <div style={{ fontSize: 56, color: C.text, fontWeight: 700 }}>YEARS OLD</div>
      </div>
    </AbsoluteFill>
  );
};

const SourceScene: React.FC = () => {
  const rows: { big: string; small: string }[] = [
    { big: 'Left hand', small: 'Held on one hand' },
    { big: '7 days', small: 'Seven days and nights, nonstop' },
    { big: 'Mushroom', small: 'Like a child lifting one in play' }
  ];
  const head = useSpring(4);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 330, left: 60, right: 60 }}>
        <div
          style={{
            fontFamily: C.font,
            color: C.muted,
            fontSize: 40,
            fontWeight: 600,
            opacity: head,
            marginBottom: 30
          }}
        >
          Srimad Bhagavata Purana · Canto 10, Ch. 25
        </div>
        {rows.map((r, i) => (
          <Row key={r.big} {...r} delay={20 + i * 28} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Row: React.FC<{ big: string; small: string; delay: number }> = ({ big, small, delay }) => {
  const s = useSpring(delay);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 30,
        padding: '34px 40px',
        marginBottom: 28,
        borderRadius: 28,
        background: C.panel,
        border: `2px solid ${C.line}`,
        borderLeft: `10px solid ${C.gold}`,
        opacity: s,
        transform: `translateX(${(1 - s) * 120}px)`
      }}
    >
      <div style={{ fontFamily: C.font, fontWeight: 900, fontSize: 84, color: C.gold, minWidth: 330 }}>{big}</div>
      <div style={{ fontFamily: C.font, fontSize: 40, color: C.text, lineHeight: 1.3 }}>{small}</div>
    </div>
  );
};

const Dimension: React.FC<{
  x1: number; y1: number; x2: number; y2: number; label: string; p: number; lx: number; ly: number;
}> = ({ x1, y1, x2, y2, label, p, lx, ly }) => (
  <g opacity={p}>
    <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * p} y2={y1 + (y2 - y1) * p} stroke={C.cyan} strokeWidth={5} />
    <circle cx={x1} cy={y1} r={9} fill={C.cyan} />
    <circle cx={x1 + (x2 - x1) * p} cy={y1 + (y2 - y1) * p} r={9} fill={C.cyan} />
    <text x={lx} y={ly} fill={C.cyan} fontSize={64} fontWeight={800} fontFamily={C.font} textAnchor="middle">
      {label}
    </text>
  </g>
);

const SizeScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute', top: 160 }}>
        <Mountain glow={0.7} />
        <Dimension x1={120} y1={790} x2={960} y2={790} label="≈ 8 km" p={ease(f, 30, 90)} lx={540} ly={880} />
        <Dimension x1={1010} y1={700} x2={1010} y2={340} label="" p={ease(f, 90, 140)} lx={0} ly={0} />
        <text
          x={1010}
          y={300}
          fill={C.cyan}
          fontSize={56}
          fontWeight={800}
          fontFamily={C.font}
          textAnchor="end"
          opacity={ease(f, 120, 150)}
        >
          ≈ 25 m
        </text>
      </svg>
    </AbsoluteFill>
  );
};

export const Count: React.FC<{ to: number; from?: number; start: number; end: number; fmt?: (n: number) => string }> = ({
  to,
  from = 0,
  start,
  end,
  fmt = (n) => Math.round(n).toLocaleString('en-IN')
}) => {
  const f = useCurrentFrame();
  return <>{fmt(ease(f, start, end, from, to))}</>;
};

const WeightScene: React.FC = () => {
  const f = useCurrentFrame();
  const mono = { fontFamily: C.font, fontWeight: 800 as const };
  const Step: React.FC<{ at: number; children: React.ReactNode; color?: string; size?: number }> = ({
    at,
    children,
    color = C.text,
    size = 56
  }) => (
    <div
      style={{
        ...mono,
        fontSize: size,
        color,
        opacity: ease(f, at, at + 12),
        transform: `translateY(${(1 - ease(f, at, at + 12)) * 30}px)`,
        marginBottom: 34
      }}
    >
      {children}
    </div>
  );
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 340, left: 60, right: 60 }}>
        <Step at={10} color={C.muted} size={44}>Volume = length × width × height × ½</Step>
        <Step at={30}>8,000 × 500 × 25 × ½</Step>
        <Step at={55} color={C.cyan} size={72}>
          = <Count to={50} start={55} end={85} /> million m³
        </Step>
        <Step at={95} color={C.muted} size={44}>× 2,600 kg per m³</Step>
        <div
          style={{
            ...mono,
            marginTop: 40,
            padding: '50px 40px',
            borderRadius: 32,
            background: C.panel,
            border: `3px solid ${C.saffron}`,
            textAlign: 'center',
            opacity: ease(f, 120, 135),
            transform: `scale(${0.9 + 0.1 * ease(f, 120, 140)})`,
            boxShadow: `0 0 80px rgba(242,154,60,${0.25 * ease(f, 120, 150)})`
          }}
        >
          <div style={{ fontSize: 40, color: C.muted }}>Weight ≈</div>
          <div style={{ fontSize: 150, color: C.saffron, lineHeight: 1.1 }}>
            <Count to={130} start={125} end={170} /> million
          </div>
          <div style={{ fontSize: 64, color: C.text }}>tonnes</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const CompareCard: React.FC<{
  at: number; title: string; big: string; sub: string; color: string; bars: number;
}> = ({ at, title, big, sub, color, bars }) => {
  const s = useSpring(at);
  const f = useCurrentFrame();
  const fill = ease(f, at + 10, at + 55);
  return (
    <div
      style={{
        padding: '30px 40px',
        marginBottom: 26,
        borderRadius: 28,
        background: C.panel,
        border: `2px solid ${C.line}`,
        borderLeft: `10px solid ${color}`,
        fontFamily: C.font,
        opacity: s,
        transform: `translateY(${(1 - s) * 60}px)`
      }}
    >
      <div style={{ fontSize: 40, color: C.muted, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 96, fontWeight: 900, color, lineHeight: 1.1 }}>{big}</div>
      <div style={{ fontSize: 38, color: C.text, marginBottom: 14 }}>{sub}</div>
      <div style={{ height: 16, borderRadius: 8, background: C.line }}>
        <div style={{ height: 16, borderRadius: 8, width: `${bars * fill}%`, background: color }} />
      </div>
    </div>
  );
};

const CompareScene: React.FC = () => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', top: 290, left: 60, right: 60 }}>
      <CompareCard at={6} title="Burj Khalifa (≈500,000 t)" big="× 260" sub="260 towers stacked up" color={C.gold} bars={100} />
      <CompareCard at={110} title="School bag (≈5 kg)" big="× 26 billion" sub="Over 3 for every person on Earth" color={C.cyan} bars={100} />
      <CompareCard at={230} title="100,000 A100 GPUs (≈150 t)" big="1 / 1,000,000" sub="Whole AI supercomputer’s weight" color={C.saffron} bars={1.5} />
    </div>
  </AbsoluteFill>
);

const CloseScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute', top: 100 }}>
        <Mountain lift={50 + 8 * Math.sin(f / 15)} glow={0.9} scale={0.9} />
        <Figure x={540} y={820} s={1.5} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 150,
          width: '100%',
          textAlign: 'center',
          fontFamily: C.font,
          fontSize: 44,
          color: C.muted,
          opacity: ease(f, 100, 130)
        }}
      >
        Source: Bhagavata Purana 10.25 · Numbers: our assumptions
      </div>
    </AbsoluteFill>
  );
};

const SCENES: Record<DemoScene['id'], React.FC> = {
  hook: HookScene,
  source: SourceScene,
  size: SizeScene,
  weight: WeightScene,
  compare: CompareScene,
  close: CloseScene
};

export const GovardhanExplainer: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background />
      {govardhanScript.map((sc) => {
        const Scene = SCENES[sc.id];
        const start = from;
        from += sc.frames;
        return (
          <Sequence key={sc.id} from={start} durationInFrames={sc.frames} name={sc.id}>
            <Scene />
            {sc.claimType ? <ClaimBadge type={sc.claimType} /> : null}
            <Captions lines={sc.lines} frames={sc.frames} />
          </Sequence>
        );
      })}
      <div
        style={{
          position: 'absolute',
          top: 60,
          width: '100%',
          textAlign: 'center',
          fontFamily: C.font,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 6,
          color: C.gold,
          opacity: 0.85
        }}
      >
        EPICASTRA · EXPLAINED
      </div>
    </AbsoluteFill>
  );
};
