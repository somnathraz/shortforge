import React from 'react';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

const ScaleMachineScene: React.FC<{ context: SceneContext }> = ({ context }) => {
  const hw = context.beat.hardware;
  if (!hw) {
    return (
      <div style={{ color: theme.danger, fontFamily: theme.mono, padding: 40 }}>
        scale.machine requires beat.hardware
      </div>
    );
  }
  const util = Math.min(100, Math.round((hw.demand / hw.capacity) * 100));
  const accent = theme.accent;
  return (
    <svg width={1080} height={720}>
      <rect x={280} y={80} width={520} height={360} rx={16} fill="#10121b" stroke={accent} strokeWidth={1.6} />
      <text x={540} y={140} textAnchor="middle" fill={theme.text} fontFamily={theme.sans} fontSize={36} fontWeight={700}>
        SERVER / 01
      </text>
      <text x={540} y={200} textAnchor="middle" fill={theme.muted} fontFamily={theme.mono} fontSize={22}>
        stage · {hw.stage}
      </text>
      <text x={400} y={280} fill={accent} fontFamily={theme.mono} fontSize={28}>
        {hw.cores} cores
      </text>
      <text x={620} y={280} fill={theme.node} fontFamily={theme.mono} fontSize={28}>
        {hw.memoryGb} GB
      </text>
      <rect x={340} y={330} width={400} height={18} fill="#1a1c24" />
      <rect x={340} y={330} width={400 * (util / 100)} height={18} fill={util > 85 ? theme.danger : accent} />
      <text x={540} y={390} textAnchor="middle" fill={theme.muted} fontFamily={theme.mono} fontSize={20}>
        load {util}%
      </text>
    </svg>
  );
};

export const meta = {
  id: 'scale.machine',
  title: 'Vertical scale machine',
  pack: 'scale',
  llm: 'Single-machine scale-up. Requires beat.hardware.',
  status: 'ready' as const
};

export const Scene = ScaleMachineScene;
export default { meta, Scene } satisfies SceneTemplateModule;
