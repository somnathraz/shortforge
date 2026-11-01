/**
 * Wan I2V sampler mode for EpicAstra's Comfy graph.
 * - quality: 20 steps (baseline, ~14–15 min/scene on current Vast)
 * - fast: LightX2V 4-step LoRA (node 129:131 Enable 4steps LoRA?)
 */
export type WanQualityMode = 'quality' | 'fast';

export function parseWanQualityMode(value: unknown): WanQualityMode {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (
    raw === 'fast' ||
    raw === '4' ||
    raw === '4step' ||
    raw === '4steps' ||
    raw === 'lightx2v' ||
    raw === 'lora'
  ) {
    return 'fast';
  }
  return 'quality';
}

export function resolveWanQualityMode(override?: WanQualityMode | string): WanQualityMode {
  if (override) return parseWanQualityMode(override);
  return parseWanQualityMode(process.env.WAN_COMFY_QUALITY_MODE || process.env.WAN_QUALITY_MODE);
}

export function wanQualityModeLabel(mode: WanQualityMode): string {
  return mode === 'fast' ? 'LightX2V · 4 steps (fast)' : 'Baseline · 20 steps (quality)';
}

export function wanQualityModeHint(mode: WanQualityMode): string {
  return mode === 'fast'
    ? 'Uses 4-step LoRA — much cheaper on Vast; compare quality on one scene first.'
    : 'Full 20-step route — best quality, ~14–15 min/scene at current GPU rates.';
}
