import { z } from 'zod';

/**
 * Deterministic teaching visuals for tech-instagram only.
 * Mythology episodes must omit these fields — AI stills stay on the heritage path.
 *
 * `animationSteps[].at` is a fraction of the scene duration (0–1) so TTS retiming
 * keeps the teaching beats aligned.
 */
export const TechVisualTypeSchema = z.enum([
  'TECH_HOOK',
  'GROWTH_BARS',
  'ARRAY_LOOKUP',
  'ARRAY_TRAVERSAL',
  'NESTED_LOOP_GRID',
  'HALVING',
  'TIME_VS_SPACE',
  'COMPLEXITY_LADDER',
  /** Movie-hall / booking UI beat — seats + labels are Remotion text, never AI glyphs. */
  'BOOKING_HALL',
  /** Real monospace code/SQL panel — Remotion text only. */
  'CODE_PANEL',
  /** Animated visitor/owner/cache/db request flow — Remotion only (packets, TTL bar, stale states). */
  'SYSTEM_FLOW'
]);

export const TechAnimationStepSchema = z.object({
  at: z.number().min(0).max(1),
  action: z.string().min(1).max(64),
  index: z.number().int().nonnegative().optional(),
  row: z.number().int().nonnegative().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  label: z.string().max(120).optional()
});

const NumberArraySchema = z.array(z.number()).min(1).max(32);

/**
 * Known teaching fields are typed; extra keys are allowed (passthrough) so
 * Remotion cards can take episode-specific props without a schema bump each time.
 */
export const TechVisualDataSchema = z
  .object({
    title: z.string().max(80).optional(),
    subtitle: z.string().max(120).optional(),
    complexity: z.string().max(24).optional(),
    values: NumberArraySchema.optional(),
    targetIndex: z.number().int().nonnegative().optional(),
    result: z.number().optional(),
    rows: z.number().int().positive().max(12).optional(),
    columns: z.number().int().positive().max(12).optional(),
    sequence: NumberArraySchema.optional(),
    ladder: z.array(z.string().min(1).max(24)).max(8).optional(),
    timeLabel: z.string().max(24).optional(),
    spaceLabel: z.string().max(24).optional(),
    inputSizes: NumberArraySchema.optional(),
    operations: NumberArraySchema.optional(),
    /** Fixed sliding-window length k (Remotion SlidingWindowCard). */
    windowSize: z.number().int().positive().max(16).optional(),
    slidingWindow: z.boolean().optional(),
    windowMode: z.enum(['fixed', 'twoPointer']).optional(),
    /** CODE_PANEL: exact lines drawn by Remotion (prefer over single `code` blob). */
    codeLines: z.array(z.string().max(120)).max(16).optional(),
    /** CODE_PANEL: multiline source; split on \\n when codeLines omitted. */
    code: z.string().max(1200).optional(),
    language: z.enum(['python', 'sql', 'text']).optional(),
    filename: z.string().max(48).optional(),
    codeVariant: z.enum(['buggy', 'fixed', 'neutral']).optional(),
    badge: z.string().max(48).optional(),
    /** BOOKING_HALL / race beats */
    movieTitle: z.string().max(40).optional(),
    seatId: z.string().max(8).optional(),
    seatStatus: z.enum(['AVAILABLE', 'BOOKED']).optional(),
    hallRows: z.number().int().positive().max(8).optional(),
    hallCols: z.number().int().positive().max(10).optional(),
    requestALabel: z.string().max(24).optional(),
    requestBLabel: z.string().max(24).optional()
  })
  .passthrough();

export const TechVisualSchema = z.object({
  visualType: TechVisualTypeSchema,
  visualData: TechVisualDataSchema.default({}),
  animationSteps: z.array(TechAnimationStepSchema).max(48).default([])
});

export type TechVisualType = z.infer<typeof TechVisualTypeSchema>;
export type TechAnimationStep = z.infer<typeof TechAnimationStepSchema>;
export type TechVisualData = z.infer<typeof TechVisualDataSchema>;
export type TechVisual = z.infer<typeof TechVisualSchema>;
