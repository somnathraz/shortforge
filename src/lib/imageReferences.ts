/**
 * Collect Gemini reference images for EpicAstra stills:
 * 1) master style ref  2) character masters  3) previous-scene continuity
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { enrichVisualPrompt } from './characters.js';
import { imagesRootDir, sceneImagePath } from './sceneImage.js';

async function exists(filePath: string | undefined): Promise<string | undefined> {
  if (!filePath?.trim()) return undefined;
  const resolved = path.resolve(filePath.trim());
  try {
    await access(resolved);
    return resolved;
  } catch {
    return undefined;
  }
}

export type SceneImageReferences = {
  referenceImagePaths: string[];
  referenceImageRoles: string[];
  /** True when at least one reference will be sent. */
  hasReferences: boolean;
  styleRef?: string;
  characterRefs: string[];
  continuityRef?: string;
};

/**
 * Build ordered reference list (max 4 for clear role labels in the prompt).
 * Override via EPICASTRA_STYLE_REFERENCE_IMAGE / EPICASTRA_CHARACTER_REFERENCE_IMAGE.
 */
export async function resolveSceneImageReferences(input: {
  visualPrompt: string;
  episodeId: string;
  sceneId?: number | 'hook';
  episodeContext?: string;
  /** Skip previous-scene continuity (e.g. demos). */
  skipContinuity?: boolean;
}): Promise<SceneImageReferences> {
  const styleRef =
    (await exists(process.env.EPICASTRA_STYLE_REFERENCE_IMAGE)) ||
    (await exists(process.env.EPICASTRA_MASTER_STYLE_IMAGE));

  const envCharacter = await exists(process.env.EPICASTRA_CHARACTER_REFERENCE_IMAGE);
  const { masterImagePaths } = await enrichVisualPrompt(
    input.visualPrompt,
    input.episodeContext || ''
  );
  const characterRefs = [
    ...(envCharacter ? [envCharacter] : []),
    ...masterImagePaths
  ].filter((file, index, all) => all.indexOf(file) === index);

  let continuityRef: string | undefined;
  if (!input.skipContinuity && typeof input.sceneId === 'number' && input.sceneId > 1) {
    const prevPng = sceneImagePath(input.episodeId, input.sceneId - 1, 'png');
    const prevJpg = sceneImagePath(input.episodeId, input.sceneId - 1, 'jpg');
    continuityRef = (await exists(prevPng)) || (await exists(prevJpg));
  }

  // Prefer a dedicated style pack under output/images/_style when env unset.
  const packStyle =
    styleRef ||
    (await exists(path.join(imagesRootDir(), '_style', 'master-style.png'))) ||
    (await exists(path.join(imagesRootDir(), '_style', 'master-style.jpg')));

  const detailStyle = await exists(path.join(imagesRootDir(), '_style', 'detail-style.png'));
  const ordered = [
    { file: packStyle, role: 'MASTER STYLE REFERENCE' },
    { file: detailStyle, role: 'MASTER STYLE REFERENCE' },
    { file: characterRefs[0], role: 'CHARACTER IDENTITY REFERENCE' },
    { file: continuityRef || characterRefs[1], role: continuityRef ? 'SCENE CONTINUITY REFERENCE' : 'CHARACTER IDENTITY REFERENCE' }
  ].filter((item): item is { file: string; role: string } => Boolean(item.file));
  const unique = ordered.filter((item, index, all) => all.findIndex(other => other.file === item.file) === index).slice(0, 4);

  return {
    referenceImagePaths: unique.map(item => item.file),
    referenceImageRoles: unique.map(item => item.role),
    hasReferences: unique.length > 0,
    ...(packStyle ? { styleRef: packStyle } : {}),
    characterRefs,
    ...(continuityRef ? { continuityRef } : {})
  };
}
