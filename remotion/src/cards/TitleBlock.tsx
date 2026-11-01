import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TECH } from '../theme';

export const TitleBlock: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const y = interpolate(enter, [0, 1], [24, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: 60,
        right: 60,
        textAlign: 'center',
        transform: `translateY(${y}px)`,
        opacity,
        fontFamily: TECH.font
      }}
    >
      <div style={{ color: TECH.text, fontSize: 52, fontWeight: 700, lineHeight: 1.2 }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ color: TECH.muted, fontSize: 32, marginTop: 16 }}>{subtitle}</div>
      ) : null}
    </div>
  );
};
