import { z } from 'zod';

export const NarrationMoodSchema = z.enum([
  'mysterious',
  'epic',
  'dark',
  'tender',
  'divine',
  'tense',
  'joyful'
]);

export const NarrationIntensitySchema = z.enum(['low', 'medium', 'high']);
export const NarrationPaceSchema = z.enum(['slow', 'medium', 'fast']);
export const NarrationEmotionSchema = z.enum([
  'devotional',
  'fearful',
  'hopeful',
  'powerful',
  'sorrowful',
  'awe',
  'neutral',
  'urgent'
]);

/**
 * Episode-level voice direction for TTS (and Sound Director context).
 * Story LLM fills this from the chapter tone — TTS maps it to provider knobs.
 */
export const NarrationStyleSchema = z.object({
  mood: NarrationMoodSchema,
  intensity: NarrationIntensitySchema,
  pace: NarrationPaceSchema,
  emotion: NarrationEmotionSchema
});

export type NarrationStyle = z.infer<typeof NarrationStyleSchema>;

/**
 * Conversational Cinematic Kathavachak — warm, knowledgeable, emotionally restrained.
 * Avoids the old mysterious/trailer default that made every short sound intense.
 */
export const DEFAULT_NARRATION_STYLE: NarrationStyle = {
  mood: 'tender',
  intensity: 'low',
  pace: 'medium',
  emotion: 'devotional'
};

export function resolveNarrationStyle(raw?: unknown): NarrationStyle {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NARRATION_STYLE };
  const parsed = NarrationStyleSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_NARRATION_STYLE };
}
