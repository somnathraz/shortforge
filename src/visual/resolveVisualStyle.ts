import {
  visualStyleForEpisode,
  type BorderStrategy,
  type EpicAstraLook,
  type HeritageFrameVariant
} from './epicastra-style.js';
import {
  isTechEditorialEpisode,
  visualStyleForTechEpisode,
  type TECH_EDITORIAL_BRAND
} from './tech-editorial-style.js';

export type EpisodeVisualStyle =
  | {
      brand: 'EPICASTRA_HERITAGE';
      frameVariant: HeritageFrameVariant;
      look: EpicAstraLook;
      borderStrategy: BorderStrategy;
    }
  | { brand: typeof TECH_EDITORIAL_BRAND };

export function resolveEpisodeVisualStyle(
  episode: {
    brandId?: string | undefined;
    storyKind?: string | undefined;
    topic?: string | undefined;
    titleEn?: string | undefined;
    titleHi?: string | undefined;
    visualStyle?:
      | {
          brand?: string | undefined;
          frameVariant?: HeritageFrameVariant | undefined;
          look?: EpicAstraLook | undefined;
          lockThinBorder?: boolean | undefined;
          borderStrategy?: BorderStrategy | undefined;
        }
      | undefined;
  },
  heritageOverride?: HeritageFrameVariant
): EpisodeVisualStyle {
  if (isTechEditorialEpisode(episode)) {
    return visualStyleForTechEpisode();
  }
  return visualStyleForEpisode(episode, heritageOverride);
}
