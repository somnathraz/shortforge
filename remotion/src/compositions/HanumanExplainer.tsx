import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { hanumanScript, type HanumanScene } from '../demo/hanumanScript';
import { Background, C, Captions, ClaimBadge, CompareCard, Count, Row, ease } from './GovardhanExplainer';

const font = C.font;

const Sun: React.FC<{ cx: number; cy: number; r: number; pulse?: number }> = ({ cx, cy, r, pulse = 0 }) => (
  <g>
    <defs>
      <radialGradient id={`sun-${cx}-${cy}-${r}`}>
        <stop offset="0" stopColor="#FFE08A" />
        <stop offset="0.6" stopColor={C.gold} />
        <stop offset="1" stopColor={C.saffron} />
      </radialGradient>
    </defs>
    <circle cx={cx} cy={cy} r={r * 1.5} fill={C.saffron} opacity={0.10 + pulse * 0.05} />
    <circle cx={cx} cy={cy} r={r * 1.2} fill={C.gold} opacity={0.12} />
    <circle cx={cx} cy={cy} r={r} fill={`url(#sun-${cx}-${cy}-${r})`} style={{ filter: `drop-shadow(0 0 40px ${C.saffron})` }} />
  </g>
);

const Earth: React.FC<{ cx: number; cy: number; r: number }> = ({ cx, cy, r }) => (
  <circle cx={cx} cy={cy} r={r} fill={C.cyan} stroke="#bff5ee" strokeWidth={Math.max(1, r / 10)} />
);

const HookScene: React.FC = () => {
  const f = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(f / 10);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <Sun cx={540} cy={560} r={170} pulse={pulse} />
        <line x1={540} y1={760} x2={540} y2={1150 * ease(f, 20, 70) + 760 * (1 - ease(f, 20, 70))} stroke={C.cyan} strokeWidth={4} strokeDasharray="14 12" />
        <Earth cx={540} cy={1180} r={30} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 860,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          color: C.gold,
          opacity: ease(f, 70, 95),
          transform: `scale(${0.8 + 0.2 * ease(f, 70, 95)})`
        }}
      >
        <span style={{ fontSize: 190 }}>3%</span>
        <div style={{ fontSize: 48, color: C.text, fontWeight: 700 }}>off the real distance</div>
      </div>
    </AbsoluteFill>
  );
};

const MathScene: React.FC = () => {
  const f = useCurrentFrame();
  const card = ease(f, 170, 190);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 280, left: 60, right: 60 }}>
        <Row big="12,000" small="yuga" delay={8} />
        <Row big="× 1,000" small="sahasra" delay={40} />
        <Row big="× 8 miles" small="yojana" delay={72} />
        <div
          style={{
            marginTop: 10,
            padding: '30px 40px',
            borderRadius: 28,
            background: C.panel,
            border: `3px solid ${C.gold}`,
            fontFamily: font,
            opacity: card,
            transform: `translateY(${(1 - card) * 40}px)`
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 900, color: C.gold }}>= 96 million mi</div>
          <div style={{ fontSize: 44, color: C.cyan, fontWeight: 700 }}>Actual: 93 million mi</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CaveatScene: React.FC = () => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', top: 290, left: 60, right: 60 }}>
      <CompareCard at={6} title="Actual Earth–Sun distance" big="93M mi" sub="measured" color={C.cyan} bars={86} />
      <CompareCard at={80} title="If a yojana = 8 miles" big="96M mi" sub="+3% — strikingly close" color={C.gold} bars={89} />
      <CompareCard at={150} title="If a yojana = 9 miles" big="108M mi" sub="+16% — the match fades" color={C.saffron} bars={100} />
    </div>
  </AbsoluteFill>
);

const DistanceScene: React.FC = () => {
  const f = useCurrentFrame();
  const jet = ease(f, 20, 300);
  const lightT = (f % 34) / 34;
  const x0 = 200;
  const x1 = 940;
  const y = 780;
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <Sun cx={110} cy={y} r={90} />
        <line x1={x0} y1={y} x2={x1} y2={y} stroke={C.line} strokeWidth={5} strokeDasharray="12 12" />
        <Earth cx={980} cy={y} r={24} />
        {/* light pulse */}
        <circle cx={x0 + (x1 - x0) * lightT} cy={y - 50} r={12} fill={C.gold} style={{ filter: `drop-shadow(0 0 14px ${C.gold})` }} />
        {/* jet */}
        <circle cx={x0 + (x1 - x0) * jet} cy={y + 50} r={14} fill={C.text} />
        <text x={x0} y={y - 90} fill={C.gold} fontSize={40} fontWeight={800} fontFamily={font}>Light · 8 min 20 s</text>
        <text x={x0} y={y + 130} fill={C.text} fontSize={40} fontWeight={800} fontFamily={font}>Passenger jet (900 km/h)</text>
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 300,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 190,
          color: C.text,
          lineHeight: 1
        }}
      >
        <Count to={19} start={20} end={300} />
        <span style={{ fontSize: 60, color: C.muted, marginLeft: 16 }}>years by jet</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1040,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontSize: 44,
          color: C.cyan,
          fontWeight: 700,
          opacity: ease(f, 20, 40)
        }}
      >
        149.6 million km
      </div>
    </AbsoluteFill>
  );
};

