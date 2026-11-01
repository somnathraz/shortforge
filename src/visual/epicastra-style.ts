/**
 * Structured EpicAstra still prompts: STYLE + CHARACTER LOCK + SCENE ACTION.
 * Scene JSON should describe action/composition only; this module owns brand/frame/look.
 *
 * Looks:
 * - CINEMATIC_GLOSS / HERITAGE_PAINTERLY: model paints thin heritage border + EpicAstra mark
 * - CINEMATIC_DEVOTIONAL_3D: borderless cinematic 3D; border/wordmark via post-process
 */
import type { FeaturedLordLike } from '../lib/sceneImage.js';

export const HERITAGE_FRAME_VARIANTS = [
  'HERITAGE_LIGHT',
  'HERITAGE_CLASSIC',
  'HERITAGE_DRAMATIC'
] as const;

export type HeritageFrameVariant = (typeof HERITAGE_FRAME_VARIANTS)[number];
export type HeritageFrameWeight = 'strong' | 'thin';

/** Instagram-gloss / painterly (in-model frame) vs premium cinematic 3D (post-process frame). */
export const EPICASTRA_LOOKS = [
  'CINEMATIC_GLOSS',
  'HERITAGE_PAINTERLY',
  'CINEMATIC_DEVOTIONAL_3D'
] as const;
export type EpicAstraLook = (typeof EPICASTRA_LOOKS)[number];

/** How the antique-gold frame + EpicAstra mark are applied. */
export const BORDER_STRATEGIES = ['IN_MODEL', 'POST_PROCESS', 'NONE'] as const;
export type BorderStrategy = (typeof BORDER_STRATEGIES)[number];

export const DEFAULT_HERITAGE_VARIANT: HeritageFrameVariant = 'HERITAGE_CLASSIC';
/** Episode-wide default: one thin border family; climax via lighting/pose, not thicker frames. */
export const DEFAULT_HERITAGE_WEIGHT: HeritageFrameWeight = 'thin';
/** Preferred for new episodes; older scripts may still pin CINEMATIC_GLOSS. */
export const DEFAULT_EPICASTRA_LOOK: EpicAstraLook = 'CINEMATIC_DEVOTIONAL_3D';

/** Tiny EpicAstra mark inside the top ornamental border — only for IN_MODEL looks. */
export const EPICASTRA_CHANNEL_WORDMARK =
  'CHANNEL WORDMARK ONLY: paint the single English word EpicAstra as a tiny elegant channel name inside the TOP ornamental border band, centered horizontally, small carved antique-gold Roman letters matching the border metalwork, never larger than the lotus motifs, never inside the central story scene';

/**
 * Shared brand frame — for looks that paint the border in-model.
 * Scene architecture/location/clothing stay in JSON visualPrompt (SCENE ACTION).
 */
const EPICASTRA_FRAME_BASE = [
  'thin consistent antique-gold and carved-brown heritage border with subtle lotus and peacock motifs',
  'central artwork dominates approximately 85–90% of the frame',
  EPICASTRA_CHANNEL_WORDMARK,
  'no other text, captions, titles, Hindi/Sanskrit/Odia letters, logos, or watermarks inside the scene',
  'no modern objects',
  'no anime',
  'no Western angel wings',
  'no graphic gore'
].join('. ');

/** Legacy Instagram-myth gloss (from reference-match experiments). */
export const EPICASTRA_CINEMATIC_GLOSS_STYLE = [
  'EpicAstra Cinematic Gloss',
  'vertical 9:16 Indian mythology digital painting for myth reels',
  'glossy modern mythological illustration with extreme jewelry filigree and silk fabric weave',
  'photoreal sacred water mist and foam when water appears',
  'warm ethereal god-light as key light, rich saturated golds blues and yellows',
  'razor-sharp readable faces, deep cinematic depth',
  'no plastic doll skin, no game-engine plastic sheen on faces',
  EPICASTRA_FRAME_BASE
].join('. ');

