import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { animatedNodesAt, beatAt, flowLayersAt, motionEvents, reelFrames, type DiagramNode, type TechReelProps } from '../../../src/remotion/techReelModel';
import { ScaleLabReel } from './ScaleLabReel';
import { WindowLabReel } from './WindowLabReel';
import { TemplateShell } from './TemplateShell';
import { ComputeHardware, RequestQueue } from './ComputeHardware';

import { TECH_REEL_THEME as theme } from '../../../src/visual/techReelTheme';
const mono = theme.mono;
const sans = theme.sans;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

function Sphere({ frame, color }: { frame: number; color: string }) {
  const angle = frame / 260;
  const dots = Array.from({ length: 240 }, (_, i) => {
    const y = 1 - (i / 239) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = i * 2.399963 + angle;
    const z = Math.sin(theta) * r;
    return { x: Math.cos(theta) * r * 108, y: y * 108, z };
  }).sort((a, b) => a.z - b.z);
  return <g>
    <circle r={130} fill="url(#sphereAura)" />
    {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.4 + (p.z + 1) * 0.75} fill={color} opacity={0.18 + (p.z + 1) * 0.36} />)}
  </g>;
}

function DiagramObject({ node, frame }: { node: DiagramNode; frame: number }) {
  const c = node.color || '#8d9be8';
  const load = node.load || 0;
  const hot = load > 0.65;
  const glow = hot ? '#f16c62' : c;
  return <g transform={`translate(${node.x} ${node.y}) scale(${node.scale ?? 1})`} opacity={node.opacity ?? 1}>
    {load > 0 ? <ellipse cy={5} rx={node.kind === 'service' ? 180 : 95} ry={node.kind === 'ring' ? 65 : 75} fill={glow} opacity={load * (0.12 + 0.025 * Math.sin(frame / 7))} filter="url(#softGlow)" /> : null}
    {node.kind === 'compute' ? <ComputeHardware node={node} frame={frame} /> : null}
    {node.kind === 'queue' ? <RequestQueue node={node} /> : null}
    {node.kind === 'sphere' ? <Sphere frame={frame} color={c} /> : null}
    {node.kind === 'server' ? <g>
      <rect x={-59} y={-38} width={118} height={76} rx={7} fill="#10121b" stroke={c} strokeWidth={1.6} />
      <rect x={-49} y={-28} width={98} height={48} rx={3} fill="#0b0d14" stroke={c} strokeOpacity={0.3} />
      <path d="M -25 48 H 25 M 0 38 V 48" stroke={c} strokeWidth={2} opacity={0.55} />
      {[0, 1, 2].map(i => <rect key={i} x={-33 + i * 25} y={-13} width={14} height={17} rx={2} fill={c} opacity={0.15 + load * 0.45} />)}
    </g> : null}
    {node.kind === 'database' ? <g stroke={hot ? '#f16c62' : c} strokeWidth={2}>
      <path d="M -70 -40 V 48 C -70 77 70 77 70 48 V -40" fill="#10121c" />
      <ellipse cy={-40} rx={70} ry={25} fill="#171b2a" />
      <path d="M -70 -12 C -70 18 70 18 70 -12 M -70 18 C -70 48 70 48 70 18" fill="none" opacity={0.3} />
      <path d="M -70 48 C -70 78 70 78 70 48" fill="none" />
    </g> : null}
    {node.kind === 'service' ? <g>
      <rect x={-214} y={-37} width={428} height={74} rx={15} fill="#0c1015" stroke={c} strokeWidth={1.7} strokeDasharray="3 4" />
      {[-145, -73, 0, 73, 145].map((x, i) => <g key={x} transform={`translate(${x} 0)`}>
        <circle r={13} fill={i === 2 ? c : 'none'} fillOpacity={0.22} stroke={c} strokeOpacity={i === 2 ? 1 : 0.35} />
        <circle r={4} fill={c} opacity={i === 2 ? 1 : 0.3} />
      </g>)}
    </g> : null}
    {node.kind === 'storage' ? <g>
      <rect x={-47} y={-80} width={94} height={160} rx={6} fill="#121018" stroke={hot ? '#f16c62' : c} strokeWidth={1.5} />
      {Array.from({ length: 24 }, (_, i) => <rect key={i} x={-32 + i % 4 * 17} y={-63 + Math.floor(i / 4) * 20} width={11} height={13} rx={1} fill={i / 24 < load ? glow : '#282735'} />)}
    </g> : null}
    {node.kind === 'ring' ? <g>
      <ellipse rx={345} ry={110} fill="none" stroke={c} strokeOpacity={0.14} strokeDasharray="3 8" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = i / 24 * Math.PI * 2;
        const selected = i >= 5 && i <= 7;
        return <g key={i} transform={`translate(${Math.cos(a) * 345} ${Math.sin(a) * 110})`}>
          {selected && load > 0 ? <ellipse rx={35} ry={25} fill={glow} opacity={load * 0.7} filter="url(#softGlow)" /> : null}
          <rect x={-17} y={-10} width={34} height={20} rx={4} fill={selected && load > 0 ? glow : '#0d1018'} fillOpacity={selected ? 0.6 : 1} stroke={selected ? glow : c} strokeOpacity={selected ? 0.9 : 0.45} />
        </g>;
      })}
    </g> : null}
    {node.kind !== 'ring' && node.kind !== 'queue' ? <text y={node.labelPlacement === 'above' ? -155 : node.kind === 'compute' ? 155 : node.kind === 'sphere' ? 155 : node.kind === 'storage' ? 110 : node.kind === 'database' ? 105 : 81} textAnchor="middle" fill={c} fontFamily={mono} fontSize={node.kind === 'sphere' ? 22 : 19} letterSpacing={2}>{node.label}</text> : null}
    {node.kind === 'server' && node.cores && node.memoryGb ? <text y={112} textAnchor="middle" fill={c} fontFamily={mono} fontSize={16}>{node.cores} CPU · {node.memoryGb} GB</text> : null}
    {node.detail ? <text y={node.kind === 'ring' ? 196 : node.kind === 'sphere' ? 185 : 135} textAnchor="middle" fill="#828697" fontFamily={mono} fontSize={18}>{node.detail}</text> : null}
  </g>;
}

