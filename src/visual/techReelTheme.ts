/** Approved Request Coalescing identity. Presentation is code-owned, never LLM-authored. */
export const TECH_REEL_THEME = {
  id: 'orbital-v1', style: 'orbital', width: 1080, height: 1920, fps: 30,
  background: '#07080b', text: '#f1f0ed', muted: '#8b8e9e',
  accent: '#efc373', service: '#f5c56b', node: '#8d9be8', sphere: '#b6bef2', ring: '#8997cd',
  success: '#74d8b4', danger: '#ef777b',
  sans: 'Arial, Helvetica, sans-serif', mono: 'SFMono-Regular, Menlo, Consolas, monospace',
  headlineSize: 56, captionSize: 37, watermark: 'CODEWITHSOME',
} as const;
export const TECH_REEL_PALETTE: readonly string[] = [TECH_REEL_THEME.accent, TECH_REEL_THEME.service, TECH_REEL_THEME.node, TECH_REEL_THEME.sphere, TECH_REEL_THEME.ring, TECH_REEL_THEME.success, TECH_REEL_THEME.danger];
