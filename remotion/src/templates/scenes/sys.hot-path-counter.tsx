import React from 'react';
import { useVideoConfig } from 'remotion';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

export const meta = {
  id: 'sys.hot-path-counter',
  title: 'Hot-path counter: contention to batching',
  pack: 'sys',
  llm: 'Click analytics: templateProps.stage = hook | demo | hotpath | lock | pool | counter | flush | rule | teaser. Animated requests, row lock, pool exhaustion and batched writes.',
  status: 'ready' as const
};

/** All motion is derived from the beat clock, so scrubbing and TTS retiming stay deterministic. */
export const Scene: React.FC<{ context: SceneContext }> = ({ context }) => {
  const { fps } = useVideoConfig();
  const stage = String(context.beat.templateProps?.stage || 'lock');
  const seconds = context.localFrame / fps;
  const t = Math.min(1, context.localFrame / Math.max(1, context.durationInFrames - 1));
  const red = '#ee827c', green = '#87cfa9', gold = theme.accent;
  const fixed = ['counter', 'flush', 'rule'].includes(stage);
  const color = fixed ? green : red;
  const label = (x: number, y: number, text: string, size = 22, fill: string = theme.text) => (
    <text x={x} y={y} textAnchor="middle" fill={fill} fontFamily={theme.mono} fontSize={size}>{text}</text>
  );
  const box = (x: number, y: number, w: number, h: number, title: string, detail: string, stroke: string = theme.node) => (
    <g><rect x={x} y={y} width={w} height={h} rx={14} fill="#101218" stroke={stroke} strokeWidth={2} />
      {label(x + w / 2, y + 43, title, 24, stroke)}{label(x + w / 2, y + 77, detail, 18, theme.muted)}</g>
  );
  const packets = (x1: number, y1: number, x2: number, y2: number, count: number, c: string) => (
    <g><path d={`M${x1},${y1} L${x2},${y2}`} stroke={c} strokeWidth={2} opacity={0.35} />
      {Array.from({ length: count }, (_, i) => {
        const p = (seconds * (fixed ? 0.8 : 0.35) + i / count) % 1;
        return <circle key={i} cx={x1 + (x2 - x1) * p} cy={y1 + (y2 - y1) * p} r={6} fill={c} />;
      })}</g>
  );
  const code = stage === 'hook' || stage === 'demo';
  return (
    <svg width={1080} height={720} viewBox="0 0 1080 720" role="img" aria-label={`Click counter ${stage}`}>
      {label(540, 30, 'ONE SYSTEM, ONE WEEK · DAY 4/7', 18, gold)}
      {code ? <g>
        <rect x={80} y={85} width={920} height={370} rx={16} fill="#101218" stroke={theme.node} />
        {label(540, 130, 'redirect.py', 20, theme.muted)}
        {['def redirect(code):', '  dest = cache.get(code)', '  db.increment_clicks(code)', '  return redirect_to(dest)'].map((line, i) => (
          <g key={line} opacity={t > i * 0.08 ? 1 : 0.2}>
            {i === 2 ? <rect x={105} y={273} width={870} height={54} rx={6} fill={red} opacity={0.13} /> : null}
            <text x={125} y={205 + i * 54} fontFamily={theme.mono} fontSize={29} fill={i === 2 ? red : theme.text}>{line}</text>
          </g>
        ))}
        {label(540, 540, stage === 'demo' ? '1 request → test passes' : '10,000 clicks/sec → one hot row', 29, color)}
        {label(540, 600, stage === 'demo' ? 'The demo hides the contention.' : 'p99: 20ms → 4,800ms · illustrative', 21, theme.muted)}
      </g> : stage === 'rule' || stage === 'teaser' ? <g>
        {label(540, 180, stage === 'rule' ? 'ANALYTICS CAN WAIT.' : 'TOMORROW · DAY 5', 34, gold)}
        {label(540, 245, stage === 'rule' ? 'THE REDIRECT CANNOT.' : 'Two users. One /launch.', 34)}
        {box(130, 330, 360, 110, stage === 'rule' ? 'REDIRECT' : 'USER A', stage === 'rule' ? 'fast response' : 'alias = /launch', green)}
        {box(590, 330, 360, 110, stage === 'rule' ? 'CLICK COUNT' : 'USER B', stage === 'rule' ? 'may lag ~5 seconds' : 'alias = /launch', gold)}
        {label(540, 535, stage === 'rule' ? 'Durability is a separate decision.' : 'Who actually owns it?', 25, theme.muted)}
        {label(540, 590, stage === 'rule' ? 'Not a billing or exactly-once design.' : 'Next trap: check-then-act.', 21, theme.muted)}
      </g> : stage === 'pool' ? <g>
        {label(540, 100, 'DATABASE CONNECTION POOL', 26, theme.muted)}
        {Array.from({ length: 20 }, (_, i) => {
          const busy = i < Math.min(20, Math.floor(t * 28) + 1);
          return <rect key={i} x={150 + (i % 5) * 160} y={155 + Math.floor(i / 5) * 70} width={140} height={48} rx={7} fill={busy ? red : '#191d26'} opacity={busy ? 0.85 : 1} />;
        })}
        {label(540, 495, `${Math.min(100, (Math.floor(t * 28) + 1) * 5)}/100 busy · waiting on /launch`, 27, red)}
        {label(540, 565, 'GET /sale → timeout     GET /docs → timeout', 23)}
        {label(540, 635, 'One hot link consumes the shared pool.', 22, theme.muted)}
      </g> : <g>
        {box(80, 95, 270, 110, 'CLICKS', 'GET /launch', gold)}
        {box(650, 95, 350, 110, 'REDIRECT', fixed ? 'return destination' : 'wait for write', color)}
        {packets(350, 150, 650, 150, 7, gold)}
        {box(650, 330, 350, 110, fixed ? 'REDIS INCR' : 'POSTGRES ROW', fixed ? `clicks:launch +${Math.floor(seconds * 2000)}` : 'launch | clicks | LOCKED', color)}
        {packets(825, 205, 825, 330, fixed ? 6 : 9, color)}
        {fixed ? <g>
          {box(80, 330, 360, 110, 'BACKGROUND WORKER', 'aggregate every 5 seconds', green)}
          {packets(650, 385, 440, 385, 3, green)}
          {box(80, 565, 360, 110, 'POSTGRES', 'one increment per batch', green)}
          <path d="M260 440 V565" stroke={green} strokeWidth={2} strokeDasharray="8 8" />
          <circle cx={260} cy={440 + ((seconds % 5) / 5) * 125} r={9} fill={gold} />
          {label(740, 545, stage === 'flush' ? '10,000 events → 1 write' : 'No per-click SQL write', 24, green)}
          {label(740, 600, `${(5 - seconds % 5).toFixed(1)}s until flush`, 21, theme.muted)}
          {label(740, 650, 'Illustrative batch · counts lag', 18, theme.muted)}
        </g> : <g>
          {label(280, 290, stage === 'lock' ? 'WAITING UPDATES' : 'CACHE READ WAS FAST', 23, theme.muted)}
          {Array.from({ length: 8 }, (_, i) => <rect key={i} x={110 + i * 59} y={340 + Math.min(1, t * 3) * (i % 2) * 20} width={45} height={55} rx={6} fill={red} opacity={t > i * 0.07 ? 0.9 : 0.12} />)}
          <path d="M585 325 V440" stroke={red} strokeWidth={6} />
          {label(540, 535, 'Only one transaction holds this row lock.', 25, red)}
          {label(540, 595, `Example p99: ${Math.round(20 + 4780 * t).toLocaleString('en-US')}ms`, 34)}
          {label(540, 650, 'Illustrative numbers, not benchmark results', 18, theme.muted)}
        </g>}
      </g>}
    </svg>
  );
};
export default { meta, Scene } satisfies SceneTemplateModule;
