import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TECH } from '../theme';

/** Brand watermark — always present, never regenerated per lesson. */
export const Watermark: React.FC<{ text?: string }> = ({ text = TECH.watermark }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div
      style={{
        position: 'absolute',
        right: 36,
        bottom: 40,
        fontFamily: TECH.font,
        fontSize: 28,
        fontWeight: 600,
        letterSpacing: 1.5,
        color: TECH.muted,
        opacity: 0.35
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);