/** Legacy painterly storybook look (opt-in via visualStyle.look). */
export const EPICASTRA_HERITAGE_PAINTERLY_STYLE = [
  'EpicAstra Heritage Classic',
  'vertical 9:16 Indian epic illustration',
  'detailed painterly realism with restrained Odisha Pattachitra-inspired ornamentation',
  'warm natural Indian color palette',
  'strong readable faces',
  'cinematic depth',
  'traditional handcrafted texture',
  'no plastic 3D CGI',
  'no Western fantasy styling',
  EPICASTRA_FRAME_BASE
].join('. ');

/**
 * Premium cinematic 3D look — matches high-budget Indian myth animated-feature stills.
 * Intentionally omits painted border/wordmark (post-process owns brand chrome).
 */
export const EPICASTRA_CINEMATIC_DEVOTIONAL_3D_STYLE = [
  'EpicAstra Premium Cinematic Devotional 3D',
  'vertical 9:16 frame from a high-budget Indian mythological animated feature film',
  'VISUAL RENDERING: premium stylized photorealistic 3D animation',
  'beautiful sculpted human faces with natural Indian features',
  'realistic skin subsurface scattering, fine skin microtexture, expressive eyes with natural reflections, individual hair strands',
  'intricate embossed gold jewelry with individually resolved gemstones, pearl strands and crown metalwork; luminous silk with woven gold embroidery and realistic fabric folds',
  'the character must look like a beautifully rendered living person, not a painting, wax statue, doll, game avatar or photograph',
  'LIGHTING: soft cinematic global illumination and realistic bounced light',
  'warm ivory-gold key lighting on the face, gentle peach-pink rim light',
  'atmospheric volumetric sunlight through clouds and architecture when present',
  'soft contact shadows and delicate highlights on jewelry, natural depth of field, avoid flat illumination',
  'ENVIRONMENT: richly layered ancient Indian temple architecture, carved sandstone, sacred flowers, natural foliage, distant atmospheric mountains and delicate floating mist only where appropriate to the scene',
  'realistic flowing water with subtle reflections when water is present',
  'detailed foreground, clear subject, softly receding background',
  'COLOR GRADING: luminous ivory-white and rich radiant gold, sapphire blue, saffron yellow and lotus pink; preserve clean white silk, jewel colours and detailed highlights',
  'allow the scene location and mood to determine the palette; use vibrant jewel colours without a uniform orange cast, grey wash or muted beige haze',
  'CELESTIAL SCENES ONLY: when the story takes place in a divine realm, show towering gilded Indian palace terraces receding through luminous white clouds, distant waterfalls and sunlit atmospheric depth; keep earthly forests, hermitages and battlefields faithful to their actual setting',
  'STAGING: one dominant narrative action with readable face and hands, strong scale relationships and a clear visual path through the vertical frame; use a closer portrait for intimate prop interactions and a wider view for cosmic events',
  'ICONOGRAPHY: preserve the exact number of heads and arms specified for each deity; intentional divine anatomy is not an anatomical error; separate each hand and its assigned attribute clearly',
  'COMPOSITION: story-first cinematic staging, not devotional poster design',
  'clearly readable main character and decisive story action',
  'natural three-dimensional perspective with foreground, midground and background separation',
  'avoid clutter around faces and hands',
  'FINAL QUALITY: polished feature-animation frame, believable cloth hair skin metal and water, stable facial anatomy, emotionally reverent elegant immersive and cinematic',
  'No text or decorative border generated into the illustration'
].join('. ');

/** @deprecated Prefer look-aware resolveEpicAstraGlobalStyle — defaults to cinematic 3D. */
export const EPICASTRA_GLOBAL_STYLE = EPICASTRA_CINEMATIC_DEVOTIONAL_3D_STYLE;

/** @deprecated Prefer EPICASTRA_GLOBAL_STYLE — kept for older imports/tests. */
export const EPICASTRA_HERITAGE_PREFIX = `EpicAstra Heritage Frame. ${EPICASTRA_CINEMATIC_GLOSS_STYLE}`;

