import { z } from 'zod';
import { VoiceDirectionSchema } from './voiceDirection.js';

/** Fixed reusable voice roles — do not invent new speakers per request. */
export const DEFAULT_VOICE_ROLES = [
  'NARRATOR',
  'MALE_CHARACTER',
  'FEMALE_CHARACTER',
  'MALE_ELDER'
] as const;

export type DefaultVoiceRole = (typeof DEFAULT_VOICE_ROLES)[number];

export const VoiceRoleProfileSchema = z.object({
  provider: z.enum(['sarvam', 'elevenlabs', 'edge']),
  /** e.g. bulbul:v3 */
  model: z.string().min(1).optional(),
  /** Sarvam speaker id OR ElevenLabs voice id — fixed per role, never shuffled randomly. */
  speaker: z.string().min(1),
  languageCode: z.string().min(2).optional(),
  pace: z.number().positive().max(2).optional(),
  temperature: z.number().positive().max(1.5).optional()
});

export type VoiceRoleProfile = z.infer<typeof VoiceRoleProfileSchema>;

export const VoiceCastSchema = z.record(z.string().min(1), VoiceRoleProfileSchema);
export type VoiceCast = z.infer<typeof VoiceCastSchema>;

export const CharacterVoiceMapSchema = z.record(z.string().min(1), z.string().min(1));
export type CharacterVoiceMap = z.infer<typeof CharacterVoiceMapSchema>;

export const VoiceSegmentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['NARRATION', 'DIALOGUE']),
  /** Display / casting name, e.g. NARRATOR or Devaki */
  speaker: z.string().min(1),
  /** Key into episode.voiceCast */
  voiceRole: z.string().min(1),
  /** Plain spoken line (captions / non-ElevenLabs). */
  textHi: z.string().min(1),
  delivery: z.string().min(1).optional(),
  /** ElevenLabs v4 direction metadata (emotion / intensity / soft pauses). */
  voiceDirection: VoiceDirectionSchema.optional(),
  /**
   * Exact text sent to ElevenLabs v4 — may include audio tags like [calmly].
   * When omitted, TTS builds a simple tag from voiceDirection + textHi.
   */
  elevenLabsText: z.string().min(1).optional(),
  lipSync: z.boolean().optional().default(false)
});

export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>;

export const SpokenHookObjectSchema = z.object({
  textHi: z.string().min(1),
  voiceRole: z.string().min(1).optional(),
  delivery: z.string().min(1).optional(),
  estimatedDurationSeconds: z.number().positive().max(10).optional()
});

export type SpokenHookObject = z.infer<typeof SpokenHookObjectSchema>;

/** String (legacy) or structured object. */
export const SpokenHookSchema = z.union([z.string().min(1), SpokenHookObjectSchema]);
export type SpokenHookValue = z.infer<typeof SpokenHookSchema>;

/** EpicAstra defaults from config/sarvam-voices.json — fixed speakers, never random. */
export function defaultSarvamVoiceCast(): VoiceCast {
  return {
    NARRATOR: {
      provider: 'sarvam',
      model: 'bulbul:v3',
      speaker: 'shubh',
      languageCode: 'hi-IN',
      pace: 1.07,
      temperature: 0.74
    },
    MALE_CHARACTER: {
      provider: 'sarvam',
      model: 'bulbul:v3',
      speaker: 'aditya',
      languageCode: 'hi-IN',
      pace: 1.0,
      temperature: 0.72
    },
    FEMALE_CHARACTER: {
      provider: 'sarvam',
      model: 'bulbul:v3',
      speaker: 'ritu',
      languageCode: 'hi-IN',
      pace: 0.98,
      temperature: 0.72
    },
    MALE_ELDER: {
      provider: 'sarvam',
      model: 'bulbul:v3',
      speaker: 'anand',
      languageCode: 'hi-IN',
      pace: 0.95,
      temperature: 0.7
    }
  };
}

export function spokenHookText(value: SpokenHookValue | undefined | null): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return (value.textHi || '').trim();
}

export function spokenHookDelivery(
  value: SpokenHookValue | undefined | null,
  fallback?: string
): string | undefined {
  if (value && typeof value === 'object' && value.delivery?.trim()) return value.delivery.trim();
  return fallback?.trim() || undefined;
}
