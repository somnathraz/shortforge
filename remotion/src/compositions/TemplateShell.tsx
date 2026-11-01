import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { beatAt, reelFrames, type TechReelProps } from '../../../src/remotion/techReelModel';
import { getSceneTemplate } from '../templates/registry';
import { theme } from '../templates/theme';
import type { SceneContext } from '../templates/types';

const ease = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};

function Captions({
  captions,
  seconds,
  accent
}: {
  captions: TechReelProps['captions'];
  seconds: number;
  accent: string;
}) {
  const active = captions.findIndex((word) => seconds >= word.start && seconds < word.end);
  if (active < 0) return null;
  let start = 0;
  let end = 0;
  while (end <= active) {
    start = end;
    let chars = 0;
    do {
      chars += captions[end]!.text.length + 1;
      end++;
    } while (
      end < captions.length &&
      end - start < 5 &&
      chars + captions[end]!.text.length < 35 &&
      !/[.!?]$/.test(captions[end - 1]!.text)
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 1560,
        left: 75,
        right: 75,
        display: 'flex',
        gap: 11,
        justifyContent: 'center',
        flexWrap: 'wrap',
        fontFamily: theme.sans,
        fontSize: theme.captionSize,
        lineHeight: 1.5,
        fontWeight: 600
      }}
    >
      {captions.slice(start, end).map((word, i) => (
        <span
          key={start + i}
          style={{
            padding: '0 7px',
            borderRadius: 5,
            color: start + i === active ? '#0b0b0e' : '#b9bbc4',
            background: start + i === active ? accent : '#101116'
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}

/**
 * Top-level shell: chrome + per-beat scene template from the TS registry.
 * Reel JSON only references template ids that already exist in registry.
 */
export const TemplateShell: React.FC<TechReelProps> = ({ reel, captions }) => {
  const frame = useCurrentFrame();
  const clock = beatAt(reel, frame);
  const beat = reel.beats[clock.index]!;
  const previous = reel.beats[Math.max(0, clock.index - 1)]!;
  const progress = ease(clock.local / 26);
  const accent = reel.accent || theme.accent;
  const templateId = beat.template;
  if (!templateId) {
    throw new Error(`Beat "${beat.id}" is missing template id (TemplateShell requires per-beat templates)`);
  }
  const entry = getSceneTemplate(templateId);
  const context: SceneContext = {
    reel,
    beat,
    previous,
    beatIndex: clock.index,
    localFrame: clock.local,
    durationInFrames: clock.duration,
    globalFrame: frame,
    captions
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background, color: theme.text, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 212, left: 80, right: 80 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: theme.mono,
            fontSize: 17,
            letterSpacing: 2.5
          }}
        >
          <span style={{ color: accent }}>{beat.chapter.toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 7 }}>
            {reel.beats.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 25,
                  height: 5,
                  borderRadius: 5,
                  background: i <= clock.index ? accent : '#272831'
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: theme.sans,
            fontSize: theme.headlineSize,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            whiteSpace: 'pre-line',
            opacity: 0.5 + 0.5 * progress,
            transform: `translateY(${(1 - progress) * 9}px)`
          }}
        >
          {beat.headline}
        </div>
        <div style={{ marginTop: 23, color: theme.muted, fontFamily: theme.mono, fontSize: 20, lineHeight: 1.6 }}>
          {beat.subhead}
        </div>
        <div style={{ marginTop: 12, color: '#5e6272', fontFamily: theme.mono, fontSize: 14, letterSpacing: 1 }}>
          template · {entry.meta.id}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 560, left: 0, width: 1080, height: 720, overflow: 'hidden' }}>
        <entry.Scene context={context} />
      </div>

      {beat.metric ? (
        <div
          style={{
            position: 'absolute',
            top: 1435,
            left: 80,
            right: 80,
            textAlign: 'center',
            fontFamily: theme.mono,
            opacity: progress
          }}
        >
          <div style={{ fontSize: 17, letterSpacing: 3, color: '#878b9c', marginBottom: 8 }}>
            {beat.metric.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 38, color: accent, letterSpacing: -1 }}>{beat.metric.value}</div>
        </div>
      ) : null}

      <Captions captions={captions} seconds={frame / 30} accent={accent} />
      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          bottom: 165,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: theme.mono,
          fontSize: 16,
          letterSpacing: 2,
          color: '#5e6272'
        }}
      >
        <span>{theme.watermark}</span>
        <span>
          {String(clock.index + 1).padStart(2, '0')} / {String(reel.beats.length).padStart(2, '0')}
        </span>
      </div>
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 139, height: 2, background: '#1a1c24' }}>
        <div
          style={{
            height: '100%',
            width: `${(frame / Math.max(1, reelFrames(reel) - 1)) * 100}%`,
            background: accent,
            opacity: 0.55
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
