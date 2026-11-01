import { z } from 'zod';

/**
 * Per-scene / per-segment direction for ElevenLabs v4.
 * Captions and packaging keep plain narrationHi / textHi.
 * TTS sends elevenLabsText (inline audio tags) when present.
 *
 * v4 notes:
 * - model_id: eleven_v4 (or eleven_v4_turbo)
 * - voice_settings: stability + similarity_boost only (no style/speed)
 * - SSML breaks are unsupported — use tags, ellipses, and punctuation for pauses
 */
export const VoiceDirectionSchema = z.object({
  /** High-level emotion, e.g. compassionate, solemn, curious */
  emotion: z.string().trim().min(1).max(40),
  /** Delivery cues, e.g. "calm, firm, deliberate" */
  delivery: z.string().trim().min(1).max(120),
  /** 0–1 expressiveness hint → maps to lower stability on v4 */
  intensity: z.number().min(0).max(1).optional(),
  /** Soft pause before the line (approximate via leading ellipsis; no SSML) */
  pauseBeforeMs: z.number().int().min(0).max(3000).optional(),
  /** Soft pause after the line */
  pauseAfterMs: z.number().int().min(0).max(3000).optional()
});

export type VoiceDirection = z.infer<typeof VoiceDirectionSchema>;

/** Strip [audio tags] for captions / non-ElevenLabs providers. */
export function stripElevenLabsAudioTags(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function firstDeliveryTag(delivery: string): string {
  const first = delivery
    .split(/[,/|]/)
    .map((part) => part.trim().toLowerCase())
    .find(Boolean);
  if (!first) return 'calmly';
  // Prefer adverb-style tags Eleven v4 follows well: [calmly], [firmly]
  if (first.endsWith('ly')) return first;
  if (first === 'calm') return 'calmly';
  if (first === 'firm') return 'firmly';
  if (first === 'soft') return 'softly';
  if (first === 'quiet') return 'quietly';
  return first;
}

/**
 * Build a tagged line when authors only filled voiceDirection + plain text.
 * Prefer hand-authored elevenLabsText for multi-beat delivery.
 */
export function buildElevenLabsTextFromDirection(
  plainText: string,
  direction?: VoiceDirection | null
): string {
  const plain = plainText.trim();
  if (!plain) return '';
  if (!direction) return plain;
  const tag = firstDeliveryTag(direction.delivery) || direction.emotion.trim().toLowerCase();
  return `[${tag}] ${plain}`;
}

/** Approximate pauseBefore/After with ellipses (v4 has no SSML <break>). */
export function applyVoiceDirectionPauses(
  text: string,
  direction?: VoiceDirection | null
): string {
  let next = text.trim();
  if (!next || !direction) return next;
  if ((direction.pauseBeforeMs ?? 0) >= 250 && !next.startsWith('...')) {
    next = `... ${next}`;
  }
  if ((direction.pauseAfterMs ?? 0) >= 250 && !next.endsWith('...')) {
    next = `${next} ...`;
  }
  return next;
}

export type SpeakableVoiceFields = {
  plainText: string;
  elevenLabsText?: string | undefined;
  voiceDirection?: VoiceDirection | undefined;
};

/** Text sent to ElevenLabs v4 (tags kept). */
export function resolveElevenLabsSpeakText(fields: SpeakableVoiceFields): string {
  const authored = fields.elevenLabsText?.trim();
  const base = authored
    ? authored
    : buildElevenLabsTextFromDirection(fields.plainText, fields.voiceDirection);
  return applyVoiceDirectionPauses(base, fields.voiceDirection);
}

/**
 * Map voiceDirection.intensity → v4 stability.
 * Higher intensity → slightly lower stability (more expressive).
 */
export function voiceDirectionToV4Settings(direction?: VoiceDirection | null): {
  stability: number;
  similarity_boost: number;
} {
  const intensity = direction?.intensity;
  const stability =
    typeof intensity === 'number' && Number.isFinite(intensity)
      ? Math.min(0.85, Math.max(0.28, 0.78 - intensity * 0.35))
      : 0.55;
  return {
    stability: Number(stability.toFixed(3)),
    similarity_boost: 0.82
  };
}