const VARIANT_FRAME: Record<HeritageFrameVariant, string> = {
  HERITAGE_LIGHT:
    'Heritage Light: lighter parchment and soft antique-gold border, airier lotus/peacock motifs',
  HERITAGE_CLASSIC:
    'Heritage Classic: balanced carved brown and antique-gold border, thin ornamental storytelling frame',
  HERITAGE_DRAMATIC:
    'Heritage Dramatic: deeper carved brown and gold border, richer shadow while the central scene stays readable'
};

const FRAME_WEIGHT: Record<HeritageFrameWeight, string> = {
  strong:
    'STRONG heritage frame: ornate full border; central artwork still ~75–80% of the canvas',
  thin: 'THIN heritage frame: same ornament language, lighter/narrower so the cinematic scene dominates ~85–90%'
};

export function resolveEpicAstraLook(look?: string | null): EpicAstraLook {
  if (look && (EPICASTRA_LOOKS as readonly string[]).includes(look)) {
    return look as EpicAstraLook;
  }
  return DEFAULT_EPICASTRA_LOOK;
}

export function paintsBorderInModel(look?: string | null): boolean {
  const resolved = resolveEpicAstraLook(look);
  return resolved === 'CINEMATIC_GLOSS' || resolved === 'HERITAGE_PAINTERLY';
}

export function defaultBorderStrategy(look?: string | null): BorderStrategy {
  return paintsBorderInModel(look) ? 'IN_MODEL' : 'POST_PROCESS';
}

export function resolveBorderStrategy(
  look?: string | null,
  override?: BorderStrategy | null
): BorderStrategy {
  if (override && (BORDER_STRATEGIES as readonly string[]).includes(override)) {
    return override;
  }
  return defaultBorderStrategy(look);
}

export function resolveEpicAstraGlobalStyle(look?: string | null): string {
  const resolved = resolveEpicAstraLook(look);
  if (resolved === 'HERITAGE_PAINTERLY') return EPICASTRA_HERITAGE_PAINTERLY_STYLE;
  if (resolved === 'CINEMATIC_GLOSS') return EPICASTRA_CINEMATIC_GLOSS_STYLE;
  return EPICASTRA_CINEMATIC_DEVOTIONAL_3D_STYLE;
}

export function resolveEpicAstraConsistencyLock(look?: string | null): string {
  const resolved = resolveEpicAstraLook(look);
  if (resolved === 'HERITAGE_PAINTERLY') {
    return 'Important: maintain the same character faces, clothing identity, color palette, and thin border style across all scenes so the sequence feels like one coherent mythology storybook reel.';
  }
  if (resolved === 'CINEMATIC_GLOSS') {
    return 'Important: maintain the same character faces, clothing identity, jewelry detail level, color palette, glossy lighting language, and thin EpicAstra border across all scenes so the reel feels like one coherent cinematic mythology series.';
  }
  return 'Important: maintain the same character faces, clothing identity, jewelry materials, color grading language, soft volumetric lighting, and cinematic 3D rendering quality across all scenes so the reel feels like one coherent premium animated mythology film. Keep the image clean and suitable for subsequent I2V animation.';
}

export const EPICASTRA_CONSISTENCY_LOCK = resolveEpicAstraConsistencyLock(DEFAULT_EPICASTRA_LOOK);

/** Shared avoid list for in-model framed looks (gloss / painterly). */
export const EPICASTRA_HERITAGE_NEGATIVE = [
  'text inside the central story scene',
  'captions',
  'titles',
  'story text',
  'Hindi letters',
  'Sanskrit letters',
  'Odia letters',
  'Roman story text',
  'extra logos besides the tiny EpicAstra top-border wordmark',
  'watermarks other than EpicAstra',
  'UI overlays',
  'blurry faces',
  'unrequested limbs or heads beyond the specified divine iconography',
  'duplicated characters',
  'distorted hands',
  'western heaven clouds with wings',
  'gore',
  'graphic violence',
  'photoreal selfie look',
  'anime',
  'plastic doll skin',
  'modern objects'
].join(', ');

