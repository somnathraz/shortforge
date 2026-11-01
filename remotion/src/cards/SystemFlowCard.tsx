import React from 'react';
import { Easing, interpolate } from 'remotion';
import { TECH } from '../theme';
import type { AnimationStep } from '../lib/viewState';

/**
 * SYSTEM_FLOW — animated request/response diagram (visitor, owner, cache, db).
 * Everything is a pure function of scene progress `t` (0–1) + animationSteps, so TTS retiming
 * keeps beats aligned. Step vocabulary:
 *   showNode      label=<node id>                      fade a node in (if any showNode exists, others stay hidden)
 *   setNodeValue  label=<node id> value=<text>         text inside the node (flashes on change)
 *   setNodeState  label=<node id> value=<state>        idle|active|fresh|hit|miss|stale|empty|wrong
 *   sendPacket    label="from>to" value=<text> index=0 packet travels the link. index: 0 blue, 1 green, 2 red, 3 blocked (dies halfway)
 *   startTtl      value=<fraction of scene>            TTL bar drains from `at` over that fraction
 *   showBadge     label=<text>                         bottom banner (handled by caller via `badge`)
 */
export type SystemFlowCardProps = {
  t: number;
  steps: AnimationStep[];
  nodeLabels?: Partial<Record<NodeId, string>>;
  ttlLabel?: string;
  caption?: string;
  captionVariant?: 'buggy' | 'fixed' | 'neutral';
  badge?: string | null;
};

type NodeId = 'visitor' | 'owner' | 'cache' | 'db';

const TOP = 520;
const NODES: Record<NodeId, { x: number; y: number; w: number; h: number; label: string }> = {
  visitor: { x: 40, y: TOP + 20, w: 300, h: 130, label: 'VISITOR' },
  owner: { x: 40, y: TOP + 470, w: 300, h: 130, label: 'OWNER' },
  cache: { x: 390, y: TOP + 200, w: 300, h: 230, label: 'CACHE' },
  db: { x: 740, y: TOP + 400, w: 300, h: 200, label: 'DATABASE' }
};

const RED = '#FF5C6C';
const PACKET_DURATION = 0.09;

const STATE_META: Record<string, { color: string; chip: string }> = {
  idle: { color: TECH.panelBorder, chip: '' },
  active: { color: TECH.glow, chip: '' },
  fresh: { color: TECH.accent, chip: 'FRESH' },
  hit: { color: TECH.accent, chip: 'HIT' },
  miss: { color: TECH.warn, chip: 'MISS' },
  stale: { color: RED, chip: 'STALE' },
  wrong: { color: RED, chip: 'WRONG' },
  empty: { color: TECH.panelBorder, chip: 'EMPTY' }
};

const PACKET_COLORS = [TECH.glow, TECH.accent, RED, RED];

const ease = Easing.inOut(Easing.cubic);

function isNodeId(value: unknown): value is NodeId {
  return value === 'visitor' || value === 'owner' || value === 'cache' || value === 'db';
}

function lastStep(steps: AnimationStep[], action: string, label: string, t: number) {
  let found: AnimationStep | undefined;
  for (const step of steps) {
    if (step.action === action && step.label === label && step.at <= t) {
      if (!found || step.at >= found.at) found = step;
    }
  }
  return found;
}

function edgePoint(id: NodeId, toward: { x: number; y: number }, gap = 10) {
  const n = NODES[id];
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const sx = dx === 0 ? Infinity : n.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : n.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  const len = Math.hypot(dx, dy) || 1;
  return { x: cx + dx * s + (dx / len) * gap, y: cy + dy * s + (dy / len) * gap };
}