function Flow({ from, to, color, packets, speed, bend, seconds, opacity, lanes = 1, spread = 280 }: {
  from: DiagramNode; to: DiagramNode; color: string; packets: number; speed: number; bend: number; seconds: number; opacity: number; lanes?: number | undefined; spread?: number | undefined;
}) {
  const down = to.y > from.y;
  const anchor = (node: DiagramNode, bottom: boolean) => node.kind === 'ring' ? 105 : (bottom ? 1 : -1) * (node.kind === 'sphere' ? (lanes > 1 ? 80 : 110) : node.kind === 'compute' ? 115 : node.kind === 'queue' ? 31 : node.kind === 'service' ? 37 : 55) * (node.scale ?? 1);
  return <g opacity={opacity * Math.min(from.opacity ?? 1, to.opacity ?? 1)}>
    {Array.from({ length: lanes }, (_, lane) => {
      const offset = lanes === 1 ? 0 : (lane / (lanes - 1) - 0.5) * spread;
      const a = { x: from.x + offset * 0.42, y: from.y + anchor(from, down) };
      const b = { x: to.x + offset * 0.35, y: to.y + anchor(to, !down) };
      const mid = { x: (a.x + b.x) / 2 + bend + offset, y: (a.y + b.y) / 2 };
      const point = (t: number) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * mid.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * mid.y + t * t * b.y });
      return <g key={lane}>
        <path d={`M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`} fill="none" stroke={color} strokeOpacity={0.24} strokeWidth={1.5} strokeDasharray="2 7" />
        {Array.from({ length: packets }, (_, i) => {
          const p = (seconds * speed + i / Math.max(1, packets) + lane * 0.173) % 1;
          const pos = point(p);
          return <g key={i} opacity={Math.min(1, p * 12, (1 - p) * 12)}>
            <circle cx={pos.x} cy={pos.y} r={7} fill={color} opacity={0.3} filter="url(#packetGlow)" />
            {[0, 1, 2].map(k => { const q = point(Math.max(0, p - k * 0.022)); return <circle key={k} cx={q.x} cy={q.y} r={3.2 - k * 0.6} fill={color} opacity={1 - k * 0.3} />; })}
          </g>;
        })}
      </g>;
    })}
  </g>;
}

function Captions({ captions, seconds, accent }: { captions: TechReelProps['captions']; seconds: number; accent: string }) {
  const active = captions.findIndex(word => seconds >= word.start && seconds < word.end);
  if (active < 0) return null;
  // Small phrase pages; the active word follows real provider word boundaries.
  let start = 0;
  let end = 0;
  while (end <= active) {
    start = end;
    let chars = 0;
    do { chars += captions[end]!.text.length + 1; end++; } while (end < captions.length && end - start < 5 && chars + captions[end]!.text.length < 35 && !/[.!?]$/.test(captions[end - 1]!.text));
  }
  return <div style={{ position: 'absolute', top: 1560, left: 75, right: 75, display: 'flex', gap: 11, justifyContent: 'center', flexWrap: 'wrap', fontFamily: sans, fontSize: theme.captionSize, lineHeight: 1.5, fontWeight: 600 }}>
    {captions.slice(start, end).map((word, i) => <span key={start + i} style={{ padding: '0 7px', borderRadius: 5, color: start + i === active ? '#0b0b0e' : '#b9bbc4', background: start + i === active ? accent : '#101116' }}>{word.text}</span>)}
  </div>;
}

