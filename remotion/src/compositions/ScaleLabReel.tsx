import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { beatAt, type TechReelProps } from '../../../src/remotion/techReelModel';

const PAPER = '#f3f0e7';
const INK = '#183e3a';
const ORANGE = '#d95632';
const MUTED = '#71817a';
const mono = 'Menlo, Consolas, monospace';
const sans = 'Arial, Helvetica, sans-serif';
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Machine({ cores, memory, frame, upgrading, offline }: { cores: number; memory: number; frame: number; upgrading: boolean; offline: boolean }) {
  const height = 250 + Math.min(1, cores / 16) * 140;
  return <g>
    <ellipse cx={25} cy={38} rx={230} ry={39} fill={INK} opacity={0.06} />
    <path d={`M -155 ${-height} L -75 ${-height - 48} H 235 L 155 ${-height} Z`} fill="#b9cac0" stroke={INK} strokeWidth={3} />
    <path d={`M 155 ${-height} L 235 ${-height - 48} V -48 L 155 0 Z`} fill="#8aa69b" stroke={INK} strokeWidth={3} />
    <rect x={-155} y={-height} width={310} height={height} rx={5} fill={INK} />
    <text x={-127} y={-height + 41} fill={PAPER} fontFamily={mono} fontSize={20} letterSpacing={3}>SERVER / 01</text>
    <circle cx={122} cy={-height + 34} r={6} fill={offline ? ORANGE : '#a4c7a7'} opacity={offline ? 0.3 + 0.7 * Math.abs(Math.sin(frame / 7)) : 1} />
    <line x1={-125} x2={125} y1={-height + 61} y2={-height + 61} stroke={PAPER} opacity={0.2} />
    {Array.from({ length: 16 }, (_, i) => {
      const visible = Math.max(0, Math.min(1, cores - i));
      const x = -119 + i % 4 * 65;
      const y = -height + 88 + Math.floor(i / 4) * 43;
      return <g key={i} opacity={visible} transform={`translate(${upgrading ? (1 - visible) * 80 : 0} 0)`}>
        <rect x={x} y={y} width={44} height={28} rx={2} fill={i < 2 ? '#96bca7' : ORANGE} />
        <path d={`M ${x - 4} ${y + 8} h -5 M ${x - 4} ${y + 19} h -5 M ${x + 48} ${y + 8} h 5 M ${x + 48} ${y + 19} h 5`} stroke={PAPER} strokeWidth={2} opacity={0.5} />
      </g>;
    })}
    {Array.from({ length: 4 }, (_, i) => <g key={i} opacity={Math.max(0.12, Math.min(1, memory / 8 - i))}>
      <rect x={-119 + i * 65} y={-55} width={44} height={22} fill="#a4c7a7" rx={2} />
      <path d={`M ${-114 + i * 65} -32 v 5 m 10 -5 v 5 m 10 -5 v 5 m 10 -5 v 5`} stroke="#d9ca83" strokeWidth={3} />
    </g>)}
    {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M 177 ${-height + 42 + i * 17} l 35 -21`} stroke={INK} opacity={0.4} strokeWidth={3} />)}
  </g>;
}

function Caption({ captions, time }: { captions: TechReelProps['captions']; time: number }) {
  const active = captions.findIndex((word, i) => time >= word.start && time < Math.max(word.end, Math.min(captions[i + 1]?.start ?? word.end, word.end + 0.18)));
  if (active < 0) return null;
  let start = 0; let end = 0;
  while (end <= active) {
    start = end; let length = 0;
    do { length += captions[end]!.text.length + 1; end++; } while (end < captions.length && end - start < 6 && length + captions[end]!.text.length < 38 && !/[.!?]$/.test(captions[end - 1]!.text));
  }
  return <div style={{ position: 'absolute', top: 1590, left: 100, right: 100, textAlign: 'center', fontFamily: sans, fontSize: 40, lineHeight: 1.5, fontWeight: 500 }}>
    {captions.slice(start, end).map((word, i) => <span key={start + i} style={{ color: start + i === active ? ORANGE : INK, fontWeight: start + i === active ? 700 : 500, marginRight: 12 }}>{word.text}</span>)}
  </div>;
}

/** Original Codewithsome identity: a physical machine, paper canvas, resource changes. */
export const ScaleLabReel: React.FC<TechReelProps> = ({ reel, captions }) => {
  const frame = useCurrentFrame();
  const clock = beatAt(reel, frame);
  const beat = reel.beats[clock.index]!;
  const hardware = beat.hardware!;
  const previous = reel.beats[Math.max(0, clock.index - 1)]!.hardware!;
  const transition = ease(clock.local / 46);
  const cores = lerp(previous.cores, hardware.cores, transition);
  const memory = lerp(previous.memoryGb, hardware.memoryGb, transition);
  const demand = lerp(previous.demand, hardware.demand, transition);
  const capacity = lerp(previous.capacity, hardware.capacity, transition);
  const utilization = Math.min(100, Math.round(demand / capacity * 100));
  const overloaded = demand > capacity;
  const offline = hardware.stage === 'restart' && clock.local > 45 && clock.local < clock.duration * 0.75;
  const compare = hardware.stage === 'compare';
  const compareT = compare ? transition : 0;
  const phaseProgress = Math.min(1, clock.local / Math.max(1, clock.duration - 1));

  return <AbsoluteFill style={{ background: PAPER, color: INK, overflow: 'hidden' }}>
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      <defs><pattern id="labGrid" width={40} height={40} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={1} fill={INK} opacity={0.1} /></pattern></defs>
      <rect x={65} y={570} width={950} height={690} fill="url(#labGrid)" />
      <path d="M 80 593 v -23 h 23 M 977 570 h 23 v 23 M 80 1237 v 23 h 23 M 977 1260 h 23 v -23" stroke={INK} strokeWidth={2} fill="none" opacity={0.3} />
      <path d="M 170 1153 L 520 952 L 907 1160" fill="none" stroke={INK} strokeOpacity={0.09} strokeWidth={2} />
      <g transform={`translate(${lerp(540, 300, compareT)} 1140) scale(${lerp(1, 0.73, compareT)})`}>
        <Machine cores={cores} memory={memory} frame={frame} upgrading={hardware.stage === 'upgrade'} offline={offline} />
      </g>
      {!compare ? <g>
        <text x={115} y={850} fill={MUTED} fontSize={18} fontFamily={mono} letterSpacing={2}>REQUESTS</text>
        <path d="M 115 890 H 360" stroke={INK} strokeWidth={2} strokeDasharray="4 9" opacity={0.3} />
        {Array.from({ length: overloaded ? 10 : 4 }, (_, i) => {
          const t = offline ? 0.6 : (frame / 75 + i / (overloaded ? 10 : 4)) % 1;
          const x = 115 + t * 242;
          return <rect key={i} x={x} y={879 + (overloaded ? i % 2 * 24 : 0)} width={13} height={13} rx={3} fill={overloaded || offline ? ORANGE : INK} opacity={0.75} />;
        })}
        <path d="M 830 1120 V 690 m -8 10 l 8 -10 l 8 10" stroke={ORANGE} strokeWidth={3} fill="none" opacity={hardware.stage === 'upgrade' ? 1 : 0.3} />
        <text x={862} y={930} transform="rotate(-90 862 930)" textAnchor="middle" fill={ORANGE} fontFamily={mono} fontSize={19} letterSpacing={3}>SCALE UP</text>
      </g> : <g opacity={compareT}>
        {[0, 1, 2].map(i => <g key={i} transform={`translate(${730 + i % 2 * 150} ${980 + Math.floor(i / 2) * 160}) scale(0.3)`}><Machine cores={2} memory={8} frame={frame} upgrading={false} offline={false} /></g>)}
        <text x={300} y={1230} textAnchor="middle" fontFamily={mono} fontSize={23} fill={ORANGE}>UP / BIGGER</text>
        <text x={800} y={1230} textAnchor="middle" fontFamily={mono} fontSize={23} fill={INK}>OUT / MORE</text>
      </g>}
      {hardware.stage === 'ceiling' ? <g opacity={transition}>
        <path d="M 310 663 H 795" stroke={ORANGE} strokeWidth={3} strokeDasharray="12 8" />
        <text x={540} y={637} textAnchor="middle" fontFamily={mono} fontSize={20} fill={ORANGE} letterSpacing={2}>HARDWARE LIMIT</text>
      </g> : null}
      {offline ? <g><rect x={365} y={984} width={360} height={76} fill={PAPER} stroke={ORANGE} strokeWidth={3} /><text x={545} y={1032} textAnchor="middle" fontFamily={mono} fontSize={25} fill={ORANGE}>RESTARTING…</text></g> : null}
    </svg>
    <div style={{ position: 'absolute', top: 90, left: 84, right: 84, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: mono }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}><div style={{ width: 53, height: 53, background: ORANGE, color: PAPER, display: 'grid', placeItems: 'center', fontSize: 25, fontWeight: 700 }}>c/</div><span style={{ fontSize: 24, letterSpacing: 1 }}>codewithsome</span></div>
      <span style={{ fontSize: 19, letterSpacing: 2 }}>SCALE LAB / 01</span>
    </div>
    <div style={{ position: 'absolute', top: 213, left: 84, right: 84 }}>
      <div style={{ fontFamily: mono, color: ORANGE, fontSize: 22, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 25 }}>{beat.chapter}</div>
      <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 89, lineHeight: 0.99, letterSpacing: -4, whiteSpace: 'pre-line', maxWidth: 890 }}>{beat.headline}</div>
      <div style={{ fontFamily: sans, fontSize: 27, lineHeight: 1.4, marginTop: 24, color: MUTED }}>{beat.subhead}</div>
    </div>
    <div style={{ position: 'absolute', top: 1310, left: 84, right: 84, borderTop: `2px solid ${INK}`, paddingTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 30 }}>
      {[['CPU', `${Math.round(cores)} cores`], ['MEMORY', `${Math.round(memory)} GB`]].map(([label, value]) => <div key={label}><div style={{ fontFamily: mono, fontSize: 18, letterSpacing: 2, color: MUTED }}>{label}</div><div style={{ fontFamily: sans, fontSize: 40, fontWeight: 700, marginTop: 9, letterSpacing: -1 }}>{value}</div></div>)}
      <div><div style={{ fontFamily: mono, fontSize: 18, letterSpacing: 2, color: MUTED }}>LOAD / ILLUSTRATIVE</div><div style={{ display: 'flex', alignItems: 'center', gap: 15, marginTop: 21 }}><div style={{ flex: 1, height: 14, background: '#d8dfd5' }}><div style={{ width: `${offline ? 0 : utilization}%`, height: '100%', background: overloaded ? ORANGE : INK }} /></div><span style={{ fontFamily: mono, fontSize: 24 }}>{offline ? '—' : `${utilization}%`}</span></div></div>
    </div>
    {beat.metric ? <div style={{ position: 'absolute', top: 1470, left: 84, right: 84, fontFamily: mono, fontSize: 23, textAlign: 'center', color: ORANGE }}>{beat.metric.value}</div> : null}
    <Caption captions={captions} time={frame / 30} />
    <div style={{ position: 'absolute', left: 84, right: 84, bottom: 112, fontFamily: mono, fontSize: 20, display: 'flex', justifyContent: 'space-between', color: MUTED }}><span>SYSTEMS, EXPLAINED</span><span>{String(clock.index + 1).padStart(2, '0')} / {String(reel.beats.length).padStart(2, '0')}</span></div>
    <div style={{ position: 'absolute', left: 84, right: 84, bottom: 80, height: 5, display: 'flex', gap: 8 }}>{reel.beats.map((_, i) => <div key={i} style={{ flex: 1, background: '#d8dfd5' }}><div style={{ height: '100%', width: `${i < clock.index ? 100 : i === clock.index ? phaseProgress * 100 : 0}%`, background: ORANGE }} /></div>)}</div>
  </AbsoluteFill>;
};
