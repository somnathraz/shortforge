import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

export type EpicAstraChromeProps = {
  /** Path under remotion/public, e.g. chrome/source.mp4 */
  videoSrc: string;
  /** Main story duration in frames (from source video). */
  mainFrames: number;
  title: string;
  subtitle?: string;
  brand?: string;
  cta?: string;
  introFrames?: number;
  outroFrames?: number;
};

const INK = '#1a1008';
const GOLD = '#d4a24c';
const CREAM = '#f3e6d0';
const MUTED = '#8a7355';
const serif = 'Georgia, "Times New Roman", serif';
const sans = 'system-ui, -apple-system, Segoe UI, sans-serif';

function IntroCard({
  title,
  subtitle,
  brand
}: {
  title: string;
  subtitle?: string;
  brand: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 90 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const y = interpolate(enter, [0, 1], [28, 0]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 30%, #3a2414 0%, ${INK} 70%)`,
        color: CREAM,
        opacity
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 120,
          left: 80,
          right: 80,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: sans,
          transform: `translateY(${y}px)`
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: GOLD,
            color: INK,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 22
          }}
        >
          EA
        </div>
        <span style={{ fontSize: 28, letterSpacing: 3, fontWeight: 600 }}>{brand}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 720,
          left: 80,
          right: 80,
          transform: `translateY(${y}px)`
        }}
      >
        <div
          style={{
            fontFamily: sans,
            color: GOLD,
            fontSize: 22,
            letterSpacing: 4,
            marginBottom: 28
          }}
        >
          MYTHOLOGY SHORT
        </div>
        <div
          style={{
            fontFamily: serif,
            fontSize: 64,
            lineHeight: 1.15,
            fontWeight: 700,
            maxWidth: 900
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: 28,
              fontFamily: sans,
              fontSize: 30,
              color: MUTED,
              lineHeight: 1.4
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 140,
          left: 80,
          right: 80,
          height: 4,
          background: '#2a1c10'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${interpolate(frame, [0, 50], [0, 100], {
              extrapolateRight: 'clamp'
            })}%`,
            background: GOLD
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function OutroCard({ brand, cta }: { brand: string; cta: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const scale = interpolate(enter, [0, 1], [0.92, 1]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, #4a2c16 0%, ${INK} 75%)`,
        color: CREAM,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{ textAlign: 'center', transform: `scale(${scale})`, padding: 60 }}>
        <div
          style={{
            width: 88,
            height: 88,
            margin: '0 auto 36px',
            borderRadius: 20,
            background: GOLD,
            color: INK,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 32
          }}
        >
          EA
        </div>
        <div style={{ fontFamily: serif, fontSize: 58, fontWeight: 700, marginBottom: 24 }}>
          {brand}
        </div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 12,
            padding: '18px 42px',
            border: `3px solid ${GOLD}`,
            borderRadius: 999,
            fontFamily: sans,
            fontSize: 34,
            fontWeight: 700,
            color: GOLD,
            letterSpacing: 1
          }}
        >
          Subscribe
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: sans,
            fontSize: 28,
            color: MUTED,
            maxWidth: 720,
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: 1.45
          }}
        >
          {cta}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function BrandWatermark({ brand }: { brand: string }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          right: 36,
          bottom: 48,
          fontFamily: sans,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: 2,
          color: CREAM,
          opacity: 0.42,
          textShadow: '0 2px 8px rgba(0,0,0,0.55)'
        }}
      >
        {brand}
      </div>
    </AbsoluteFill>
  );
}

/** Thin chrome wrap: intro → source Short → watermark → end/subscribe. */
export const EpicAstraChrome: React.FC<EpicAstraChromeProps> = ({
  videoSrc,
  mainFrames,
  title,
  subtitle,
  brand = 'EpicAstra',
  cta = 'Follow EpicAstra for more mythology Shorts.',
  introFrames = 60,
  outroFrames = 75
}) => {
  const src = videoSrc.startsWith('http') || videoSrc.startsWith('data:')
    ? videoSrc
    : staticFile(videoSrc.replace(/^\/+/, ''));

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Sequence durationInFrames={introFrames}>
        <IntroCard title={title} subtitle={subtitle} brand={brand} />
      </Sequence>

      <Sequence from={introFrames} durationInFrames={mainFrames}>
        <AbsoluteFill>
          <OffthreadVideo src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <BrandWatermark brand={brand} />
        </AbsoluteFill>
        <Audio src={src} />
      </Sequence>

      <Sequence from={introFrames + mainFrames} durationInFrames={outroFrames}>
        <OutroCard brand={brand} cta={cta} />
      </Sequence>
    </AbsoluteFill>
  );
};

export function chromeTotalFrames(
  mainFrames: number,
  introFrames = 60,
  outroFrames = 75
): number {
  return introFrames + mainFrames + outroFrames;
}
