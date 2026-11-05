import { z } from 'zod';
import { AudioPlanSchema } from './audioPlan.js';
import { NarrationStyleSchema } from './narrationStyle.js';
import { VisualStyleSchema } from './visualStyle.js';
import { TechVisualSchema } from './techVisual.js';
import {
  CharacterVoiceMapSchema,
  SpokenHookSchema,
  VoiceCastSchema,
  VoiceSegmentSchema,
  spokenHookText
} from './voiceCast.js';
import { VoiceDirectionSchema } from './voiceDirection.js';
import {
  DialogueLineSchema,
  ElevenLabsDialogueRequestSchema,
  EpisodeFormatSchema,
  EpisodeVoicesSchema
} from './dialogueCast.js';

export const RenderModeSchema = z.enum(['STILL', 'AI_VIDEO']);
const PublishingTitleSchema = z.string().trim().min(3).max(100);
const PublishingTitleSetSchema = z.object({
  shared: PublishingTitleSchema.optional(),
  youtube: PublishingTitleSchema.optional(),
  instagram: PublishingTitleSchema.optional(),
  facebook: PublishingTitleSchema.optional()
});
export const StoryKindSchema = z.enum([
  'CANONICAL_MYTHOLOGY',
  'LESSER_KNOWN_MYTHOLOGY',
  'ORIGINAL_MYTH_FICTION',
  'TECH_EDUCATION'
]);

export const SceneSchema = z.object({
  id: z.number().int().positive(),
  startSecond: z.number().nonnegative(),
  /**
   * Planned picture window. Mythology: ≤8s. Tech (with techVisual): ≤12s planning budget;
   * final Short still retimes to real TTS via narration-aligned timeline.
   */
  durationSeconds: z.number().positive().max(12),
  /** Full-scene readable narration (fallback + captions when voiceSegments absent). */
  narrationHi: z.string().min(1),
  /**
   * Optional multi-speaker beats (narrator + short dialogue).
   * When absent, TTS treats narrationHi as one NARRATOR segment.
   */
  voiceSegments: z.array(VoiceSegmentSchema).min(1).max(8).optional(),
  /**
   * Scene-level ElevenLabs v4 direction when voiceSegments are absent.
   * Captions still use narrationHi (no audio tags).
   */
  voiceDirection: VoiceDirectionSchema.optional(),
  /**
   * Exact ElevenLabs v4 speak text (inline audio tags allowed).
   * Example: "[calmly] राम ने कहा—विभीषण! [firmly] मृत्यु के साथ ही वैर भी समाप्त हो जाता है।"
   */
  elevenLabsText: z.string().min(1).optional(),
  /**
   * Optional A/B dialogue beats for TWO_SPEAKER_DIALOGUE episodes.
   * Captions still use narrationHi (no speaker labels). TTS may join into elevenLabsText / voiceSegments.
   */
  dialogueLines: z.array(DialogueLineSchema).min(1).max(8).optional(),
  visualPrompt: z.string().min(1),
  /**
   * Motion/animation direction for AI_VIDEO (Wan/Kling/Veo). Optional so older JSON
   * and STILL scenes remain valid. Do not duplicate visualPrompt — describe movement.
   */
  videoPrompt: z.string().min(1).optional(),
  /** Artifacts / motion problems to avoid when animating the keyframe. */
  videoNegativePrompt: z.string().min(1).optional(),
  camera: z.string().min(1),
  importance: z.number().int().min(1).max(10),
  renderMode: RenderModeSchema,
  soundCue: z.string().min(1),
  /**
   * English lord/character names visible in this scene (must match featuredLords.nameEn).
   * Image models use this so they do not invent the wrong deity.
   * Empty array = no character locks (crowd/location only).
   */
  appearingLords: z.array(z.string().min(1)).max(5).optional(),
  /**
   * Optional state key per appearing lord (e.g. Amba → "PENANCE", Shikhandini → "CHILD").
   * Must match a key in featuredLords[].states for that nameEn.
   */
  characterStates: z.record(z.string(), z.string().min(1).max(40)).optional(),
  /**
   * Tech-only deterministic diagram (Remotion-style teaching visual).
   * When set, render uses exact numbers/labels — AI image is optional background only.
   */
  techVisual: TechVisualSchema.optional()
});

export const HookDeliverySchema = z.enum([
  'curious',
  'confident',
  'urgent',
  'warm',
  'intriguing',
  /** Tech interview challenge: hold a silent beat after the hook so viewers can scan on-screen code. */
  'challenge_then_pause'
]);

