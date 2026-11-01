import React from 'react';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

type MapProps = {
  you?: { x: number; y: number };
  radius?: number;
  drivers?: Array<{ id: string; x: number; y: number; matched?: boolean }>;
  path?: Array<[number, number]>;
  stage?: 'ping' | 'search' | 'match' | 'route';
};

/** Draft mobility pack — Uber-like nearby search. Pass details via beat.templateProps. */
const MobilityMapScene: React.FC<{ context: SceneContext }> = ({ context }) => {
  const props = (context.beat.templateProps || {}) as MapProps;
  const you = props.you || { x: 540, y: 360 };
  const drivers = props.drivers || [
    { id: 'd1', x: 420, y: 260 },
    { id: 'd2', x: 700, y: 420 },
    { id: 'd3', x: 500, y: 480 }
  ];
  const radius = props.radius ?? (props.stage === 'ping' ? 0 : 160);
  const accent = theme.node;
  const path = props.path || [];

  return (
    <svg width={1080} height={720}>
      {/* city grid */}
      {Array.from({ length: 8 }, (_, i) => (
        <React.Fragment key={i}>
          <line x1={120 + i * 110} y1={40} x2={120 + i * 110} y2={680} stroke="#1a1c24" strokeWidth={2} />
          <line x1={80} y1={60 + i * 80} x2={1000} y2={60 + i * 80} stroke="#1a1c24" strokeWidth={2} />
        </React.Fragment>
      ))}
      {radius > 0 ? (
        <circle
          cx={you.x}
          cy={you.y}
          r={radius}
          fill={accent}
          opacity={0.08}
          stroke={accent}
          strokeWidth={2}
          strokeDasharray="6 8"
        />
      ) : null}
      {path.length > 1 ? (
        <path
          d={`M ${path.map(([x, y]) => `${x} ${y}`).join(' L ')}`}
          fill="none"
          stroke={theme.accent}
          strokeWidth={3}
          strokeDasharray="8 6"
        />
      ) : null}
      {drivers.map((d) => (
        <g key={d.id} transform={`translate(${d.x} ${d.y})`}>
          <rect
            x={-22}
            y={-12}
            width={44}
            height={24}
            rx={4}
            fill="#10121b"
            stroke={d.matched ? theme.accent : accent}
            strokeWidth={2}
          />
          <text y={36} textAnchor="middle" fill={theme.muted} fontFamily={theme.mono} fontSize={14}>
            {d.id}
          </text>
        </g>
      ))}
      <g transform={`translate(${you.x} ${you.y})`}>
        <circle r={10} fill={theme.accent} />
        <circle r={18} fill="none" stroke={theme.accent} strokeWidth={2} opacity={0.5} />
        <text y={40} textAnchor="middle" fill={theme.accent} fontFamily={theme.mono} fontSize={16}>
          YOU
        </text>
      </g>
      <text x={540} y={40} textAnchor="middle" fill={theme.muted} fontFamily={theme.mono} fontSize={18} letterSpacing={2}>
        MOBILITY · {props.stage || 'search'}
      </text>
    </svg>
  );
};

export const meta = {
  id: 'mobility.map',
  title: 'City map matching (draft)',
  pack: 'mobility',
  llm: 'Nearby search / match / route. Put map fields in beat.templateProps.',
  status: 'draft' as const
};

export const Scene = MobilityMapScene;
export default { meta, Scene } satisfies SceneTemplateModule;
