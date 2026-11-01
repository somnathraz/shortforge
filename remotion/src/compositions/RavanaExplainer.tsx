import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { ravanaScript, type RavanaScene } from '../demo/ravanaScript';
import {
  Background,
  C,
  Captions,
  ClaimBadge,
  CompareCard,
  Count,
  Mountain,
  Row,
  ease
} from './GovardhanExplainer';

const font = C.font;

/** Ten heads fanned in an arc — the visual shorthand for Dashagriva. */
const Heads: React.FC<{ y?: number; delay?: number }> = ({ y = 560, delay = 0 }) => {
  const f = useCurrentFrame();
  return (
    <g>
      {Array.from({ length: 10 }).map((_, i) => {
        const o = ease(f, delay + i * 5, delay + i * 5 + 10);
        const cx = 140 + i * 88;
        const cy = y - 150 * Math.sin((Math.PI * i) / 9);
        return (
          <g key={i} opacity={o} transform={`translate(${cx} ${cy - (1 - o) * 30})`}>
            <circle r={38} fill={C.panel} stroke={C.gold} strokeWidth={5} style={{ filter: `drop-shadow(0 0 12px ${C.gold})` }} />
            <path d="M-24 -30 L-14 -52 L0 -34 L14 -52 L24 -30" fill="none" stroke={C.gold} strokeWidth={5} strokeLinejoin="round" />
          </g>
        );
      })}
    </g>
  );
};

const Toe: React.FC<{ cy: number; opacity?: number; pulse?: number }> = ({ cy, opacity = 1, pulse = 0 }) => (
  <g opacity={opacity}>
    <ellipse cx={540} cy={cy} rx={78 + pulse * 6} ry={112 + pulse * 8} fill={C.gold} opacity={0.18} />
    <ellipse
      cx={540}
      cy={cy}
      rx={70}
      ry={100}
      fill="#F1C27B"
      stroke={C.gold}
      strokeWidth={6}
      style={{ filter: `drop-shadow(0 0 ${24 + pulse * 20}px ${C.gold})` }}
    />
    <ellipse cx={540} cy={cy + 55} rx={32} ry={22} fill="none" stroke="#B98B3E" strokeWidth={4} />
  </g>
);

const HookScene: React.FC = () => {
  const f = useCurrentFrame();
  const lift = 120 * ease(f, 0, 55) - 120 * ease(f, 78, 86);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <Heads y={560} />
        <g transform={`translate(0 ${560})`}>
          <Mountain lift={lift} glow={0.8} />
        </g>
        <Toe cy={interpolate(f, [55, 80], [600, 840], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} opacity={ease(f, 55, 62)} pulse={Math.max(0, Math.sin(f / 4))} />
        <line x1={120} y1={1270} x2={960} y2={1270} stroke={C.line} strokeWidth={4} />
      </svg>
    </AbsoluteFill>
  );
};

const NameScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 300,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 120,
          color: C.gold,
          letterSpacing: 4,
          opacity: ease(f, 4, 20),
          textShadow: '0 0 50px rgba(245,197,66,0.35)'
        }}
      >
        DASHAGRIVA
      </div>
      <div style={{ position: 'absolute', top: 500, left: 60, right: 60 }}>
        <Row big="Dasha" small="ten" delay={25} />
        <Row big="Griva" small="neck" delay={55} />
        <Row big="Source" small="Valmiki Ramayana · Uttara Kanda" delay={90} />
      </div>
    </AbsoluteFill>
  );
};

const UNIT = 95;
const GROUND = 1280;