const DiagramReel: React.FC<TechReelProps> = ({ reel, captions }) => {
  const frame = useCurrentFrame();
  const clock = beatAt(reel, frame);
  const beat = reel.beats[clock.index]!;
  const progress = ease(clock.local / 26);
  const events = useMemo(() => motionEvents(reel, captions, clock.index), [reel, captions, clock.index]);
  const nodes = animatedNodesAt(reel, clock.index, clock.local, events);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const accent = reel.accent;
  const orbital = reel.style === 'orbital';
  const layers = flowLayersAt(reel, clock.index, clock.local, events);
  const flowLayer = (flows: typeof beat.flows, opacity: number, prefix: string) => flows.map((flow, i) => {
    const from = byId.get(flow.from); const to = byId.get(flow.to);
    return from && to ? <Flow key={`${prefix}-${i}`} {...flow} from={from} to={to} seconds={frame / 30} opacity={opacity} /> : null;
  });
  return <AbsoluteFill style={{ backgroundColor: theme.background, color: theme.text, overflow: 'hidden' }}>
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="20" /></filter>
        <filter id="packetGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4" /></filter>
        <radialGradient id="sphereAura"><stop stopColor="#7a8cd6" stopOpacity="0.15" /><stop offset="1" stopColor="#7a8cd6" stopOpacity="0" /></radialGradient>
      </defs>
      {orbital ? Array.from({ length: 100 }, (_, i) => <circle key={`star-${i}`} cx={(i * 137.51) % 1080} cy={380 + (i * 97.3) % 1000} r={0.7} fill="#8793c2" opacity={0.15} />) : null}
      {flowLayer(layers.previous, 1 - layers.progress, 'previous')}
      {flowLayer(layers.current, layers.progress, 'current')}
      {nodes.map(node => <DiagramObject key={node.id} node={node} frame={frame} />)}
    </svg>
    <div style={{ position: 'absolute', top: 212, left: 80, right: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: mono, fontSize: 17, letterSpacing: 2.5 }}>
        <span style={{ color: accent }}>{beat.chapter.toUpperCase()}</span>
        <div style={{ display: 'flex', gap: 7 }}>{reel.beats.map((_, i) => <div key={i} style={{ width: 25, height: 5, borderRadius: 5, background: i <= clock.index ? accent : '#272831' }} />)}</div>
      </div>
      <div style={{ marginTop: 26, fontFamily: orbital ? sans : 'Georgia, Times New Roman, serif', fontSize: orbital ? theme.headlineSize : 62, fontWeight: orbital ? 500 : 700, lineHeight: 1.13, letterSpacing: -1.3, opacity: 0.5 + 0.5 * progress, transform: `translateY(${(1 - progress) * 9}px)` }}>{beat.headline}</div>
      <div style={{ marginTop: 23, color: '#8b8e9e', fontFamily: mono, fontSize: 20, lineHeight: 1.6 }}>{beat.subhead}</div>
    </div>
    {beat.metric ? <div style={{ position: 'absolute', top: 1435, left: 80, right: 80, textAlign: 'center', fontFamily: mono, opacity: progress }}>
      <div style={{ fontSize: 17, letterSpacing: 3, color: '#878b9c', marginBottom: 8 }}>{beat.metric.label.toUpperCase()}</div>
      <div style={{ fontSize: 38, color: accent, letterSpacing: -1 }}>{beat.metric.value}</div>
    </div> : null}
    <Captions captions={captions} seconds={frame / 30} accent={accent} />
    <div style={{ position: 'absolute', left: 80, right: 80, bottom: 165, display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 16, letterSpacing: 2, color: '#5e6272' }}><span>{theme.watermark}</span><span>{String(clock.index + 1).padStart(2, '0')} / {String(reel.beats.length).padStart(2, '0')}</span></div>
    <div style={{ position: 'absolute', left: 80, right: 80, bottom: 139, height: 2, background: '#1a1c24' }}><div style={{ height: '100%', width: `${frame / Math.max(1, reelFrames(reel) - 1) * 100}%`, background: accent, opacity: 0.55 }} /></div>
  </AbsoluteFill>;
};

export const TechReel: React.FC<TechReelProps> = (props) => {
  // Per-beat TS templates (create template file first, then reference id in JSON).
  if (props.reel.beats.length > 0 && props.reel.beats.every((beat) => Boolean(beat.template))) {
    return <TemplateShell {...props} />;
  }
  if (props.reel.style === 'scale-lab') return <ScaleLabReel {...props} />;
  if (props.reel.style === 'window-lab') return <WindowLabReel {...props} />;
  return <DiagramReel {...props} />;
};
