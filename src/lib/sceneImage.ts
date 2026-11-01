import path from 'node:path';
import { enrichVisualPrompt } from './characters.js';
import {
  buildEpicAstraImagePrompt,
  EPICASTRA_HERITAGE_NEGATIVE,
  EPICASTRA_HERITAGE_PREFIX,
  resolveBorderStrategy,
  resolveEpicAstraLook,
  resolveEpicAstraNegative,
  resolveHeritageFrameWeight,
  resolveHeritageVariant,
  type BorderStrategy,
  type EpicAstraEpisodeLike,
  type EpicAstraLook,
  type EpicAstraSceneLike,
  type HeritageFrameVariant,
  type HeritageFrameWeight
} from '../visual/epicastra-style.js';
import {
  buildTechEditorialImagePrompt,
  isTechEditorialEpisode,
  TECH_EDITORIAL_NEGATIVE
} from '../visual/tech-editorial-style.js';

/** @deprecated Prefer EPICASTRA_HERITAGE_PREFIX — kept for older imports. */
export const IMAGE_STYLE_SUFFIX = EPICASTRA_HERITAGE_PREFIX;

/** Pollinations / shared negative — EpicAstra heritage anti-text + quality locks. */
export const IMAGE_NEGATIVE_PROMPT = EPICASTRA_HERITAGE_NEGATIVE;

/** Brand-aware negative for image providers. */
export function resolveImageNegativePrompt(episode?: {
  brandId?: string | undefined;
  storyKind?: string | undefined;
  visualStyle?: { brand?: string | undefined; look?: EpicAstraLook | undefined } | undefined;
}): string {
  if (isTechEditorialEpisode(episode)) return TECH_EDITORIAL_NEGATIVE;
  return resolveEpicAstraNegative(episode?.visualStyle?.look);
}

export type FeaturedLordLike = {
  nameEn: string;
  nameHi?: string | undefined;
  importance: 'primary' | 'supporting' | string;
  visualIdentity: string;
  doNotConfuseWith: string;
  states?: Record<string, string> | undefined;
};

export type BuildSceneImagePromptOptions = {
  camera?: string | undefined;
  frameVariant?: HeritageFrameVariant | undefined;
  frameWeight?: HeritageFrameWeight | undefined;
  look?: EpicAstraLook | undefined;
  borderStrategy?: BorderStrategy | undefined;
  /** When true, prepend REFERENCE IMAGE INSTRUCTIONS (Gemini multi-image). */
  includeReferenceInstructions?: boolean | undefined;
  scene?:
    | (EpicAstraSceneLike & {
        appearingLords?: string[] | undefined;
        characterStates?: Record<string, string> | undefined;
        narrationHi?: string | undefined;
        visualPrompt?: string | undefined;
      })
    | undefined;
  scenes?: EpicAstraSceneLike[] | undefined;
  episode?:
    | (EpicAstraEpisodeLike & {
        brandId?: string | undefined;
        storyKind?: string | undefined;
        featuredLords?: FeaturedLordLike[] | undefined;
        visualStyle?:
          | {
              brand?: string | undefined;
              look?: EpicAstraLook | undefined;
              borderStrategy?: BorderStrategy | undefined;
            }
          | undefined;
      })
    | undefined;
  /** @deprecated Prefer episode.featuredLords from the script. */
  episodeContext?: string | undefined;
  /**
   * When true (default for modern scripts), only inject locks for scene.appearingLords.
   * Empty appearingLords ⇒ no character lock. No fallback to all primaries.
   */
  strictAppearingLords?: boolean | undefined;
};

function identityForLord(
  lord: FeaturedLordLike,
  stateKey?: string
): string {
  if (stateKey && lord.states?.[stateKey]?.trim()) {
    return lord.states[stateKey]!.trim();
  }
  return lord.visualIdentity.trim();
}

/**
 * Build image locks from featuredLords.
 *
 * Strict mode (default when appearingLords is defined on the scene):
 *   inject ONLY those lords (and their characterStates). Empty ⇒ no lock.
 * Legacy mode (appearingLords undefined): name-match in prompt, then primaries.
 */