/** Avoid list for CINEMATIC_DEVOTIONAL_3D (counters painting / poster / doll looks). */
export const EPICASTRA_CINEMATIC_3D_NEGATIVE = [
  'flat digital painting',
  '2D illustration',
  'watercolor',
  'oil painting',
  'comic book art',
  'poster design',
  'ornate decorative border',
  'painted frame',
  'channel wordmark',
  'low-poly game render',
  'cheap CGI',
  'plastic doll skin',
  'wax figure',
  'overly smooth faces',
  'artificial skin shine',
  'oversaturated orange lighting',
  'excessive gold bloom',
  'extreme contrast',
  'cluttered ornamentation',
  'distorted hands',
  'extra fingers',
  'unrequested limbs or heads beyond the specified divine iconography',
  'duplicate characters',
  'inconsistent facial identity',
  'floating jewelry',
  'fused clothing',
  'artificial hair',
  'unrealistic water',
  'malformed architecture',
  'Western fantasy armor',
  'Western angel wings',
  'modern objects',
  'gore',
  'horror',
  'text',
  'captions',
  'random symbols',
  'watermark',
  'logos'
].join(', ');

export function resolveEpicAstraNegative(look?: string | null): string {
  return paintsBorderInModel(look) ? EPICASTRA_HERITAGE_NEGATIVE : EPICASTRA_CINEMATIC_3D_NEGATIVE;
}

/** Strip repeated style/border language from LLM scene prompts before composing. */
export function stripStyleBleedFromScenePrompt(sceneDescription: string): string {
  return sceneDescription
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bEpicAstra[^.]*?(border|frame|illustration|style|wordmark|Heritage|Cinematic Gloss|Devotional 3D)[^.]*?[.!]?/gi, '')
    .replace(/\b(Odisha\s+)?Pattachitra[^.]*?(border|motif|inspired)[^.]*?[.!]?/gi, '')
    .replace(/\b(vertical\s+)?9\s*[:x]\s*16\b[^.]*?[.!]?/gi, '')
    .replace(
      /\b(antique\s+gold|terracotta|sandalwood|warm\s+lamp[^.]*palette|CHANNEL WORDMARK|cinematic gloss|jewelry filigree|god-light|subsurface scattering)[^.]*?[.!]?/gi,
      ''
    )
    .replace(/\bno\s+text\b[^.]*?[.!]?/gi, '')
    .replace(/\bsacred Indian architecture\b[^.]*?[.!]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
    .trim();
}

export type EpicAstraEpisodeLike = {
  topic?: string | undefined;
  titleEn?: string | undefined;
  titleHi?: string | undefined;
  visualStyle?:
    | {
        frameVariant?: HeritageFrameVariant | undefined;
        look?: EpicAstraLook | undefined;
        lockThinBorder?: boolean | undefined;
        borderStrategy?: BorderStrategy | undefined;
      }
    | undefined;
};

export type EpicAstraSceneLike = {
  id: number;
  importance: number;
};

export function inferHeritageVariant(episode: EpicAstraEpisodeLike): HeritageFrameVariant {
  if (episode.visualStyle?.frameVariant) return episode.visualStyle.frameVariant;
  const text = `${episode.topic || ''} ${episode.titleEn || ''} ${episode.titleHi || ''}`.toLowerCase();
  if (
    /\b(child|childhood|naamkaran|birth|festival|gaushala|बाल|जन्म|त्योहार|गौशाला)\b/.test(text)
  ) {
    return 'HERITAGE_LIGHT';
  }
  // Prefer CLASSIC for epic/war stories — DRAMATIC only when explicitly set on the episode.
  if (/\b(rakshas|demon|horror|राक्षस)\b/.test(text)) {
    return 'HERITAGE_DRAMATIC';
  }
  return 'HERITAGE_CLASSIC';
}

/**
 * Prefer one thin border for the whole episode.
 * Climax should come from lighting / pose / framing, not a thicker frame mid-run.
 */
export function resolveHeritageFrameWeight(
  _scene: EpicAstraSceneLike,
  _ordered: EpicAstraSceneLike[],
  episode?: EpicAstraEpisodeLike
): HeritageFrameWeight {
  if (episode?.visualStyle?.lockThinBorder === false) {
    return 'thin';
  }
  return DEFAULT_HERITAGE_WEIGHT;
}