function center(id: NodeId) {
  const n = NODES[id];
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

type Packet = { from: NodeId; to: NodeId; text: string; kind: number; at: number };

function parsePackets(steps: AnimationStep[]): Packet[] {
  const out: Packet[] = [];
  for (const step of steps) {
    if (step.action !== 'sendPacket' || !step.label) continue;
    const [from, to] = step.label.split('>');
    if (!isNodeId(from) || !isNodeId(to)) continue;
    out.push({ from, to, text: String(step.value ?? ''), kind: step.index ?? 0, at: step.at });
  }
  return out;
}

export const SystemFlowCard: React.FC<SystemFlowCardProps> = ({
  t,
  steps,
  nodeLabels,
  ttlLabel = 'TTL 3600s',
  caption,
  captionVariant = 'neutral',
  badge
}) => {
  const packets = parsePackets(steps);
  const showSteps = steps.filter((s) => s.action === 'showNode');
  const ids = Object.keys(NODES) as NodeId[];

  const nodeAlpha = (id: NodeId): number => {
    if (!showSteps.length) return 1;
    const step = showSteps.find((s) => s.label === id);
    if (!step) return 0;
    return interpolate(t, [step.at, step.at + 0.04], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });
  };

  // Links drawn faintly for every packet route seen in this scene.
  const links = new Map<string, [NodeId, NodeId]>();
  for (const p of packets) {
    const key = [p.from, p.to].sort().join('|');
    if (!links.has(key)) links.set(key, [p.from, p.to]);
  }

  const ttlStep = steps.find((s) => s.action === 'startTtl' && s.at <= t);
  const ttlSpan = ttlStep ? Math.max(0.05, Number(ttlStep.value) || 0.8) : 0;
  const ttlLeft = ttlStep ? Math.max(0, 1 - (t - ttlStep.at) / ttlSpan) : 0;

  const captionColor =
    captionVariant === 'buggy' ? TECH.warn : captionVariant === 'fixed' ? TECH.accent : TECH.glow;

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: TECH.font }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {[...links.values()].map(([a, b]) => {
          const pa = edgePoint(a, center(b));
          const pb = edgePoint(b, center(a));
          const visible = Math.min(nodeAlpha(a), nodeAlpha(b));
          const live = packets.some(
            (p) =>
              ((p.from === a && p.to === b) || (p.from === b && p.to === a)) &&
              t >= p.at &&
              t <= p.at + PACKET_DURATION
          );
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={live ? TECH.glow : TECH.panelBorder}
              strokeWidth={live ? 5 : 3}
              strokeDasharray="10 10"
              opacity={visible}
            />
          );
        })}
      </svg>

      {ids.map((id) => {
        const alpha = nodeAlpha(id);
        if (alpha <= 0) return null;
        const n = NODES[id];
        const valueStep = lastStep(steps, 'setNodeValue', id, t);
        const stateStep = lastStep(steps, 'setNodeState', id, t);
        const state = STATE_META[String(stateStep?.value ?? 'idle')] ?? STATE_META.idle!;
        const flash = valueStep
          ? Math.max(0, 1 - (t - valueStep.at) / 0.06)
          : 0;
        const arrival = packets
          .filter((p) => p.to === id && p.kind !== 3 && t >= p.at + PACKET_DURATION)
          .map((p) => (t - (p.at + PACKET_DURATION)) / 0.07)
          .filter((x) => x >= 0 && x <= 1)
          .at(-1);
        const showTtl = id === 'cache' && ttlStep;

        return (
          <React.Fragment key={id}>
            {arrival !== undefined ? (
              <div
                style={{
                  position: 'absolute',
                  left: n.x - 8 - arrival * 14,
                  top: n.y - 8 - arrival * 14,
                  width: n.w + 16 + arrival * 28,
                  height: n.h + 16 + arrival * 28,
                  borderRadius: 30,
                  border: `3px solid ${TECH.glow}`,
                  opacity: (1 - arrival) * 0.7
                }}
              />
            ) : null}
            <div
              style={{
                position: 'absolute',
                left: n.x,
                top: n.y,
                width: n.w,
                height: n.h,
                borderRadius: 22,
                backgroundColor: TECH.panel,
                backgroundImage: `linear-gradient(rgba(61,126,255,${flash * 0.28}), rgba(61,126,255,${flash * 0.28}))`,
                border: `4px solid ${state.color}`,
                boxShadow: `0 0 ${24 + flash * 24}px ${state.color}44`,
                opacity: alpha,
                transform: `scale(${0.94 + alpha * 0.06})`,
                boxSizing: 'border-box',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: TECH.muted, fontSize: 22, letterSpacing: 2, fontWeight: 700 }}>
                  {nodeLabels?.[id] ?? n.label}
                </span>
                {state.chip ? (
                  <span
                    style={{
                      color: state.color,
                      fontSize: 20,
                      fontWeight: 800,
                      border: `2px solid ${state.color}`,
                      borderRadius: 8,
                      padding: '2px 8px'
                    }}
                  >
                    {state.chip}
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  color: TECH.text,
                  fontSize: id === 'visitor' || id === 'owner' ? 26 : 28,
                  lineHeight: 1.25,
                  wordBreak: 'break-word'
                }}
              >
                {valueStep ? String(valueStep.value ?? '') : ''}
              </div>
              {showTtl ? (
                <div>
                  <div
                    style={{
                      height: 12,
                      borderRadius: 6,
                      background: '#0B0B10',
                      overflow: 'hidden',
                      border: `1px solid ${TECH.panelBorder}`
                    }}
                  >
                    <div
                      style={{
                        width: `${ttlLeft * 100}%`,
                        height: '100%',
                        background: ttlLeft > 0.3 ? TECH.accent : TECH.warn
                      }}
                    />
                  </div>
                  <div style={{ color: TECH.muted, fontSize: 18, marginTop: 6 }}>{ttlLabel}</div>
                </div>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}

      {packets.map((p, i) => {
        const raw = (t - p.at) / PACKET_DURATION;
        if (raw < 0 || raw > 1) return null;
        const blocked = p.kind === 3;
        const a = edgePoint(p.from, center(p.to));
        const b = edgePoint(p.to, center(p.from));
        const eased = ease(raw);
        const progress = blocked ? eased * 0.5 : eased;
        const x = a.x + (b.x - a.x) * progress;
        const y = a.y + (b.y - a.y) * progress;
        const color = PACKET_COLORS[p.kind] ?? TECH.glow;
        const fade = blocked ? 1 - Math.max(0, (raw - 0.7) / 0.3) : 1;
        const width = Math.max(120, p.text.length * 15 + 40);
        return (
          <div
            key={`${p.from}-${p.to}-${i}`}
            style={{
              position: 'absolute',
              left: x - width / 2,
              top: y - 24,
              width,
              height: 48,
              borderRadius: 24,
              background: '#0B0B10',
              border: `3px solid ${color}`,
              boxShadow: `0 0 22px ${color}88`,
              color,
              fontSize: 22,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: fade,
              whiteSpace: 'nowrap'
            }}
          >
            {blocked && raw > 0.6 ? '✕ ' : ''}
            {p.text}
          </div>
        );
      })}

      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: 40,
            right: 40,
            top: TOP + 630,
            padding: '12px 20px',
            borderRadius: 16,
            background: '#121218',
            border: `2px solid ${captionColor}55`,
            color: TECH.text,
            fontSize: 24,
            lineHeight: 1.35,
            textAlign: 'center'
          }}
        >
          {caption}
        </div>
      ) : null}

      {badge ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: TOP + 706,
            textAlign: 'center',
            padding: '10px 24px',
            borderRadius: 16,
            background: '#1A1A22',
            border: `2px solid ${captionColor}`,
            color: captionColor,
            fontSize: 30,
            fontWeight: 700
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
};
