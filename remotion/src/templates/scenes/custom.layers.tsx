import React from 'react';
import type { SceneContext } from '../types';
import { theme } from '../theme';
import { layerStateAt, type Layer } from '../../../../src/schema/customLayers';

const FPS = 30;

function typed(text: string, progress: number): string {
  return text.slice(0, Math.ceil(text.length * progress));
}

function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const LayerView: React.FC<{ layer: Layer; t: number }> = ({ layer, t }) => {
  const s = layerStateAt(layer, t);
  if (!s.visible) return null;
  const color = layer.color || theme.text;
  const transform = `translate(${s.x} ${s.y}) rotate(${s.rotate}) scale(${s.scale})`;
  const common = { transform, opacity: s.opacity };

  switch (layer.type) {
    case 'text':
      return (
        <g {...common}>
          <text
            textAnchor={layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle'}
            dominantBaseline="middle"
            fill={color}
            fontFamily={theme.mono}
            fontSize={layer.size}
            fontWeight={layer.weight}
          >
            {layer.enter === 'type' ? typed(layer.text, s.progress) : layer.text}
          </text>
        </g>
      );
    case 'box':
      return (
        <g {...common}>
          <rect
            x={-layer.w / 2}
            y={-layer.h / 2}
            width={layer.w}
            height={layer.h}
            rx={layer.radius}
            fill={layer.fill || '#10121b'}
            stroke={layer.stroke || color}
            strokeWidth={2.5}
          />
          {layer.label ? (
            <text textAnchor="middle" dominantBaseline="middle" fill={color} fontFamily={theme.mono} fontSize={layer.labelSize}>
              {layer.label}
            </text>
          ) : null}
        </g>
      );
    case 'circle':
      return (
        <g {...common}>
          <circle r={layer.r} fill={layer.fill || '#10121b'} stroke={layer.stroke || color} strokeWidth={2.5} />
          {layer.label ? (
            <text textAnchor="middle" dominantBaseline="middle" fill={color} fontFamily={theme.mono} fontSize={layer.labelSize}>
              {layer.label}
            </text>
          ) : null}
        </g>
      );
    case 'arrow': {
      const dx = layer.x2 - layer.x;
      const dy = layer.y2 - layer.y;
      const length = Math.hypot(dx, dy) || 1;
      const drawn = layer.enter === 'draw' ? s.progress : 1;
      const ex = dx * drawn;
      const ey = dy * drawn;
      const ux = dx / length;
      const uy = dy / length;
      const head = 16 + layer.width * 2;
      return (
        <g transform={`translate(${s.x} ${s.y})`} opacity={s.opacity}>
          <line
            x1={0}
            y1={0}
            x2={ex}
            y2={ey}
            stroke={color}
            strokeWidth={layer.width}
            strokeLinecap="round"
            strokeDasharray={layer.dashed ? '10 10' : undefined}
          />
          {layer.head && drawn > 0.95 ? (
            <polygon
              points={`${ex},${ey} ${ex - ux * head - uy * head * 0.5},${ey - uy * head + ux * head * 0.5} ${ex - ux * head + uy * head * 0.5},${ey - uy * head - ux * head * 0.5}`}
              fill={color}
            />
          ) : null}
        </g>
      );
    }
    case 'code': {
      const lineHeight = layer.size * 1.5;
      const visibleChars = layer.enter === 'type' ? Math.ceil(layer.lines.join('\n').length * s.progress) : Infinity;
      let used = 0;
      return (
        <g {...common}>
          {layer.lines.map((line, i) => {
            const shown = line.slice(0, Math.max(0, visibleChars - used));
            used += line.length + 1;
            const hot = layer.highlight?.includes(i);
            return (
              <g key={i}>
                {hot ? (
                  <rect x={-12} y={i * lineHeight - lineHeight * 0.7} width={line.length * layer.size * 0.62 + 24} height={lineHeight} rx={6} fill={theme.accent} opacity={0.16} />
                ) : null}
                <text y={i * lineHeight} fill={hot ? theme.accent : color} fontFamily={theme.mono} fontSize={layer.size} xmlSpace="preserve">
                  {shown}
                </text>
              </g>
            );
          })}
        </g>
      );
    }
    case 'counter': {
      const value = layer.fromValue + (layer.toValue - layer.fromValue) * s.progress;
      return (
        <g {...common}>
          <text textAnchor="middle" dominantBaseline="middle" fill={color} fontFamily={theme.mono} fontSize={layer.size} fontWeight={500}>
            {`${layer.prefix}${formatNumber(value, layer.decimals)}${layer.suffix}`}
          </text>
        </g>
      );
    }
    case 'bar':
      return (
        <g {...common}>
          <rect x={-layer.w / 2} y={-layer.h / 2} width={layer.w} height={layer.h} rx={layer.h / 2} fill="#1a1c24" />
          <rect x={-layer.w / 2} y={-layer.h / 2} width={Math.max(0, layer.w * layer.value * s.progress)} height={layer.h} rx={layer.h / 2} fill={layer.fill || color} />
        </g>
      );
  }
};

/** Declarative per-beat animation: see src/schema/customLayers.ts. */
const CustomLayersScene: React.FC<{ context: SceneContext }> = ({ context }) => {
  const t = context.localFrame / FPS;
  const layers = (context.beat.layers || []) as Layer[];
  return (
    <svg width={1080} height={720}>
      {layers.map((layer) => (
        <LayerView key={layer.id} layer={layer} t={t} />
      ))}
    </svg>
  );
};

export const meta = {
  id: 'custom.layers',
  title: 'Custom animation layers',
  pack: 'custom',
  llm: 'Design a one-off animation for this beat with beat.layers (see schema/customLayers).',
  status: 'ready' as const
};

export const Scene = CustomLayersScene;