export function resolveHeritageVariant(
  episode: EpicAstraEpisodeLike,
  override?: HeritageFrameVariant
): HeritageFrameVariant {
  if (override) return override;
  return inferHeritageVariant(episode);
}

/** Optional block when Gemini receives style/character/continuity reference images. */
export const EPICASTRA_REFERENCE_IMAGE_INSTRUCTIONS = [
  'REFERENCE IMAGE INSTRUCTIONS:',
  'Use the role label attached to each reference, never infer its role from image order.',
  'MASTER STYLE REFERENCE: match luminous lighting, rich gold and jewel colours, detailed silk and jewellery, facial realism and environmental depth.',
  'CHARACTER IDENTITY REFERENCE: preserve identity only for characters explicitly present in the scene; written character state and iconography take priority.',
  'SCENE CONTINUITY REFERENCE: reuse only relevant details when the written scene remains in the same location; do not carry characters, props or scenery into a new setting.',
  'Create the NEW story action described below.',
  'Do not copy the pose, setting or identity of the style reference unless the current scene specifically requires them.',
  'Do not render the supplied screenshots, screen borders, player UI, captions or watermark into the generated image.'
].join(' ');

export function buildEpicAstraImagePrompt(input: {
  sceneDescription: string;
  camera?: string;
  characterLock?: string;
  variant?: HeritageFrameVariant;
  frameWeight?: HeritageFrameWeight;
  look?: EpicAstraLook | string;
  borderStrategy?: BorderStrategy;
  includeReferenceInstructions?: boolean;
}): string {
  const scene = stripStyleBleedFromScenePrompt(input.sceneDescription);
  if (!scene) throw new Error('sceneDescription cannot be empty');

  const look = resolveEpicAstraLook(input.look);
  const borderStrategy = resolveBorderStrategy(look, input.borderStrategy);
  const inModelFrame = borderStrategy === 'IN_MODEL' && paintsBorderInModel(look);
  const variant = input.variant ?? DEFAULT_HERITAGE_VARIANT;
  const weight = input.frameWeight ?? DEFAULT_HERITAGE_WEIGHT;
  const camera = input.camera?.replace(/\s+/g, ' ').trim();
  const characterLock = input.characterLock?.trim() || '';

  const styleParts = [resolveEpicAstraGlobalStyle(look)];
  if (inModelFrame) {
    styleParts.push(VARIANT_FRAME[variant], FRAME_WEIGHT[weight]);
  } else if (borderStrategy === 'POST_PROCESS') {
    styleParts.push(
      'Generate a full-bleed borderless 9:16 cinematic still; brand frame and EpicAstra wordmark are added later in post — do not paint any border or logo'
    );
  }

  const parts = [
    `[STYLE] ${styleParts.join('. ')}.`,
    input.includeReferenceInstructions ? EPICASTRA_REFERENCE_IMAGE_INSTRUCTIONS : '',
    characterLock ? `[CHARACTER LOCK] ${characterLock}.` : '',
    `[SCENE ACTION] ${scene}.`,
    camera ? `[CAMERA] ${camera}.` : '',
    `[CONSISTENCY] ${resolveEpicAstraConsistencyLock(look)}`,
    `[NEGATIVE] Avoid: ${resolveEpicAstraNegative(look)}`
  ];

  return parts.filter(Boolean).join(' ');
}

export function visualStyleForEpisode(
  episode: EpicAstraEpisodeLike,
  override?: HeritageFrameVariant
): {
  brand: 'EPICASTRA_HERITAGE';
  frameVariant: HeritageFrameVariant;
  look: EpicAstraLook;
  borderStrategy: BorderStrategy;
} {
  const look = resolveEpicAstraLook(episode.visualStyle?.look);
  return {
    brand: 'EPICASTRA_HERITAGE',
    frameVariant: resolveHeritageVariant(episode, override),
    look,
    borderStrategy: resolveBorderStrategy(look, episode.visualStyle?.borderStrategy)
  };
}

/** @deprecated FeaturedLordLike lives in sceneImage — re-export type for older imports. */
export type { FeaturedLordLike };
