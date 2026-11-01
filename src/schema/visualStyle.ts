import { z } from 'zod';
import {
  BORDER_STRATEGIES,
  EPICASTRA_LOOKS,
  HERITAGE_FRAME_VARIANTS
} from '../visual/epicastra-style.js';
import { TECH_EDITORIAL_BRAND } from '../visual/tech-editorial-style.js';

export const HeritageFrameVariantSchema = z.enum(HERITAGE_FRAME_VARIANTS);
export const EpicAstraLookSchema = z.enum(EPICASTRA_LOOKS);
export const BorderStrategySchema = z.enum(BORDER_STRATEGIES);

/**
 * Episode-level still-image brand direction.
 * - EPICASTRA_HERITAGE: mythology brand (frame + EpicAstra mark)
 * - TECH_EDITORIAL: clean tech diagrams, no heritage frame
 *
 * look (mythology only):
 * - CINEMATIC_DEVOTIONAL_3D (default): premium cinematic 3D; border post-processed
 * - CINEMATIC_GLOSS: Instagram-gloss painting with in-model border
 * - HERITAGE_PAINTERLY: older Pattachitra-inspired storybook look
 *
 * Scene JSON visualPrompt stays SCENE ACTION only (who / action / place).
 * Style + EpicAstra mark are applied by the pipeline for every scene.
 */
export const VisualStyleSchema = z
  .object({
    brand: z.enum(['EPICASTRA_HERITAGE', TECH_EDITORIAL_BRAND]).default('EPICASTRA_HERITAGE'),
    frameVariant: HeritageFrameVariantSchema.optional(),
    look: EpicAstraLookSchema.optional(),
    /** Keep THIN heritage border on every frame (EpicAstra only; default true when omitted). */
    lockThinBorder: z.boolean().optional(),
    /**
     * IN_MODEL = Gemini paints border/wordmark (gloss/painterly).
     * POST_PROCESS = borderless generate + sharp overlay (default for CINEMATIC_DEVOTIONAL_3D).
     * NONE = no brand chrome.
     */
    borderStrategy: BorderStrategySchema.optional()
  })
  .transform((value) => {
    if (value.brand === TECH_EDITORIAL_BRAND) {
      return {
        brand: TECH_EDITORIAL_BRAND,
        ...(value.lockThinBorder !== undefined ? { lockThinBorder: value.lockThinBorder } : {})
      };
    }
    const look = value.look ?? ('CINEMATIC_DEVOTIONAL_3D' as const);
    const borderStrategy =
      value.borderStrategy ??
      (look === 'CINEMATIC_DEVOTIONAL_3D'
        ? ('POST_PROCESS' as const)
        : ('IN_MODEL' as const));
    return {
      brand: 'EPICASTRA_HERITAGE' as const,
      frameVariant: value.frameVariant ?? ('HERITAGE_CLASSIC' as const),
      look,
      borderStrategy,
      ...(value.lockThinBorder !== undefined ? { lockThinBorder: value.lockThinBorder } : {})
    };
  });

export type VisualStyle = z.infer<typeof VisualStyleSchema>;
