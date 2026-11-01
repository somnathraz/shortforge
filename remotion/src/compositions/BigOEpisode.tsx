import React from 'react';
import {
  AbsoluteFill,
  Series,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';
import { TECH } from '../theme';
import { TechScene, type TechSceneProps } from './TechScene';
import { viewStateAt } from '../lib/viewState';

export type EpisodeSegment = TechSceneProps & {
  durationSeconds: number;
};

export type BigOEpisodeProps = {
  segments: EpisodeSegment[];
};

/** Same paper identity as Scale Lab / tech:reel sample. */
const PAPER = '#f3f0e7';
const INK = '#183e3a';
const ORANGE = '#d95632';
const MUTED = '#71817a';
const mono = 'Menlo, Consolas, monospace';
const sans = 'Arial, Helvetica, sans-serif';

function chapterFor(visualType: string, index: number): string {
  if (visualType === 'TECH_HOOK') return 'HOOK';
  if (visualType === 'BOOKING_HALL') return 'BOOKING';
  if (visualType === 'CODE_PANEL') return 'CODE';
  if (visualType === 'SYSTEM_FLOW') return 'FLOW';
  if (visualType.includes('SLID') || visualType === 'ARRAY_LOOKUP') return 'WINDOW';
  if (visualType.includes('ARRAY')) return 'ARRAY';
  if (visualType.includes('NESTED') || visualType.includes('GRID')) return 'NESTED';
  if (visualType.includes('HALV')) return 'LOG N';
  if (visualType.includes('LADDER') || visualType.includes('COMPLEXITY')) return 'COMPLEXITY';
  if (visualType.includes('GROWTH')) return 'GROWTH';
  if (visualType.includes('TIME')) return 'TRADEOFF';
  return `BEAT ${String(index + 1).padStart(2, '0')}`;
}

function AlgoLabBeat({
  segment,
  index,
  total
}: {
  segment: EpisodeSegment;
  index: number;
  total: number;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const data = segment.visualData || {};
  const title = (data.title as string) || segment.visualType.replace(/_/g, ' ');
  const subtitle = (data.subtitle as string) || '';
  const state = viewStateAt(
    segment.animationSteps || [],
    data,
    durationInFrames <= 1 ? 1 : frame / (durationInFrames - 1)
  );
  const complexity =
    state.complexityText ||
    (data.complexity as string) ||
    (data.timeLabel as string) ||
    '';
  const phaseProgress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const chapter = chapterFor(segment.visualType, index);

  return (
    <AbsoluteFill style={{ background: PAPER, color: INK, overflow: 'hidden' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern
            id={`algoLabGrid-${index}`}
            width={40}
            height={40}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={1} fill={INK} opacity={0.1} />
          </pattern>
        </defs>
        <rect x={65} y={570} width={950} height={690} fill={`url(#algoLabGrid-${index})`} />
        <path
          d="M 80 593 v -23 h 23 M 977 570 h 23 v 23 M 80 1237 v 23 h 23 M 977 1260 h 23 v -23"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          opacity={0.3}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 84,
          right: 84,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: mono
        }}
      >
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div
            style={{
              width: 53,
              height: 53,
              background: ORANGE,
              color: PAPER,
              display: 'grid',
              placeItems: 'center',
              fontSize: 25,
              fontWeight: 700
            }}
          >
            c/
          </div>
          <span style={{ fontSize: 24, letterSpacing: 1 }}>codewithsome</span>
        </div>
        <span style={{ fontSize: 19, letterSpacing: 2 }}>
          ALGO LAB / {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div style={{ position: 'absolute', top: 200, left: 84, right: 84 }}>
        <div
          style={{
            fontFamily: mono,
            color: ORANGE,
            fontSize: 22,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 18
          }}
        >
          {chapter}
        </div>
        <div
          style={{
            fontFamily: sans,
            fontWeight: 800,
            fontSize: title.length > 42 ? 56 : 72,
            lineHeight: 0.98,
            letterSpacing: -3,
            maxWidth: 920
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              fontFamily: sans,
              fontSize: 26,
              lineHeight: 1.35,
              marginTop: 18,
              color: MUTED,
              maxWidth: 880
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* Teaching diagram — same cards as before, clipped into the lab canvas */}
      <div
        style={{
          position: 'absolute',
          top: 520,
          left: 0,
          width: 1080,
          height: 780,
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', top: -520, left: 0, width: 1080, height: 1920 }}>
          <TechScene
            visualType={segment.visualType}
            visualData={data}
            animationSteps={segment.animationSteps || []}
            chrome="none"
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1310,
          left: 84,
          right: 84,
          borderTop: `2px solid ${INK}`,
          paddingTop: 24,
          display: 'grid',
          gridTemplateColumns: complexity ? '1fr 1.2fr' : '1fr',
          gap: 30
        }}
      >
        <div>
          <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: 2, color: MUTED }}>
            VISUAL
          </div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 32,
              fontWeight: 700,
              marginTop: 9,
              letterSpacing: -1
            }}
          >
            {segment.visualType.replace(/_/g, ' ')}
          </div>
        </div>
        {complexity ? (
          <div>
            <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: 2, color: MUTED }}>
              COMPLEXITY
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 40,
                fontWeight: 700,
                marginTop: 9,
                color: ORANGE,
                letterSpacing: -1
              }}
            >
              {complexity}
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: 112,
          fontFamily: mono,
          fontSize: 20,
          display: 'flex',
          justifyContent: 'space-between',
          color: MUTED
        }}
      >
        <span>ALGORITHMS, EXPLAINED</span>
        <span>
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: 80,
          height: 5,
          display: 'flex',
          gap: 8
        }}
      >
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ flex: 1, background: '#d8dfd5' }}>
            <div
              style={{
                height: '100%',
                width: `${i < index ? 100 : i === index ? phaseProgress * 100 : 0}%`,
                background: ORANGE
              }}
            />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/**
 * Main produce Remotion path — Algo Lab chrome (Scale Lab sample identity)
 * wrapping episode techVisual beats.
 */
export const BigOEpisode: React.FC<BigOEpisodeProps> = ({ segments }) => {
  const fps = TECH.fps;
  const list = segments?.length ? segments : [];

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Series>
        {list.map((seg, index) => (
          <Series.Sequence
            key={`${seg.visualType}-${index}`}
            durationInFrames={Math.max(1, Math.round(seg.durationSeconds * fps))}
          >
            <AlgoLabBeat segment={seg} index={index} total={list.length} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
