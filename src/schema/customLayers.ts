/**
 * Custom animation layers for one tech-reel beat (template `custom.layers`).
 *
 * Declarative only: shapes, text, code and counters with timed keyframes. A fixed renderer
 * (remotion/src/templates/scenes/custom.layers.tsx) interprets it, so an LLM can design a new
 * animation per beat through MCP without any code running. Browser-safe: no node imports.
 *
 * Canvas is the 1080 x 720 scene area. Times are seconds from the start of the beat.
 */
import { z } from 'zod';

const Id = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(40);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Seconds = z.number().min(0).max(30);

export const LAYER_CANVAS = { width: 1080, height: 720 } as const;
export const CUSTOM_LAYERS_TEMPLATE_ID = 'custom.layers';

export const LayerKeyframeSchema = z
  .object({
    at: Seconds,
    x: z.number().min(-200).max(1280).optional(),
    y: z.number().min(-200).max(920).optional(),
    scale: z.number().min(0.1).max(4).optional(),
    opacity: z.number().min(0).max(1).optional(),
    rotate: z.number().min(-720).max(720).optional()
  })
  .strict();

const base = {
  id: Id,
  x: z.number().min(0).max(1080),
  y: z.number().min(0).max(720),
  /** Appears at this time. */
  from: Seconds.default(0),
  /** Disappears after this time (fades over 0.25s). Omit to stay until the beat ends. */
  to: Seconds.optional(),
  enter: z.enum(['none', 'fade', 'rise', 'pop', 'draw', 'type']).default('fade'),
  enterSeconds: z.number().min(0.1).max(3).default(0.5),
  easing: z.enum(['linear', 'ease', 'spring']).default('ease'),
  opacity: z.number().min(0).max(1).default(1),
  color: Color.optional(),
  keys: z.array(LayerKeyframeSchema).max(12).optional()
};

export const LayerSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('text'),
    text: z.string().min(1).max(120),
    size: z.number().min(16).max(140).default(48),
    weight: z.union([z.literal(400), z.literal(500), z.literal(700)]).default(500),
    align: z.enum(['left', 'center', 'right']).default('center')
  }).strict(),
  z.object({
    ...base,
    type: z.literal('box'),
    w: z.number().min(20).max(1000),
    h: z.number().min(20).max(700),
    radius: z.number().min(0).max(200).default(14),
    fill: Color.optional(),
    stroke: Color.optional(),
    label: z.string().max(40).optional(),
    labelSize: z.number().min(14).max(80).default(28)
  }).strict(),
  z.object({
    ...base,
    type: z.literal('circle'),
    r: z.number().min(6).max(400),
    fill: Color.optional(),
    stroke: Color.optional(),
    label: z.string().max(40).optional(),
    labelSize: z.number().min(14).max(80).default(26)
  }).strict(),
  z.object({
    ...base,
    type: z.literal('arrow'),
    /** End point; (x, y) is the start. */
    x2: z.number().min(0).max(1080),
    y2: z.number().min(0).max(720),
    width: z.number().min(1).max(16).default(4),
    dashed: z.boolean().default(false),
    head: z.boolean().default(true)
  }).strict(),
  z.object({
    ...base,
    type: z.literal('code'),
    lines: z.array(z.string().max(64)).min(1).max(14),
    size: z.number().min(18).max(40).default(26),
    /** 0-based line numbers to highlight. */
    highlight: z.array(z.number().int().min(0).max(13)).max(14).optional()
  }).strict(),
  z.object({
    ...base,
    type: z.literal('counter'),
    fromValue: z.number().min(-1e9).max(1e9).default(0),
    toValue: z.number().min(-1e9).max(1e9),
    decimals: z.number().int().min(0).max(3).default(0),
    prefix: z.string().max(8).default(''),
    suffix: z.string().max(8).default(''),
    size: z.number().min(24).max(160).default(80)
  }).strict(),
  z.object({
    ...base,
    type: z.literal('bar'),
    w: z.number().min(40).max(1000),
    h: z.number().min(8).max(200),
    /** Final fill 0..1; fills during the enter animation. */
    value: z.number().min(0).max(1),
    fill: Color.optional()
  }).strict()
]);