const HeatScene: React.FC = () => {
  const f = useCurrentFrame();
  const approach = ease(f, 40, 230);
  const sunY = 590;
  const earthY = 1170;
  const startY = earthY - 40;
  const endY = sunY + 140 + 0.04 * (earthY - sunY - 140);
  const py = startY + (endY - startY) * approach;
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <Sun cx={540} cy={sunY} r={130} pulse={0.5 + 0.5 * Math.sin(f / 6)} />
        <line x1={540} y1={sunY + 140} x2={540} y2={earthY} stroke={C.line} strokeWidth={4} strokeDasharray="12 12" />
        <Earth cx={540} cy={earthY} r={26} />
        <g transform={`translate(540 ${py})`}>
          <rect x={-34} y={-46} width={68} height={14} rx={4} fill={C.muted} />
          <polygon points="-18,-32 18,-32 10,0 -10,0" fill={C.cyan} />
        </g>
        <text x={620} y={py - 10} fill={C.cyan} fontSize={38} fontWeight={800} fontFamily={font}>Parker Solar Probe</text>
        <text x={620} y={py + 36} fill={C.muted} fontSize={32} fontFamily={font}>≈ 6 million km away</text>
        <text x={620} y={earthY + 8} fill={C.muted} fontSize={32} fontFamily={font}>Earth</text>
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 280,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 120,
          color: C.saffron,
          lineHeight: 1,
          opacity: ease(f, 6, 24)
        }}
      >
        <Count to={5500} start={6} end={50} fmt={(n) => Math.round(n).toLocaleString('en-US')} /> °C
      </div>
    </AbsoluteFill>
  );
};

const VayuScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = ease(f, 15, 240);
  const x = 230 + (640 - 230) * p;
  const y = 1130 + (700 - 1130) * p;
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <Sun cx={830} cy={560} r={120} pulse={0.5 + 0.5 * Math.sin(f / 8)} />
        {/* cooling wind trail */}
        {[0, 1, 2, 3, 4].map((i) => {
          const t = Math.max(0, p - i * 0.05);
          const wx = 230 + (640 - 230) * t;
          const wy = 1130 + (700 - 1130) * t + (i - 2) * 26;
          return (
            <path
              key={i}
              d={`M${wx - 90} ${wy + 40} Q${wx - 40} ${wy - 10} ${wx} ${wy}`}
              stroke={C.cyan}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
              opacity={0.75 - i * 0.12}
            />
          );
        })}
        {/* baby Hanuman */}
        <g transform={`translate(${x} ${y})`}>
          <circle r={26} fill={C.text} />
          <circle cx={-8} cy={-4} r={4} fill={C.bg} />
          <circle cx={8} cy={-4} r={4} fill={C.bg} />
          <path d="M-16 24 Q0 70 16 24" fill={C.saffron} stroke={C.saffron} strokeWidth={4} />
        </g>
        <text x={120} y={1260} fill={C.cyan} fontSize={46} fontWeight={800} fontFamily={font}>VAYU · cooling wind</text>
      </svg>
    </AbsoluteFill>
  );
};

const NameScene: React.FC = () => {
  const f = useCurrentFrame();
  const flash = ease(f, 8, 12) - ease(f, 18, 30);
  const swap = ease(f, 110, 140);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <rect width="1080" height="1920" fill="#fff" opacity={flash * 0.35} />
        <polyline
          points="640,250 560,540 620,540 520,860 600,860 470,1120"
          fill="none"
          stroke={C.gold}
          strokeWidth={14}
          strokeLinejoin="round"
          opacity={Math.max(0, flash)}
          style={{ filter: `drop-shadow(0 0 30px ${C.gold})` }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 560,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 120,
          letterSpacing: 4,
          color: C.gold,
          opacity: ease(f, 40, 60) * (1 - swap)
        }}
      >
        HANU = jaw
      </div>
      <div
        style={{
          position: 'absolute',
          top: 520,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 150,
          letterSpacing: 4,
          color: C.saffron,
          textShadow: `0 0 50px ${C.saffron}`,
          opacity: swap,
          transform: `scale(${0.8 + 0.2 * swap})`
        }}
      >
        HANUMAN
      </div>
    </AbsoluteFill>
  );
};

const ScaleScene: React.FC = () => {
  const f = useCurrentFrame();
  const s = ease(f, 6, 50);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute' }}>
        <Sun cx={540} cy={820} r={320 * s} />
        <Earth cx={900} cy={1230} r={3.5} />
        <text x={900} y={1262} textAnchor="middle" fill={C.cyan} fontSize={32} fontWeight={800} fontFamily={font}>Earth</text>
        <line x1={900} y1={1223} x2={900} y2={1200} stroke={C.cyan} strokeWidth={2} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 290,
          width: '100%',
          textAlign: 'center',
          fontFamily: font,
          fontWeight: 900,
          fontSize: 120,
          color: C.gold,
          lineHeight: 1.05,
          opacity: ease(f, 40, 70)
        }}
      >
        <Count to={1300000} start={40} end={140} fmt={(n) => Math.round(n).toLocaleString('en-US')} />
        <div style={{ fontSize: 48, color: C.text, fontWeight: 700 }}>Earths fit inside the Sun</div>
      </div>
    </AbsoluteFill>
  );
};

const SCENES: Record<HanumanScene['id'], React.FC> = {
  hook: HookScene,
  math: MathScene,
  caveat: CaveatScene,
  distance: DistanceScene,
  heat: HeatScene,
  vayu: VayuScene,
  name: NameScene,
  scale: ScaleScene
};

export const HanumanExplainer: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background />
      {hanumanScript.map((sc) => {
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
