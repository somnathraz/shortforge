/**
 * Tech Reels (tech-instagram) still-image brand — clean 9:16 editorial diagrams.
 * No EpicAstra heritage border / wordmark.
 *
 * Exact labels, Big-O notation, array indexes, and code should preferably be
 * composited later (React/Remotion), not baked into the generative still.
 */
import { isTechBrand } from '../lib/brands.js';

export const TECH_EDITORIAL_BRAND = 'TECH_EDITORIAL' as const;

export const TECH_EDITORIAL_GLOBAL_STYLE = [
  'Tech Editorial vertical 9:16 education still',
  'dark IDE / systems-design aesthetic',
  'flat diagram shapes, crisp geometry, high contrast',
  'subtle grid or soft glow accents only',
  'no ornate borders, no manuscript frames, no mythology'
].join(', ');

/** Shared negative for Pollinations / prompt [NEGATIVE] block. */
export const TECH_EDITORIAL_NEGATIVE = [
  'heritage frame',
  'antique gold border',
  'lotus peacock motifs',
  'EpicAstra wordmark',
  'mythology',
  'deities',
  'people faces',
  'photoreal portraits',
  'warped text',
  'gibberish labels',
  'corrupted code',
  'wrong Big O notation',
  'malformed superscripts',
  'incorrect array indexes',
  'unreadable UI chrome',
  'cluttered dashboard',
  'watermark',
  'logo'
].join(', ');

export const TECH_EDITORIAL_CONSISTENCY_LOCK = [
  'Keep diagram shapes and layout readable for later text overlays',
  'Leave clear empty regions where exact labels or code will be composited',
  'Do not invent fake brand logos'
].join('. ');

/**
 * Guidance appended into [SCENE ACTION] assembly notes for authors / LLMs.
 * The still should show structure; Remotion owns precise glyphs.
 */
export const TECH_VISUAL_PROMPT_OVERLAY_RULE = [
  'Describe what the diagram must contain (shapes, arrows, regions, hierarchy)',
  'Do NOT ask the image model to paint precise O-notation, array indexes, code, equations, or long English labels',
  'Prefer unlabeled or lightly marked shapes with empty space for React/Remotion overlays',
  'Never use EpicAstra heritage frames or mythology props'
].join('. ');

export function stripTechStyleBleedFromScenePrompt(sceneDescription: string): string {
  return sceneDescription
    .replace(/\bEpicAstra[^.]*?(border|frame|wordmark|Heritage)[^.]*?[.!]?/gi, '')
    .replace(/\b(STRONG|THIN)\s+heritage\s+frame\b[^.]*?[.!]?/gi, '')
    .replace(/\bheritage\s+(classic|light|dramatic|border|frame)\b[^.]*?[.!]?/gi, '')
    .replace(/\bwith\s+lotus(?:\s+and\s+peacock)?\s+motifs\b/gi, '')
    .replace(/\blotus(?:\s+and\s+peacock)?\s+motifs\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
    .trim();
}

export function buildTechEditorialImagePrompt(input: {
  sceneDescription: string;
  camera?: string;
  subjectLock?: string;
}): string {
  const scene = stripTechStyleBleedFromScenePrompt(input.sceneDescription);
  if (!scene) throw new Error('sceneDescription cannot be empty');

  const camera = input.camera?.replace(/\s+/g, ' ').trim();
  const subjectLock = input.subjectLock?.trim() || '';

  const parts = [
    `[STYLE] ${TECH_EDITORIAL_GLOBAL_STYLE}. No heritage frame. No channel wordmark.`,
    subjectLock ? `[SUBJECT LOCK] ${subjectLock}.` : '',
    `[SCENE ACTION] ${scene}. Prefer structure over baked-in text: leave clear empty areas for exact labels, Big-O, indexes, and code overlays.`,
    camera ? `[CAMERA] ${camera}.` : '',
    `[CONSISTENCY] ${TECH_EDITORIAL_CONSISTENCY_LOCK}`,
    `[NEGATIVE] Avoid: ${TECH_EDITORIAL_NEGATIVE}`
  ];

  return parts.filter(Boolean).join(' ');
}

export function visualStyleForTechEpisode(): { brand: typeof TECH_EDITORIAL_BRAND } {
  return { brand: TECH_EDITORIAL_BRAND };
}

export function isTechEditorialEpisode(episode?: {
  brandId?: string | undefined;
  storyKind?: string | undefined;
  visualStyle?: { brand?: string | undefined } | undefined;
}): boolean {
  if (!episode) return false;
  if (episode.visualStyle?.brand === TECH_EDITORIAL_BRAND) return true;
  if (isTechBrand(episode.brandId)) return true;
  if (episode.storyKind === 'TECH_EDUCATION') return true;
  return false;
}