/**
 * Lords / beings the story LLM must name so image generation stays on-model.
 * visualIdentity is the default iconography lock; states hold age/costume variants.
 */
export const FeaturedLordSchema = z.object({
  nameEn: z.string().min(2).max(80),
  nameHi: z.string().min(1).max(80),
  /** primary = main figure; supporting = recurring; minor = brief / montage only. */
  importance: z.enum(['primary', 'supporting', 'minor']),
  visualIdentity: z.string().min(24).max(700),
  doNotConfuseWith: z.string().min(8).max(220),
  /** Optional named visual states (CHILD, PENANCE, WARRIOR, …). */
  states: z.record(z.string().min(1).max(40), z.string().min(24).max(700)).optional()
});

/** Core episode fields required from story LLMs (OpenAI strict-safe). */
/** Pipeline id = config/brands/<id>.json. Existence is checked at import/publish (isBrandId). */
export const BrandIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, 'Invalid pipeline id');

export const EpisodeBaseObjectSchema = z.object({
  id: z.string().min(1),
  /** Production pipeline / brand. Older mythology JSON may omit (treated as epicastra). */
  brandId: BrandIdSchema.optional(),
  /**
   * Narration packaging. Default / omitted = SINGLE_NARRATOR.
   * TWO_SPEAKER_DIALOGUE keeps dialogueLines + elevenLabsDialogueRequest for A/B export;
   * production TTS still joins to one pass unless a dual-voice path is used later.
   */
  format: EpisodeFormatSchema.optional(),
  storyKind: StoryKindSchema,
  topic: z.string().min(1),
  titleHi: z.string().min(1),
  titleEn: z.string().min(1),
  /** Packaging / thumbnail curiosity line — NOT automatically spoken. */
  hookHi: z.string().min(1),
  /**
   * First words the viewer hears (TTS + captions). Never the publishing title.
   * String (legacy) or { textHi, voiceRole, delivery, estimatedDurationSeconds }.
   * Do not include "A:" / "B:" speaker labels in the spoken string.
   */
  spokenHook: SpokenHookSchema.optional(),
  /** Optional explicit hook start (normally 0). */
  spokenHookStartSecond: z.number().nonnegative().max(30).optional(),
  /**
   * Planned picture/caption window for spokenHook starting at t=0.
   * Shorts usually ≤10s; tech interview hooks (challenge + hold) may go to 20s.
   * Final Short still retimes to real TTS.
   */
  spokenHookDurationSeconds: z.number().positive().max(20).optional(),
  /**
   * Delivery hint for spokenHook TTS tone.
   * Generated shorts use the enum; imported kathas may keep a short custom direction.
   */
  hookDelivery: z.union([HookDeliverySchema, z.string().trim().min(1).max(160)]).optional(),
  /** Optional structured hook dialogue (A/B). Prefer this over embedding labels in spokenHook. */
  hookDialogueLines: z.array(DialogueLineSchema).min(1).max(6).optional(),
  /**
   * Named lords/characters for this script (AI-filled). Optional on older disk JSON.
   */
  /** Shorts usually ≤8; long-form katha masters may list more cast locks. */
  featuredLords: z.array(FeaturedLordSchema).min(1).max(16).optional(),
  /**
   * Fixed TTS roles (NARRATOR / MALE_CHARACTER / …). Speakers must stay stable across episodes.
   */
  voiceCast: VoiceCastSchema.optional(),
  /**
   * Map featuredLords.nameEn (or character labels) → voiceCast role keys.
   */
  characterVoiceMap: CharacterVoiceMapSchema.optional(),
  /** Optional A/B voice casting notes for TWO_SPEAKER_DIALOGUE (manual join / future dialogue TTS). */
  voices: EpisodeVoicesSchema.optional(),
  /**
   * Optional full dialogue request payload (writer reference / dual-voice export).
   * Not consumed by the single-pass ElevenLabs CLI today.
   */
  elevenLabsDialogueRequest: ElevenLabsDialogueRequestSchema.optional(),
  /**
   * Optional override for the spoken-hook still prompt (image gen).
   * When absent, hook still is built from spokenHook + featuredLords.
   */
  hookVisualPrompt: z.string().min(1).optional(),
  /** Characters locked into the hook still (must match featuredLords.nameEn). */
  hookAppearingLords: z.array(z.string().min(1)).max(3).optional(),
  hookCharacterStates: z.record(z.string(), z.string().min(1).max(40)).optional(),
  /** Tech-only deterministic hook diagram (optional). */
  hookTechVisual: TechVisualSchema.optional(),
  /**
   * Picture plan (hook + scenes). Shorts: 25–60s. Long-form katha masters may go higher
   * (import/TTS); story LLM generation still targets Short budgets via EpisodeGenerationSchema.
   */
  /** Whole seconds for generated Shorts; imported kathas may use one-decimal picture plans. */
  targetDurationSeconds: z.number().min(25).max(600),
  audience: z.enum(['GENERAL_FAMILY', 'TEENS_ADULTS']),
  fictionDisclosureRequired: z.boolean(),
  sourceReview: z.object({
    status: z.enum(['NEEDS_REVIEW', 'FICTION']),
    claimsToVerify: z.array(z.string()),
    notes: z.array(z.string()),
    references: z.array(z.string().trim().min(1).max(300)).max(12).optional()
  }),
  /** Shorts: 5–8 scenes. Long-form connected katha may use more beats. */
  scenes: z.array(SceneSchema).min(5).max(48),
  ending: z.object({
    payoffHi: z.string().min(1),
    nextEpisodeTeaseHi: z.string().min(1),
    /** False when the share ask already lives in the last scene and payoffHi must not be spoken again. */
    payoffSpokenSeparately: z.boolean().optional(),
    /** On-screen closing line (mantra). Not spoken unless it is also payoffHi. */
    onScreenClosingTextHi: z.string().trim().min(1).max(80).optional(),
    teaseStartSecond: z.number().nonnegative().optional(),
    teaseDurationSeconds: z.number().positive().max(20).optional(),
    teaseVisualHold: z.string().trim().min(1).max(400).optional(),
    teaseDialogueLines: z.array(DialogueLineSchema).min(1).max(6).optional()
  }),
  metadata: z.object({
    descriptionHi: z.string().min(1),
    keywords: z.array(z.string()).min(3).max(12),
    thumbnailTextHi: z.string().min(1).max(60)
  })
});