export function characterLockFromFeaturedLords(
  visualPrompt: string,
  episode?: { featuredLords?: FeaturedLordLike[] | undefined },
  scene?: {
    appearingLords?: string[] | undefined;
    characterStates?: Record<string, string> | undefined;
    narrationHi?: string | undefined;
  },
  options?: { strictAppearingLords?: boolean }
): string {
  const lords = episode?.featuredLords || [];
  if (!lords.length) return '';

  const byName = new Map(lords.map((lord) => [lord.nameEn.trim().toLowerCase(), lord]));
  const states = scene?.characterStates || {};
  const strict =
    options?.strictAppearingLords !== false && scene?.appearingLords !== undefined;

  let selected: FeaturedLordLike[] = [];

  if (strict) {
    selected = (scene?.appearingLords || [])
      .map((name) => byName.get(name.trim().toLowerCase()))
      .filter((lord): lord is FeaturedLordLike => Boolean(lord));
  } else if (scene?.appearingLords?.length) {
    selected = scene.appearingLords
      .map((name) => byName.get(name.trim().toLowerCase()))
      .filter((lord): lord is FeaturedLordLike => Boolean(lord));
  } else {
    const sceneText = [visualPrompt, scene?.narrationHi].filter(Boolean).join('\n');
    selected = lords.filter((lord) => {
      const hay = sceneText.toLowerCase();
      const names = [lord.nameEn, lord.nameHi].filter(Boolean).map((n) => n!.toLowerCase());
      return names.some((name) => name && hay.includes(name));
    });
    if (!selected.length) {
      selected = lords.filter((lord) => lord.importance === 'primary').slice(0, 2);
    }
  }

  return selected
    .map((lord) => {
      const stateKey =
        states[lord.nameEn] ||
        Object.entries(states).find(
          ([key]) => key.trim().toLowerCase() === lord.nameEn.trim().toLowerCase()
        )?.[1];
      const identity = identityForLord(lord, stateKey);
      const confuse = lord.doNotConfuseWith.trim();
      const stateNote = stateKey ? ` [state:${stateKey}]` : '';
      return `${lord.nameEn}${stateNote}: ${identity}. Do not confuse with: ${confuse}`;
    })
    .join(' | ');
}

/** Lightweight fallback when older episodes lack featuredLords. */
export function characterLockForPrompt(visualPrompt: string, episodeContext = ''): string {
  const text = `${visualPrompt}\n${episodeContext}`.toLowerCase();
  const locks: string[] = [];
  if (/\bhanuman\b|हनुमान|\bvanara\b/.test(text)) {
    locks.push(
      'Lord Hanuman as a divine vanara: monkey face, visible monkey tail, orange-saffron dhoti, golden ornaments'
    );
  }
  if (/\bjagannath\b|जगन्नाथ/.test(text)) {
    locks.push(
      'Lord Jagannath of Puri as wooden daru murti with large round eyes and incomplete arms — never Krishna with flute'
    );
  }
  if (/\bsage\b|\brishi\b|ऋषि/.test(visualPrompt.toLowerCase())) {
    locks.push('elderly Indian rishis with matted hair and beards, calm faces, traditional ashram robes');
  }
  return locks.join('; ');
}

export function episodeImageContext(episode?: EpicAstraEpisodeLike & {
  topic?: string | undefined;
  titleHi?: string | undefined;
  titleEn?: string | undefined;
  keywords?: string[] | undefined;
  metadata?: { keywords?: string[] | undefined } | undefined;
  featuredLords?: FeaturedLordLike[] | undefined;
}): string {
  if (!episode) return '';
  const keywords = episode.keywords || episode.metadata?.keywords || [];
  const lords = (episode.featuredLords || []).flatMap((lord) => [lord.nameEn, lord.nameHi || '']);
  return [episode.topic, episode.titleHi, episode.titleEn, ...keywords, ...lords].filter(Boolean).join(' ');
}

/**
 * Assemble the final still prompt:
 * [STYLE] + [CHARACTER LOCK] + [SCENE ACTION] + [CAMERA] + [CONSISTENCY] + [NEGATIVE]
 */
