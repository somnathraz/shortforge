import React from 'react';
import type { DiagramNode } from '../../../src/remotion/techReelModel';
import { TECH_REEL_THEME as theme } from '../../../src/visual/techReelTheme';

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Resource counts drive physical components; fractional counts animate individual insertions. */
export function ComputeHardware({ node, frame }: { node: DiagramNode; frame: number }) {
  const color = node.color || theme.node;
  const slots = node.coreSlots || 16;
  const columns = slots > 16 ? 8 : 4;
  const cell = slots > 16 ? 12 : 24;
  const step = slots > 16 ? 17 : 33;
  const online = node.status !== 'offline';
  const cores = node.cores || 1;
  const memory = node.memoryGb || 8;
  const unit = node.memoryUnitGb || 8;
  return <g>
    <rect x={-190} y={-115} width={380} height={230} rx={12} fill="#10121b" stroke={color} strokeWidth={1.8} />
    <path d="M -12 -74 V 62" stroke={color} opacity={0.2} />
    <circle cx={168} cy={-96} r={4} fill={online ? theme.success : theme.danger} />
    <g opacity={online ? 1 : 0.18}>
      <text x={-166} y={-85} fill={color} fontFamily={theme.mono} fontSize={13} letterSpacing={2}>CPU CORES</text>
      <text x={16} y={-85} fill={color} fontFamily={theme.mono} fontSize={13} letterSpacing={2}>RAM</text>
      {Array.from({ length: slots }, (_, i) => {
        const visible = clamp(cores - i);
        const x = -166 + (i % columns) * step;
        const y = -63 + Math.floor(i / columns) * step;
        return <g key={i}>
          <rect x={x} y={y} width={cell} height={cell} rx={3} fill="none" stroke={color} opacity={0.12} strokeDasharray="2 3" />
          <g transform={`translate(${x + cell / 2} ${y + cell / 2 - (1 - visible) * 25}) scale(${0.65 + visible * 0.35})`} opacity={visible}>
            <rect x={-cell / 2} y={-cell / 2} width={cell} height={cell} rx={3} fill={color} fillOpacity={0.2 + (node.load || 0) * (0.4 + 0.1 * Math.sin(frame / 8 + i))} stroke={visible < 1 ? theme.accent : color} strokeWidth={1.4} />
            <rect x={-cell / 5} y={-cell / 5} width={cell * 0.4} height={cell * 0.4} fill={color} opacity={0.45} />
          </g>
        </g>;
      })}
      {Array.from({ length: node.memorySlots || 8 }, (_, i) => {
        const visible = clamp(memory / unit - i);
        const fill = clamp((memory * (node.memoryUsed || 0) - i * unit) / unit);
        const compact = (node.memorySlots || 8) > 8;
        const x = 16 + i % 2 * 79;
        const y = -63 + Math.floor(i / 2) * (compact ? 16 : 33);
        const height = compact ? 10 : 22;
        return <g key={i}>
          <rect x={x} y={y} width={65} height={height} rx={2} stroke={color} fill="none" opacity={0.12} strokeDasharray="2 3" />
          <g opacity={visible} transform={`translate(${(1 - visible) * 28} 0)`}>
            <rect x={x} y={y} width={65} height={height} rx={2} stroke={visible < 1 ? theme.accent : color} fill="#171b2a" />
            <rect x={x + 3} y={y + 3} width={59 * fill} height={height - 6} rx={1} fill={(node.memoryUsed || 0) > 0.85 ? theme.danger : theme.success} opacity={0.7} />
          </g>
        </g>;
      })}
    </g>
    <text x={-166} y={95} fill={color} fontFamily={theme.mono} fontSize={18}>{Math.floor(cores + 0.0001)} cores</text>
    <text x={16} y={95} fill={color} fontFamily={theme.mono} fontSize={18}>{Math.round(memory)} GB</text>
    {!online ? <g><rect x={-100} y={-24} width={200} height={48} rx={5} fill="#10121b" stroke={theme.danger} /><text y={6} textAnchor="middle" fill={theme.danger} fontFamily={theme.mono} fontSize={17} letterSpacing={3}>OFFLINE</text></g> : null}
  </g>;
}

export function RequestQueue({ node }: { node: DiagramNode }) {
  const color = node.color || theme.accent;
  const depth = node.queueDepth || 0;
  return <g>
    <rect x={-174} y={-31} width={348} height={62} rx={6} fill="#0b0d14" stroke={color} strokeOpacity={0.3} />
    {Array.from({ length: 24 }, (_, i) => {
      const visible = clamp(depth - i);
      return <rect key={i} x={-162 + i % 12 * 27} y={-20 + Math.floor(i / 12) * 24 - (1 - visible) * 12} width={18} height={16} rx={3} fill={color} opacity={visible * 0.8} />;
    })}
    <text x={-195} y={-3} textAnchor="end" fill={color} fontFamily={theme.mono} fontSize={16}>{node.label}</text>
    <text x={-195} y={20} textAnchor="end" fill="#828697" fontFamily={theme.mono} fontSize={14}>{Math.ceil(depth)} pending</text>
  </g>;
}