export type Layer = z.infer<typeof LayerSchema>;
export const LayersSchema = z.array(LayerSchema).min(1).max(40);

/** Problems the schema alone cannot express (unique ids, keyframe order, time ranges). */
export function layerIssues(layers: readonly Layer[], beatSeconds: number): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = [];
  const seen = new Set<string>();
  layers.forEach((layer, i) => {
    if (seen.has(layer.id)) issues.push({ path: [i, 'id'], message: `Duplicate layer id "${layer.id}"` });
    seen.add(layer.id);
    if (layer.from > beatSeconds) issues.push({ path: [i, 'from'], message: `from (${layer.from}s) is after the beat ends (${beatSeconds}s)` });
    if (layer.to !== undefined && layer.to <= layer.from) issues.push({ path: [i, 'to'], message: 'to must be later than from' });
    (layer.keys || []).forEach((key, k, all) => {
      if (k > 0 && key.at <= all[k - 1]!.at) issues.push({ path: [i, 'keys', k, 'at'], message: 'Keyframes must be in increasing time order' });
      if (key.at > beatSeconds) issues.push({ path: [i, 'keys', k, 'at'], message: `Keyframe at ${key.at}s is after the beat ends` });
    });
    if (layer.type === 'code' && layer.highlight?.some((n) => n >= layer.lines.length)) {
      issues.push({ path: [i, 'highlight'], message: 'highlight refers to a line that does not exist' });
    }
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Evaluation (pure; used by the Remotion renderer and by tests)
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function applyEasing(kind: Layer['easing'], t: number): number {
  const p = clamp01(t);
  if (kind === 'linear') return p;
  if (kind === 'spring') {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }
  return p * p * (3 - 2 * p);
}

export type LayerState = {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  /** 0..1 progress of the enter animation (drives draw, type, bar fill, counter). */
  progress: number;
};

function keyed(layer: Layer, t: number, prop: 'x' | 'y' | 'scale' | 'opacity' | 'rotate', fallback: number): number {
  const points = (layer.keys || []).filter((key) => key[prop] !== undefined);
  if (!points.length) return fallback;
  if (t <= points[0]!.at) return points[0]![prop] as number;
  const last = points[points.length - 1]!;
  if (t >= last.at) return last[prop] as number;
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i]!;
    if (t <= b.at) {
      const a = points[i - 1]!;
      const local = applyEasing(layer.easing, (t - a.at) / (b.at - a.at));
      return lerp(a[prop] as number, b[prop] as number, local);
    }
  }
  return fallback;
}

export function layerStateAt(layer: Layer, t: number): LayerState {
  const hidden: LayerState = { visible: false, x: layer.x, y: layer.y, scale: 1, rotate: 0, opacity: 0, progress: 0 };
  if (t < layer.from) return hidden;
  const fadeOut = layer.to === undefined ? 1 : clamp01(1 - (t - layer.to) / 0.25);
  if (fadeOut <= 0) return hidden;

  const raw = layer.enter === 'none' ? 1 : clamp01((t - layer.from) / layer.enterSeconds);
  const progress = applyEasing(layer.easing, raw);
  let x = keyed(layer, t, 'x', layer.x);
  let y = keyed(layer, t, 'y', layer.y);
  let scale = keyed(layer, t, 'scale', 1);
  let opacity = keyed(layer, t, 'opacity', layer.opacity);
  const rotate = keyed(layer, t, 'rotate', 0);

  if (layer.enter === 'fade') opacity *= progress;
  if (layer.enter === 'rise') {
    opacity *= progress;
    y += (1 - progress) * 40;
  }
  if (layer.enter === 'pop') {
    opacity *= clamp01(raw * 3);
    scale *= 0.6 + 0.4 * applyEasing('spring', raw);
  }
  return { visible: true, x, y, scale, rotate, opacity: opacity * fadeOut, progress: layer.enter === 'none' ? 1 : progress };
}