export function buildSceneImagePrompt(
  visualPrompt: string,
  options: BuildSceneImagePromptOptions = {}
): string {
  const cleaned = visualPrompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) throw new Error('visualPrompt cannot be empty');

  const variant =
    options.frameVariant ??
    (options.episode ? resolveHeritageVariant(options.episode) : undefined);

  let frameWeight = options.frameWeight;
  if (!frameWeight && options.scene && options.scenes?.length) {
    frameWeight = resolveHeritageFrameWeight(options.scene, options.scenes, options.episode);
  }

  const fromScript = characterLockFromFeaturedLords(
    cleaned,
    options.episode,
    options.scene,
    options.strictAppearingLords === undefined
      ? undefined
      : { strictAppearingLords: options.strictAppearingLords }
  );
  const context = options.episodeContext || episodeImageContext(options.episode);
  // Only use heuristic fallback when there is no featuredLords registry at all.
  const fallback =
    options.episode?.featuredLords?.length ? '' : characterLockForPrompt(cleaned, context);
  const characterLock = [fromScript, fallback].filter(Boolean).join(' | ');

  if (isTechEditorialEpisode(options.episode)) {
    return buildTechEditorialImagePrompt({
      sceneDescription: cleaned,
      ...(options.camera ? { camera: options.camera } : {}),
      ...(characterLock ? { subjectLock: characterLock } : {})
    });
  }

  const look =
    options.look ||
    resolveEpicAstraLook(options.episode?.visualStyle?.look);
  const borderStrategy = resolveBorderStrategy(
    look,
    options.borderStrategy || options.episode?.visualStyle?.borderStrategy
  );

  return buildEpicAstraImagePrompt({
    sceneDescription: cleaned,
    ...(options.camera ? { camera: options.camera } : {}),
    characterLock,
    look,
    borderStrategy,
    ...(options.includeReferenceInstructions ? { includeReferenceInstructions: true } : {}),
    ...(variant ? { variant } : {}),
    ...(frameWeight ? { frameWeight } : {})
  });
}

/** Async variant: also inject characters/<id>/profile.json locks when names match. */
export async function buildSceneImagePromptAsync(
  visualPrompt: string,
  options: BuildSceneImagePromptOptions = {}
): Promise<string> {
  // Script identities (including state overrides) are authoritative. Legacy profiles
  // must not reintroduce absent characters or overwrite a child's/adult's state.
  if (options.episode?.featuredLords?.length) return buildSceneImagePrompt(visualPrompt, options);
  const context = options.episodeContext || '';
  const { prompt } = await enrichVisualPrompt(visualPrompt, context);
  return buildSceneImagePrompt(prompt, options);
}

export function imagesRootDir(): string {
  return path.resolve(process.env.IMAGES_DIR || 'output/images');
}

export function imageDimensions(): { width: number; height: number } {
  const width = Number(process.env.IMAGE_WIDTH || '1080');
  const height = Number(process.env.IMAGE_HEIGHT || '1920');
  if (!Number.isFinite(width) || width <= 0) throw new Error('IMAGE_WIDTH must be positive');
  if (!Number.isFinite(height) || height <= 0) throw new Error('IMAGE_HEIGHT must be positive');
  return { width, height };
}

export function sceneImagePath(episodeId: string, sceneId: number, extension = 'png'): string {
  return path.join(imagesRootDir(), episodeId, `scene-${sceneId}.${extension}`);
}

/** Dedicated still for spokenHook window (t=0), separate from scene 1. */
export function hookImagePath(episodeId: string, extension = 'png'): string {
  return path.join(imagesRootDir(), episodeId, `scene-hook.${extension}`);
}

type HookEpisodeLike = {
  brandId?: string | undefined;
  storyKind?: string | undefined;
  visualStyle?: { brand?: string | undefined } | undefined;
  spokenHook?: string | { textHi?: string } | undefined;
  hookHi?: string | undefined;
  titleEn?: string | undefined;
  featuredLords?: FeaturedLordLike[] | undefined;
  hookAppearingLords?: string[] | undefined;
  hookCharacterStates?: Record<string, string> | undefined;
  scenes?:
    | Array<{
        visualPrompt?: string | undefined;
        appearingLords?: string[] | undefined;
        camera?: string | undefined;
      }>
    | undefined;
};