const ScaleScene: React.FC = () => {
  const f = useCurrentFrame();
  const mt = ease(f, 10, 70);
  const count = Math.min(8, Math.max(0, Math.floor((f - 40) / 22) + 1));
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <line x1={60} y1={GROUND} x2={1020} y2={GROUND} stroke={C.line} strokeWidth={4} />
        {/* Burj Khalifa stack */}
        {Array.from({ length: 8 }).map((_, i) => {
          const on = ease(f, 40 + i * 22, 40 + i * 22 + 12);
          return (
            <rect
              key={i}
              x={110}
              y={GROUND - UNIT * (i + 1) + 4 + (1 - on) * -60}
              width={170}
              height={UNIT - 8}
              rx={8}
              fill={C.cyan}
              opacity={0.15 + 0.7 * on}
              stroke={C.cyan}
              strokeWidth={3}
            />
          );
        })}
        <text x={195} y={GROUND + 60} textAnchor="middle" fill={C.cyan} fontSize={42} fontWeight={800} fontFamily={font}>
          Burj Khalifa
        </text>
        <text x={195} y={GROUND + 108} textAnchor="middle" fill={C.muted} fontSize={34} fontFamily={font}>
          828 m each
        </text>
        {/* Kailash */}
        <path
          d={`M430 ${GROUND} L610 ${GROUND - UNIT * 4.6} L690 ${GROUND - UNIT * 6} L760 ${GROUND - UNIT * 8.0} L830 ${GROUND - UNIT * 5.5} L940 ${GROUND} Z`}
          fill={C.saffron}
          fillOpacity={0.22 * mt}
          stroke={C.saffron}
          strokeWidth={6}
          strokeLinejoin="round"
          strokeDasharray={2400}
          strokeDashoffset={2400 * (1 - mt)}
          style={{ filter: `drop-shadow(0 0 20px ${C.saffron})` }}
        />
        <text x={690} y={GROUND + 60} textAnchor="middle" fill={C.saffron} fontSize={42} fontWeight={800} fontFamily={font}>
          Mount Kailash
        </text>
        <text x={690} y={GROUND + 108} textAnchor="middle" fill={C.muted} fontSize={34} fontFamily={font}>
          ≈ 6,638 m
        </text>
        {/* height match line */}
        <line
          x1={110}
          y1={GROUND - UNIT * 8}
          x2={110 + 770 * ease(f, 190, 230)}
          y2={GROUND - UNIT * 8}
          stroke={C.gold}
          strokeWidth={4}
          strokeDasharray="14 10"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 300,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 130,
          color: C.gold,
          lineHeight: 1
        }}
      >
        {count} ×
        <div style={{ fontSize: 44, color: C.text, fontWeight: 700 }}>Burj Khalifa ≈ Kailash</div>
      </div>
    </AbsoluteFill>
  );
};

const LiftScene: React.FC = () => {
  const f = useCurrentFrame();
  const shake = Math.sin(f * 1.7) * 7 * ease(f, 60, 100);
  const lift = 40 * ease(f, 40, 120);
  const arms = ease(f, 10, 60);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute', top: -260 }}>
        <g transform={`translate(${shake} 520)`}>
          <Mountain lift={lift} glow={0.5 + 0.5 * ease(f, 60, 100)} />
        </g>
        {/* tremor rings */}
        {[0, 1, 2].map((i) => {
          const t = ((f - 60 - i * 18) % 54) / 54;
          return t > 0 ? (
            <ellipse key={i} cx={540} cy={1220} rx={200 + t * 380} ry={30 + t * 60} fill="none" stroke={C.saffron} strokeWidth={4} opacity={(1 - t) * 0.6} />
          ) : null;
        })}
        {/* twenty arms */}
        {Array.from({ length: 20 }).map((_, i) => {
          const x = 180 + i * 38;
          const top = 1220 - lift;
          const bx = 540 + (i - 9.5) * 14;
          const by = 1520;
          return (
            <line
              key={i}
              x1={bx}
              y1={by}
              x2={bx + (x - bx) * arms}
              y2={by + (top - by) * arms}
              stroke={C.gold}
              strokeWidth={7}
              strokeLinecap="round"
              opacity={0.9}
            />
          );
        })}
        <ellipse cx={540} cy={1540} rx={150} ry={46} fill={C.panel} stroke={C.gold} strokeWidth={5} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 290,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 150,
          color: C.gold,
          lineHeight: 1
        }}
      >
        <Count to={20} start={10} end={60} />
        <span style={{ fontSize: 56, color: C.text, marginLeft: 20 }}>arms</span>
      </div>
    </AbsoluteFill>
  );
};

