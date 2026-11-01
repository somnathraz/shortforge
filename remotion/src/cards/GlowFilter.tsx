import React from 'react';

/** Reusable SVG glow filter — wrap nodes with filter="url(#techGlow)". */
export const GlowFilter: React.FC<{ id?: string; blur?: number }> = ({
  id = 'techGlow',
  blur = 8
}) => (
  <defs>
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={blur} result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);
