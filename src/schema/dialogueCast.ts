import { z } from 'zod';

/**
 * Optional two-speaker dialogue metadata for EpicAstra.
 * Production TTS still uses narrationHi / elevenLabsText / voiceSegments (single joined pass today).
 * Keep dialogueLines + elevenLabsDialogueRequest for manual A/B export and future dialogue TTS.
 */

export const EpisodeFormatSchema = z.enum(['SINGLE_NARRATOR', 'TWO_SPEAKER_DIALOGUE']);
export type EpisodeFormat = z.infer<typeof EpisodeFormatSchema>;

export const DialogueSpeakerSchema = z
  .string()
  .trim()
  .min(1)
  .max(8)
  .regex(/^[A-Za-z0-9_-]+$/, 'speaker must be a short id like A or B');

export const DialogueLineSchema = z.object({
  speaker: DialogueSpeakerSchema,
  /** May include ElevenLabs audio tags, e.g. "[curious] सोचिए..." */
  text: z.string().trim().min(1).max(2000)
});

export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const DialogueVoiceProfileSchema = z.object({
  role: z.string().trim().min(1).max(120),
  /** ElevenLabs voice id — replace placeholders before dual-voice export. */
  voiceId: z.string().trim().min(1).max(80),
  note: z.string().trim().min(1).max(400).optional()
});

export const EpisodeVoicesSchema = z
  .object({
    A: DialogueVoiceProfileSchema.optional(),
    B: DialogueVoiceProfileSchema.optional()
  })
  .passthrough();

export const ElevenLabsDialogueRequestSchema = z.object({
  note: z.string().trim().min(1).max(500).optional(),
  inputs: z.array(DialogueLineSchema).min(1).max(80)
});