const ToeScene: React.FC = () => {
  const f = useCurrentFrame();
  const press = ease(f, 20, 60);
  const pulse = 0.5 + 0.5 * Math.sin(f / 5);
  const squash = 1 - 0.12 * press;
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute', top: -260 }}>
        <g transform={`translate(0 ${520 + 700 * (1 - squash)}) scale(1 ${squash})`} style={{ transformOrigin: '540px 700px' }}>
          <Mountain glow={0.4} />
        </g>
        {Array.from({ length: 20 }).map((_, i) => {
          const x = 180 + i * 38;
          const bx = 540 + (i - 9.5) * 14;
          return (
            <line
              key={i}
              x1={bx}
              y1={1520}
              x2={x}
              y2={1222 + 6 * Math.sin(i + f / 3) * press}
              stroke={C.gold}
              strokeWidth={7}
              strokeLinecap="round"
              opacity={0.55}
            />
          );
        })}
        <ellipse cx={540} cy={1540} rx={150} ry={46} fill={C.panel} stroke={C.gold} strokeWidth={5} />
        <Toe cy={interpolate(f, [10, 55], [560, 1020], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} pulse={pulse * press} />
        {/* downward force arrows */}
        {[-170, 170].map((dx) => (
          <path
            key={dx}
            d={`M${540 + dx} 820 L${540 + dx} 960 M${540 + dx - 26} 930 L${540 + dx} 962 L${540 + dx + 26} 930`}
            stroke={C.cyan}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={ease(f, 60, 80) * pulse}
          />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 290,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
          fontFamily: font,
          fontWeight: 900,
          opacity: ease(f, 100, 125)
        }}
      >
        <div style={{ fontSize: 80, color: C.gold }}>20 arms</div>
        <div style={{ fontSize: 80, color: C.muted }}>vs</div>
        <div style={{ fontSize: 80, color: '#F1C27B' }}>1 toe</div>
      </div>
    </AbsoluteFill>
  );
};

const MindsScene: React.FC = () => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', top: 290, left: 60, right: 60 }}>
      <CompareCard at={6} title="One human brain" big="≈ 20 W" sub="one mind" color={C.cyan} bars={5} />
      <CompareCard at={110} title="Ravana: ten brains" big="≈ 200 W" sub="ten minds in parallel" color={C.gold} bars={50} />
      <CompareCard at={220} title="One NVIDIA A100 GPU" big="≈ 400 W" sub="peak power draw" color={C.saffron} bars={100} />
    </div>
  </AbsoluteFill>
);

const RoarScene: React.FC = () => {
  const f = useCurrentFrame();
  const swap = ease(f, 120, 150);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        {[0, 1, 2, 3].map((i) => {
          const t = ((f - i * 22) % 88) / 88;
          return t > 0 ? <circle key={i} cx={540} cy={640} r={80 + t * 460} fill="none" stroke={C.saffron} strokeWidth={6} opacity={(1 - t) * 0.7} /> : null;
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 540,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 110,
          letterSpacing: 4,
          color: C.gold,
          opacity: 1 - swap,
          transform: `scale(${1 + 0.1 * swap})`
        }}
      >
        DASHAGRIVA
      </div>
      <div
        style={{
          position: 'absolute',
          top: 500,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          opacity: swap,
          transform: `scale(${0.8 + 0.2 * swap})`
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 170, color: C.saffron, textShadow: `0 0 60px ${C.saffron}` }}>RAVANA</div>
        <div style={{ fontSize: 50, color: C.text, marginTop: 10 }}>rava = a roar, a cry</div>
      </div>
    </AbsoluteFill>
  );
};

const CloseScene: React.FC = () => {
  const f = useCurrentFrame();
  const a = ease(f, 10, 30);
  const b = ease(f, 90, 115);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <g transform="translate(0 520)">
          <Mountain glow={0.5} scale={0.9} />
        </g>
        <Toe cy={880} pulse={0.5 + 0.5 * Math.sin(f / 10)} />
      </svg>
      <div style={{ position: 'absolute', top: 280, width: '100%', textAlign: 'center', fontFamily: font, fontWeight: 900 }}>
        <div style={{ fontSize: 76, color: C.text, opacity: a }}>Lifted a mountain.</div>
        <div style={{ fontSize: 76, color: '#B79CFF', opacity: b, marginTop: 10 }}>Couldn’t lift his ego.</div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1240,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontSize: 36,
          color: C.muted,
          opacity: ease(f, 130, 160)
        }}
      >
        Source: Valmiki Ramayana, Uttara Kanda · Numbers are estimates
      </div>
    </AbsoluteFill>
  );
};

const SCENES: Record<RavanaScene['id'], React.FC> = {
  hook: HookScene,
  name: NameScene,
  scale: ScaleScene,
  lift: LiftScene,
  toe: ToeScene,
  minds: MindsScene,
  roar: RoarScene,
  close: CloseScene
};

export const RavanaExplainer: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background />
      {ravanaScript.map((sc) => {
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
          fontFamily: font,
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