function normalizeSpoken(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolveHookDuration(
  episode: z.infer<typeof EpisodeBaseObjectSchema>
): number | undefined {
  if (
    typeof episode.spokenHookDurationSeconds === 'number' &&
    Number.isFinite(episode.spokenHookDurationSeconds) &&
    episode.spokenHookDurationSeconds > 0
  ) {
    return episode.spokenHookDurationSeconds;
  }
  const hook = episode.spokenHook;
  if (hook && typeof hook === 'object' && typeof hook.estimatedDurationSeconds === 'number') {
    return hook.estimatedDurationSeconds;
  }
  return undefined;
}

/** Shared spokenHook / title / timeline security for disk + LLM strict generation. */
function refineEpisode(
  episode: z.infer<typeof EpisodeBaseObjectSchema>,
  context: z.RefinementCtx
): void {
  const isFiction = episode.storyKind === 'ORIGINAL_MYTH_FICTION';
  const isTech = episode.storyKind === 'TECH_EDUCATION';
  if (isFiction && episode.sourceReview.status !== 'FICTION') {
    context.addIssue({
      code: 'custom',
      path: ['sourceReview', 'status'],
      message: 'Original fiction must use FICTION status'
    });
  }
  if (isFiction && !episode.fictionDisclosureRequired) {
    context.addIssue({
      code: 'custom',
      path: ['fictionDisclosureRequired'],
      message: 'Original fiction requires disclosure'
    });
  }
  if (!isFiction && episode.sourceReview.status !== 'NEEDS_REVIEW') {
    context.addIssue({
      code: 'custom',
      path: ['sourceReview', 'status'],
      message: isTech
        ? 'Tech education must use NEEDS_REVIEW status (accuracy check)'
        : 'Mythology must use NEEDS_REVIEW status'
    });
  }
  if (!isFiction && episode.fictionDisclosureRequired) {
    context.addIssue({
      code: 'custom',
      path: ['fictionDisclosureRequired'],
      message: isTech
        ? 'Tech education is not fiction disclosure content'
        : 'Canonical mythology cannot be labelled original fiction'
    });
  }
  if (!isFiction && episode.sourceReview.claimsToVerify.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['sourceReview', 'claimsToVerify'],
      message: isTech
        ? 'Tech education must list accuracy claims to verify (facts, versions, definitions)'
        : 'Mythology must include claims for human verification'
    });
  }

  const ids = episode.scenes.map((scene) => scene.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['scenes'], message: 'Scene IDs must be unique' });
  }

  const hookText = spokenHookText(episode.spokenHook);
  const hasHook = hookText.length > 0;
  const hookDurResolved = resolveHookDuration(episode);

  if (hasHook) {
    if (typeof hookDurResolved !== 'number' || !(hookDurResolved > 0)) {
      context.addIssue({
        code: 'custom',
        path: ['spokenHookDurationSeconds'],
        message: 'spokenHook requires spokenHookDurationSeconds (planned window at t=0)'
      });
    }
    const deliveryFromObject =
      episode.spokenHook && typeof episode.spokenHook === 'object'
        ? episode.spokenHook.delivery
        : undefined;
    if (!episode.hookDelivery && !deliveryFromObject) {
      context.addIssue({
        code: 'custom',
        path: ['hookDelivery'],
        message: 'spokenHook requires hookDelivery (or spokenHook.delivery)'
      });
    }

    const hookNorm = normalizeSpoken(hookText);
    if (hookNorm === normalizeSpoken(episode.titleHi) || hookNorm === normalizeSpoken(episode.titleEn)) {
      context.addIssue({
        code: 'custom',
        path: ['spokenHook'],
        message: 'spokenHook must differ from titleHi/titleEn (titles are packaging only, never spoken)'
      });
    }

    const scene1 = episode.scenes[0]?.narrationHi?.trim() || '';
    if (scene1) {
      const sceneNorm = normalizeSpoken(scene1);
      if (sceneNorm === hookNorm || sceneNorm.startsWith(hookNorm) || hookNorm.startsWith(sceneNorm)) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', 0, 'narrationHi'],
          message: 'Scene 1 must continue after spokenHook — do not repeat the hook'
        });
      } else {
        const hookLead = hookNorm.slice(0, Math.min(48, Math.floor(hookNorm.length * 0.7)));
        if (hookLead.length >= 24 && sceneNorm.includes(hookLead)) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', 0, 'narrationHi'],
            message: 'Scene 1 must not reuse the spokenHook opening line'
          });
        }
      }
    }
  }

  if (episode.voiceCast && episode.characterVoiceMap) {
    for (const [character, role] of Object.entries(episode.characterVoiceMap)) {
      if (!episode.voiceCast[role]) {
        context.addIssue({
          code: 'custom',
          path: ['characterVoiceMap', character],
          message: `characterVoiceMap "${character}" → "${role}" is missing from voiceCast`
        });
      }
    }
  }

  for (const [sceneIndex, scene] of episode.scenes.entries()) {
    // Picture-plan budget: shorts usually ≤8s; dialogue / long-form may use up to schema max (12).
    if (!isTech && scene.durationSeconds > 12) {
      context.addIssue({
        code: 'custom',
        path: ['scenes', sceneIndex, 'durationSeconds'],
        message: 'Mythology scene durationSeconds must be ≤ 12'
      });
    }
    if (!isTech && scene.techVisual) {
      context.addIssue({
        code: 'custom',
        path: ['scenes', sceneIndex, 'techVisual'],
        message: 'techVisual is only allowed on TECH_EDUCATION episodes'
      });
    }
    for (const [segIndex, segment] of (scene.voiceSegments || []).entries()) {
      if (episode.voiceCast && !episode.voiceCast[segment.voiceRole]) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', sceneIndex, 'voiceSegments', segIndex, 'voiceRole'],
          message: `voiceRole "${segment.voiceRole}" is missing from voiceCast`
        });
      }
    }
  }

  if (!isTech && episode.hookTechVisual) {
    context.addIssue({
      code: 'custom',
      path: ['hookTechVisual'],
      message: 'hookTechVisual is only allowed on TECH_EDUCATION episodes'
    });
  }

  const hookDur = hasHook && typeof hookDurResolved === 'number' ? hookDurResolved : 0;

  let expectedStart = hookDur;
  for (const [index, scene] of episode.scenes.entries()) {
    if (Math.abs(scene.startSecond - expectedStart) > 0.01) {
      context.addIssue({
        code: 'custom',
        path: ['scenes', index, 'startSecond'],
        message: `Expected ${expectedStart}; scenes must follow spokenHook (${hookDur}s) then stay continuous`
      });
    }
    expectedStart += scene.durationSeconds;
  }

  if (Math.abs(expectedStart - episode.targetDurationSeconds) > 0.01) {
    context.addIssue({
      code: 'custom',
      path: ['targetDurationSeconds'],
      message: `Episode duration must equal spokenHook (${hookDur}s) + scene total (expected ${expectedStart})`
    });
  }

  const lords = episode.featuredLords || [];
  if (lords.length) {
    const nameEns = lords.map((lord) => lord.nameEn.trim().toLowerCase());
    if (new Set(nameEns).size !== nameEns.length) {
      context.addIssue({
        code: 'custom',
        path: ['featuredLords'],
        message: 'featuredLords.nameEn values must be unique'
      });
    }
    if (!lords.some((lord) => lord.importance === 'primary')) {
      context.addIssue({
        code: 'custom',
        path: ['featuredLords'],
        message: 'At least one featuredLord must be importance=primary'
      });
    }
    for (const [sceneIndex, scene] of episode.scenes.entries()) {
      for (const [lordIndex, name] of (scene.appearingLords || []).entries()) {
        if (!nameEns.includes(name.trim().toLowerCase())) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', sceneIndex, 'appearingLords', lordIndex],
            message: `appearingLords entry "${name}" must match a featuredLords.nameEn`
          });
        }
      }
      const states = scene.characterStates || {};
      for (const [name, stateKey] of Object.entries(states)) {
        const lord = lords.find((item) => item.nameEn.trim().toLowerCase() === name.trim().toLowerCase());
        if (!lord) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', sceneIndex, 'characterStates', name],
            message: `characterStates key "${name}" must match a featuredLords.nameEn`
          });
          continue;
        }
        if (!(scene.appearingLords || []).some((n) => n.trim().toLowerCase() === name.trim().toLowerCase())) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', sceneIndex, 'characterStates', name],
            message: `characterStates "${name}" must also appear in appearingLords`
          });
        }
        if (lord.states && !lord.states[stateKey]) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', sceneIndex, 'characterStates', name],
            message: `Unknown state "${stateKey}" for ${lord.nameEn}; known: ${Object.keys(lord.states).join(', ')}`
          });
        }
      }
    }
  }
}

