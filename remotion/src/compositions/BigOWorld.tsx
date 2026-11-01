import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  AnimatedConnector,
  FlowParticle,
  type Point
} from '../cards/FlowParticle';
import { GlowFilter } from '../cards/GlowFilter';
import { TechBackground } from '../cards/TechBackground';
import { Watermark } from '../cards/Watermark';
import { TECH } from '../theme';
import type { EpisodeSegment } from './BigOEpisode';

/**
 * Persistent Big-O teaching world (reference method):
 * one stage · objects stay · state + particles evolve · no slide hard-cuts.
 */

type Phase =
  | 'hook'
  | 'growth'
  | 'o1'
  | 'on'
  | 'on2'
  | 'logn'
  | 'space'
  | 'ladder';

function ease(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

function localProgress(seconds: number, start: number, end: number): number {
  return ease((seconds - start) / Math.max(0.001, end - start));
}

function phaseAt(seconds: number): Phase {
  if (seconds < 5) return 'hook';
  if (seconds < 12) return 'growth';
  if (seconds < 19) return 'o1';
  if (seconds < 27) return 'on';
  if (seconds < 35) return 'on2';
  if (seconds < 43) return 'logn';
  if (seconds < 51) return 'space';
  return 'ladder';
}

const ARRAY = [2, 4, 6, 8, 10];
const LOOKUP = [10, 20, 30, 40, 50];
const HALVE = [32, 16, 8, 4, 2, 1];
const LADDER = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'];

function arrayLayout(values: number[], y: number) {
  const cellW = Math.min(150, Math.floor(860 / values.length));
  const gap = 14;
  const total = values.length * cellW + (values.length - 1) * gap;
  const startX = (TECH.width - total) / 2;
  const centers = values.map((_, i) => ({
    x: startX + i * (cellW + gap) + cellW / 2,
    y: y + 60,
    left: startX + i * (cellW + gap),
    cellW
  }));
  return { cellW, gap, startX, centers, y };
}

export const BigOWorld: React.FC<{ segments?: EpisodeSegment[] }> = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const seconds = frame / fps;
  const phase = phaseAt(seconds);

  const caption = useMemo(() => {
    switch (phase) {
      case 'hook':
        return { title: 'Big O', sub: 'How does your code scale?' };
      case 'growth':
        return { title: 'More input → more work', sub: 'growth' };
      case 'o1':
        return { title: 'Direct access = O(1)', sub: 'one hop · one particle' };
      case 'on':
        return { title: 'Check every item = O(n)', sub: 'one packet sweeps the row' };
      case 'on2':
        return { title: 'Nested loops = O(n²)', sub: 'same world · grid heat' };
      case 'logn':
        return { title: 'Keep cutting in half = O(log n)', sub: 'problem shrinks' };
      case 'space':
        return { title: 'Time ≠ Extra Space', sub: 'work grows · memory stays 1' };
      case 'ladder':
        return { title: 'How does it scale?', sub: 'ask what grows with n' };
    }
  }, [phase]);

  // —— Shared geometry (objects keep positions) ——
  const arrayY = 780;
  const values = phase === 'o1' ? LOOKUP : ARRAY;
  const layout = arrayLayout(values, arrayY);

  // Array visible from o1 through space (persistent object)
  const showArray = ['o1', 'on', 'space'].includes(phase);
  const showGrid = phase === 'on2';
  const showHalve = phase === 'logn';
  const showLadder = phase === 'ladder';
  const showHookCard = phase === 'hook';

  // Complexity badge
  const badge =
    phase === 'o1'
      ? 'O(1)'
      : phase === 'on'
        ? 'O(n)'
        : phase === 'on2'
          ? 'O(n²)'
          : phase === 'logn'
            ? 'O(log n)'
            : phase === 'space'
              ? 'time ≠ space'
              : phase === 'growth'
                ? 'growth'
                : null;

  // —— Reference particle: ONE purposeful packet on a path ——
  let particlePath: Point[] = [];
  let particleProgress = 0;
  let particleVisible = false;
  let connectors: Array<{ points: Point[]; progress: number; hot?: boolean }> = [];

  if (phase === 'o1') {
    // Particle flies from left into index 2 (like “ask once”)
    const target = layout.centers[2]!;
    particlePath = [
      { x: 120, y: arrayY - 80 },
      { x: target.x, y: target.y - 40 },
      { x: target.x, y: target.y }
    ];
    particleProgress = localProgress(seconds, 12.4, 15.2);
    particleVisible = particleProgress > 0.02;
    connectors = [
      {
        points: particlePath,
        progress: Math.min(1, particleProgress * 1.15),
        hot: true
      }
    ];
  }

  if (phase === 'on') {
    // One packet sweeps left → right across the persistent array
    particlePath = layout.centers.map((c) => ({ x: c.x, y: c.y }));
    particleProgress = localProgress(seconds, 19.3, 25.5);
    particleVisible = true;
    connectors = [
      {
        points: particlePath,
        progress: Math.min(1, particleProgress + 0.08),
        hot: false
      }
    ];
  }

  if (phase === 'on2') {
    // Heat: several short packets into the grid (many identical reads feel)
    // Lead particle zigzags rows
    const cell = 108;
    const gap = 12;
    const cols = 4;
    const rows = 4;
    const totalW = cols * cell + (cols - 1) * gap;
    const startX = (TECH.width - totalW) / 2;
    const startY = 720;
    const path: Point[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const col = r % 2 === 0 ? c : cols - 1 - c;
        path.push({
          x: startX + col * (cell + gap) + cell / 2,
          y: startY + r * (cell + gap) + cell / 2
        });
      }
    }
    particlePath = path;
    particleProgress = localProgress(seconds, 27.2, 33.5);
    particleVisible = true;
  }

  if (phase === 'space') {
    // Packet traverses array then drops to the single DB/memory box
    const db = { x: 540, y: 1280 };
    particlePath = [
      ...layout.centers.map((c) => ({ x: c.x, y: c.y })),
      { x: db.x, y: db.y - 40 },
      db
    ];
    particleProgress = localProgress(seconds, 43.5, 49);
    particleVisible = true;
    connectors = [
      {
        points: [
          { x: layout.centers[2]!.x, y: layout.centers[2]!.y },
          db
        ],
        progress: localProgress(seconds, 46, 49),
        hot: false
      }
    ];
  }

  // Active cell from particle position
  const activeIndex =
    phase === 'o1'
      ? particleProgress > 0.7
        ? 2
        : null
      : phase === 'on'
        ? Math.min(ARRAY.length - 1, Math.floor(particleProgress * ARRAY.length))
        : phase === 'space'
          ? Math.min(ARRAY.length - 1, Math.floor(particleProgress * 0.7 * ARRAY.length))
          : null;

  const filledOn =
    phase === 'on' ? Math.floor(particleProgress * ARRAY.length) + 1 : phase === 'space' ? ARRAY.length : 0;

  // Growth bars
  const growthSizes = [10, 100, 1000];
  const growthOps = [10, 100, 1000];

  // Grid fill count
  const gridFilled = phase === 'on2' ? Math.floor(particleProgress * 16) : 0;

  // Halving level
  const halveLevel =
    phase === 'logn' ? Math.min(HALVE.length, Math.floor(localProgress(seconds, 35, 41.5) * HALVE.length) + 1) : 0;

  // Ladder reveal
  const ladderCount =
    phase === 'ladder'
      ? Math.min(LADDER.length, Math.floor(localProgress(seconds, 51, 56.5) * LADDER.length) + 1)
      : 0;

  const titleOpacity = interpolate(frame % (fps * 2), [0, 8], [0.85, 1], {
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill>
      <TechBackground />

      {/* Caption — reference style: short, top, not the diagram */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 50,
          right: 50,
          textAlign: 'center',
          fontFamily: TECH.font,
          opacity: titleOpacity
        }}
      >
        <div style={{ color: TECH.text, fontSize: 48, fontWeight: 700, lineHeight: 1.2 }}>
          {caption.title}
        </div>
        <div style={{ color: TECH.muted, fontSize: 28, marginTop: 14 }}>{caption.sub}</div>
      </div>

      <svg
        width={TECH.width}
        height={TECH.height}
        style={{ position: 'absolute', inset: 0 }}
      >
        <GlowFilter id="worldGlow" blur={8} />
        <GlowFilter id="heatGlow" blur={10} />

        {/* Hook sphere-like card (reference: central object first) */}
        {showHookCard ? (
          <g opacity={localProgress(seconds, 0.2, 1.2)}>
            <circle
              cx={540}
              cy={880}
              r={160 + Math.sin(frame / 12) * 4}
              fill="none"
              stroke={TECH.glow}
              strokeWidth={2}
              opacity={0.35}
              filter="url(#worldGlow)"
            />
            <circle
              cx={540}
              cy={880}
              r={120}
              fill={TECH.panel}
              stroke={TECH.panelBorder}
              strokeWidth={3}
              filter="url(#worldGlow)"
            />
            <text
              x={540}
              y={900}
              textAnchor="middle"
              fill={TECH.text}
              fontSize={96}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              n ↑
            </text>
          </g>
        ) : null}

        {phase === 'growth' ? (
          <g>
            {growthSizes.map((size, i) => {
              const p = localProgress(seconds, 5.5 + i * 1.6, 7.2 + i * 1.6);
              const maxH = 480;
              const h = Math.max(8, (growthOps[i]! / 1000) * maxH * p);
              const barW = 140;
              const gap = 80;
              const total = growthSizes.length * barW + (growthSizes.length - 1) * gap;
              const x = (TECH.width - total) / 2 + i * (barW + gap);
              const baseY = 1260;
              return (
                <g key={`g-${i}`} filter={p > 0 && p < 1 ? 'url(#heatGlow)' : undefined}>
                  <rect
                    x={x}
                    y={baseY - h}
                    width={barW}
                    height={h}
                    rx={16}
                    fill={p > 0 && p < 1 ? TECH.cellActive : p >= 1 ? TECH.cellDone : TECH.cell}
                    stroke={p > 0 && p < 1 ? TECH.accent : TECH.panelBorder}
                    strokeWidth={3}
                  />
                  <text
                    x={x + barW / 2}
                    y={baseY + 44}
                    textAnchor="middle"
                    fill={TECH.muted}
                    fontSize={26}
                    fontFamily={TECH.font}
                  >
                    n={size}
                  </text>
                  {p > 0.6 ? (
                    <text
                      x={x + barW / 2}
                      y={baseY - h - 18}
                      textAnchor="middle"
                      fill={TECH.text}
                      fontSize={28}
                      fontFamily={TECH.font}
                      fontWeight={700}
                    >
                      {growthOps[i]}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : null}

        {/* Persistent array object */}
        {showArray
          ? values.map((value, index) => {
              const c = layout.centers[index]!;
              const filled =
                phase === 'o1' ? true : phase === 'on' ? index < filledOn : true;
              const active = activeIndex === index;
              const done = phase === 'on' && index < (activeIndex ?? -1);
              const heat = active ? TECH.warn : undefined;
              return (
                <g key={`a-${index}`} filter={active ? 'url(#heatGlow)' : undefined}>
                  <text
                    x={c.x}
                    y={arrayY - 28}
                    textAnchor="middle"
                    fill={TECH.muted}
                    fontSize={26}
                    fontFamily={TECH.font}
                  >
                    {index}
                  </text>
                  <rect
                    x={c.left}
                    y={arrayY}
                    width={layout.cellW}
                    height={120}
                    rx={16}
                    fill={
                      !filled
                        ? '#0E1624'
                        : active
                          ? TECH.cellActive
                          : done
                            ? TECH.cellDone
                            : TECH.cell
                    }
                    stroke={heat || (active ? TECH.accent : TECH.panelBorder)}
                    strokeWidth={active ? 5 : 3}
                  />
                  <text
                    x={c.x}
                    y={arrayY + 78}
                    textAnchor="middle"
                    fill={filled ? TECH.text : TECH.muted}
                    fontSize={filled ? 46 : 34}
                    fontFamily={TECH.font}
                    fontWeight={700}
                  >
                    {filled ? value : '·'}
                  </text>
                </g>
              );
            })
          : null}

        {phase === 'o1' && particleProgress > 0.85 ? (
          <text
            x={540}
            y={arrayY + 200}
            textAnchor="middle"
            fill={TECH.warn}
            fontSize={40}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            arr[2] = 30
          </text>
        ) : null}

        {/* Nested grid — evolves from same stage center */}
        {showGrid
          ? Array.from({ length: 16 }, (_, i) => {
              const cell = 108;
              const gap = 12;
              const cols = 4;
              const r = Math.floor(i / cols);
              const c = i % cols;
              const totalW = cols * cell + (cols - 1) * gap;
              const startX = (TECH.width - totalW) / 2;
              const startY = 720;
              const filled = i < gridFilled;
              const hot = i === gridFilled - 1;
              return (
                <rect
                  key={`cell-${i}`}
                  x={startX + c * (cell + gap)}
                  y={startY + r * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={14}
                  fill={filled ? (hot ? TECH.warn : TECH.cellActive) : TECH.cell}
                  stroke={filled ? TECH.accent : TECH.panelBorder}
                  strokeWidth={3}
                  opacity={0.95}
                  filter={hot ? 'url(#heatGlow)' : undefined}
                />
              );
            })
          : null}

        {showGrid && particleProgress > 0.9 ? (
          <text
            x={540}
            y={1280}
            textAnchor="middle"
            fill={TECH.warn}
            fontSize={44}
            fontFamily={TECH.font}
            fontWeight={700}
          >
            4 × 4 = 16
          </text>
        ) : null}

        {/* Halving */}
        {showHalve
          ? HALVE.map((value, i) => {
              if (i >= halveLevel) return null;
              const max = HALVE[0]!;
              const w = Math.max(80, (value / max) * 700);
              const y = 640 + i * 110;
              const active = i === halveLevel - 1;
              return (
                <g key={`h-${i}`} filter={active ? 'url(#heatGlow)' : undefined}>
                  <rect
                    x={(TECH.width - w) / 2}
                    y={y}
                    width={w}
                    height={68}
                    rx={14}
                    fill={active ? TECH.cellActive : TECH.cell}
                    stroke={active ? TECH.warn : TECH.panelBorder}
                    strokeWidth={3}
                  />
                  <text
                    x={540}
                    y={y + 46}
                    textAnchor="middle"
                    fill={TECH.text}
                    fontSize={34}
                    fontFamily={TECH.font}
                    fontWeight={700}
                  >
                    {value}
                  </text>
                </g>
              );
            })
          : null}

        {/* Space: single memory box (DB-style object) */}
        {phase === 'space' ? (
          <g filter="url(#worldGlow)">
            <rect
              x={420}
              y={1220}
              width={240}
              height={120}
              rx={20}
              fill={TECH.panel}
              stroke={particleProgress > 0.85 ? TECH.accent : TECH.panelBorder}
              strokeWidth={3}
            />
            <text
              x={540}
              y={1295}
              textAnchor="middle"
              fill={TECH.text}
              fontSize={36}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              1 var · O(1)
            </text>
          </g>
        ) : null}

        {/* Ladder */}
        {showLadder
          ? LADDER.map((item, i) => {
              if (i >= ladderCount) return null;
              const y = 620 + i * 130;
              const active = i === ladderCount - 1;
              return (
                <g key={item} filter={active ? 'url(#heatGlow)' : undefined}>
                  <rect
                    x={180}
                    y={y}
                    width={720}
                    height={96}
                    rx={18}
                    fill={active ? TECH.cellActive : TECH.panel}
                    stroke={active ? TECH.warn : TECH.panelBorder}
                    strokeWidth={3}
                  />
                  <text
                    x={540}
                    y={y + 62}
                    textAnchor="middle"
                    fill={TECH.text}
                    fontSize={42}
                    fontFamily={TECH.font}
                    fontWeight={700}
                  >
                    {item}
                  </text>
                </g>
              );
            })
          : null}

        {/* Dotted / drawn connectors (reference) */}
        {connectors.map((c, i) => (
          <AnimatedConnector
            key={`conn-${i}`}
            points={c.points}
            progress={c.progress}
            hot={c.hot}
          />
        ))}

        {/* THE particle — few, purposeful, orange glow */}
        <FlowParticle
          points={particlePath}
          progress={particleProgress}
          trail={3}
          visible={particleVisible}
          color={TECH.warn}
        />

        {/* Complexity badge */}
        {badge ? (
          <g opacity={0.95}>
            <rect
              x={300}
              y={1680}
              width={480}
              height={100}
              rx={22}
              fill={TECH.panel}
              stroke={TECH.accent}
              strokeWidth={3}
              filter="url(#worldGlow)"
            />
            <text
              x={540}
              y={1745}
              textAnchor="middle"
              fill={TECH.accent}
              fontSize={52}
              fontFamily={TECH.font}
              fontWeight={700}
            >
              {badge}
            </text>
          </g>
        ) : null}
      </svg>

      <Watermark />

      {/* Debug-free duration pad so composition length still matches segment sum */}
      <div style={{ display: 'none' }}>{durationInFrames}</div>
    </AbsoluteFill>
  );
};