function hookSpokenText(episode: HookEpisodeLike): string {
  const raw = episode.spokenHook;
  return (
    (typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw.textHi : '') ||
    episode.hookHi ||
    ''
  ).trim();
}

function hookPrimarySubject(episode: HookEpisodeLike): {
  subject: string;
  primary?: FeaturedLordLike;
} {
  const primary =
    episode.featuredLords?.find((lord) => lord.importance === 'primary') || episode.featuredLords?.[0];
  const hookLords = episode.hookAppearingLords?.length
    ? episode.hookAppearingLords
    : primary
      ? [primary.nameEn]
      : [];
  const subject =
    hookLords.join(' and ') || primary?.nameEn || 'the featured figure from this story';
  return primary ? { subject, primary } : { subject };
}

/**
 * Tech Reels hook still — diagram cold open, not mythology faces / heritage.
 */
export function buildTechHookVisualPrompt(episode: HookEpisodeLike): string {
  const hook = hookSpokenText(episode);
  const { subject, primary } = hookPrimarySubject(episode);
  const identity = primary?.visualIdentity
    ? `Keep the diagram motif for ${primary.nameEn}: ${primary.visualIdentity}.`
    : 'Keep a single clean tech diagram motif.';

  return [
    `SPOKEN HOOK opening still for a vertical tech education Short. Do not paint any text from the narration.`,
    `Show ${subject} as the clear dominant diagram subject in a mystery cold open.`,
    identity,
    `One dominant diagram, frontal or slight 3/4 vertical 9:16 composition, high contrast, one subtle background clue.`,
    `Do not reveal the full lesson. Do not duplicate scene 1's full diagram.`,
    `Leave clear empty regions for Remotion overlays of exact labels, Big-O, indexes, or code — do not bake precise notation into the image.`,
    hook ? `Mood inspired by the spoken hook (never paint the words): ${hook}` : '',
    `No faces, no mythology, no heritage frame, no caption, no logo, no EpicAstra wordmark.`
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Visual prompt for the spoken-hook still — curiosity cold-open, not a title card.
 * Independent of scene 1: do not copy scene-1 action or dump all episode characters.
 */
export function buildHookVisualPrompt(episode: HookEpisodeLike): string {
  if (isTechEditorialEpisode(episode)) return buildTechHookVisualPrompt(episode);

  const hook = hookSpokenText(episode);
  const { subject, primary } = hookPrimarySubject(episode);
  const identity = primary?.visualIdentity
    ? `Keep exact iconography for ${primary.nameEn}: ${primary.visualIdentity}.`
    : 'Keep correct traditional iconography — never swap in a different character.';

  return [
    `SPOKEN HOOK opening still for a vertical mythology Short. Do not paint any text from the narration.`,
    `Show ${subject} as the clear dominant visual subject in a mystery cold open.`,
    identity,
    `One dominant subject, close or medium-close composition, strong facial emotion, one subtle background clue.`,
    `Do not reveal the entire story. Do not duplicate scene 1's full action.`,
    hook ? `Mood inspired by the spoken hook (never paint the words): ${hook}` : '',
    `Strong readable faces, warm cinematic light, single main focus, no violence, no gore, no caption, no logo.`
  ]
    .filter(Boolean)
    .join(' ');
}

export function resolveHookVisualPrompt(
  episode: HookEpisodeLike & { hookVisualPrompt?: string | undefined }
): string {
  const override = episode.hookVisualPrompt?.replace(/\s+/g, ' ').trim();
  if (override) {
    // Stored overrides from mythology templates must not leak into tech episodes.
    if (
      isTechEditorialEpisode(episode) &&
      /\bmythology Short\b|\bstrong facial emotion\b|\bwarm cinematic light\b/i.test(override)
    ) {
      return buildTechHookVisualPrompt(episode);
    }
    return override;
  }
  return buildHookVisualPrompt(episode);
}