const SceneGenerationSchema = SceneSchema.omit({ appearingLords: true, voiceSegments: true }).extend({
  appearingLords: z.array(z.string().min(1)).max(5)
});

/**
 * Schema sent to story LLMs (OpenAI `strict: true`).
 * Spoken hook stays a string for simpler LLM output; voiceSegments added in editorial pass.
 */
export const EpisodeGenerationSchema = EpisodeBaseObjectSchema.omit({
  spokenHook: true,
  spokenHookDurationSeconds: true,
  hookDelivery: true,
  featuredLords: true,
  hookVisualPrompt: true,
  voiceCast: true,
  characterVoiceMap: true,
  scenes: true
})
  .extend({
    spokenHook: z.string().min(8),
    spokenHookDurationSeconds: z.number().positive().max(20),
    hookDelivery: HookDeliverySchema,
    targetDurationSeconds: z.number().int().min(25).max(600),
    featuredLords: z.array(FeaturedLordSchema).min(1).max(8),
    scenes: z.array(SceneGenerationSchema).min(5).max(8)
  })
  .superRefine(refineEpisode);

/** Full episode on disk (may include narrationStyle / audioPlan / visualStyle after later stages). */
export const EpisodeSchema = EpisodeBaseObjectSchema.extend({
  /** Exact publishing copy by language; platform overrides shared. Never spoken. */
  publishingTitles: z.object({ hi: PublishingTitleSetSchema.optional(), en: PublishingTitleSetSchema.optional() }).optional(),
  /**
   * Voice direction for this chapter/episode.
   * TTS providers map mood/intensity/pace/emotion into API fields (pace, temperature, voice_settings).
   */
  narrationStyle: NarrationStyleSchema.optional(),
  /** Optional Sound Director plan (also saved under output/audio/<id>.audio-plan.json). */
  audioPlan: AudioPlanSchema.optional(),
  /**
   * Still-image brand: one EpicAstra Heritage frame family for the whole episode.
   * Strong vs thin border weight is chosen per scene at image-generation time.
   */
  visualStyle: VisualStyleSchema.optional(),
  /** Hook still vs motion. Picture plan only; image gen still uses hookVisualPrompt. */
  hookRenderMode: RenderModeSchema.optional(),
  hookElevenLabsText: z.string().min(1).optional(),
  hookVideoPrompt: z.string().min(1).optional(),
  hookVideoNegativePrompt: z.string().min(1).optional(),
  /** Author production notes (image reuse, motion beats). Not executed automatically. */
  productionPlan: z.unknown().optional()
}).superRefine(refineEpisode);

export type Episode = z.infer<typeof EpisodeSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export {
  VoiceCastSchema,
  VoiceSegmentSchema,
  SpokenHookSchema,
  CharacterVoiceMapSchema,
  defaultSarvamVoiceCast,
  spokenHookText
} from './voiceCast.js';
