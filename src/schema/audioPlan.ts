import { z } from 'zod';

/** Allowed SFX ids — LLM must pick only from this list (no invented filenames). */
export const SFX_EFFECT_IDS = [
  'deep-boom',
  'impact',
  'whoosh',
  'riser',
  'transition-whoosh',
  'divine-chime',
  'temple-bell',
  'shankh',
  'magical-sparkle',
  'thunder',
  'rain',
  'wind',
  'river',
  'fire',
  'sword-clash',
  'arrow',
  'heavy-impact',
  'wing-flap'
] as const;

export type SfxEffectId = (typeof SFX_EFFECT_IDS)[number];

export const BgmMoodSchema = z.enum([
  'divine_mystery',
  'dark_mystery',
  'epic_battle',
  'emotional',
  'revelation'
]);

export type BgmMood = z.infer<typeof BgmMoodSchema>;

export const SfxCueSchema = z.object({
  time: z.number().nonnegative(),
  effect: z.enum(SFX_EFFECT_IDS),
  volume: z.number().min(0.2).max(0.8),
  reason: z.string().min(3).max(200)
});

/** Core plan fields (LLM / mix). All keys required for OpenAI strict JSON schema. */
export const AudioPlanCoreSchema = z.object({
  bgmMood: BgmMoodSchema,
  sfx: z.array(SfxCueSchema).min(1).max(8)
});

/**
 * Persisted plan may include mix-time metadata.
 * Do not send this full object to OpenAI structured outputs — use AudioPlanCoreSchema
 * or SoundDirectorLlmSchema instead (optional keys break strict mode).
 */
export const AudioPlanSchema = AudioPlanCoreSchema.extend({
  /** How cue times were derived. */
  timingSource: z.enum(['scene-planned', 'narration-aligned']).optional(),
  narrationDurationSeconds: z.number().positive().optional(),
  /** Absolute path or basename of BGM track chosen at mix time. */
  bgmTrack: z.string().optional(),
  /** True when episode used paid ElevenLabs Music (hero Reel). */
  heroBgm: z.boolean().optional(),
  /** Per-cue library vs ElevenLabs / skipped usage from last mix. */
  sfxUsage: z
    .object({
      local: z.number().int().nonnegative(),
      elevenlabs: z.number().int().nonnegative(),
      /** Cues skipped because the WAV was missing (upload optional; mix continues). */
      skipped: z.number().int().nonnegative().optional(),
      cues: z.array(
        z.object({
          effect: z.string().min(1),
          source: z.enum(['library', 'custom', 'elevenlabs', 'skipped']),
          file: z.string().min(1)
        })
      )
    })
    .optional()
});

export type AudioPlan = z.infer<typeof AudioPlanSchema>;
export type SfxCue = z.infer<typeof SfxCueSchema>;

/** Loose LLM parse before normalize/clamp. */
export const SoundDirectorLlmSchema = z.object({
  bgmMood: BgmMoodSchema,
  sfx: z
    .array(
      z.object({
        time: z.number().nonnegative(),
        effect: z.string().min(1),
        volume: z.number(),
        reason: z.string().min(1).max(300)
      })
    )
    .min(1)
    .max(12)
});
