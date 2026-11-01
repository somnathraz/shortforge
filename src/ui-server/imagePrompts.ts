import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { EpisodeSchema, type Episode } from '../schema/episode.js';
import {
  buildSceneImagePrompt,
  resolveHookVisualPrompt
} from '../lib/sceneImage.js';
import { resolveHeritageFrameWeight } from '../visual/epicastra-style.js';
import { resolveEpisodeVisualStyle } from '../visual/resolveVisualStyle.js';
import { isTechEditorialEpisode } from '../visual/tech-editorial-style.js';
import { resolveSpokenHook } from '../lib/ttsScript.js';
import { assertValidImagePrompt } from '../lib/validateImagePrompt.js';
import { episodesDir } from './paths.js';
import { loadReviewSelected } from '../lib/selectedAssets.js';
import { requiredImageIds } from '../lib/sceneVisualPlan.js';

export type ImagePromptItem = {
  id: 'hook' | number;
  label: string;
  kind: 'hook' | 'scene';
  visualPrompt: string;
  videoPrompt?: string;
  videoNegativePrompt?: string;
  renderMode?: 'STILL' | 'AI_VIDEO';
  finalPrompt: string;
  frameWeight: 'strong' | 'thin' | 'none';
  camera: string;
  appearingLords: string[];
};

export type ImagePromptsResponse = {
  episodeId: string;
  frameVariant: string;
  brand: string;
  look?: string;
  items: ImagePromptItem[];
};

const VisualPromptsPatchSchema = z.object({
  hookVisualPrompt: z.string().max(4000).optional(),
  scenes: z
    .array(
      z.object({
        id: z.number().int().positive(),
        visualPrompt: z.string().min(8).max(4000),
        videoPrompt: z.string().max(4000).optional(),
        videoNegativePrompt: z.string().max(4000).optional()
      })
    )
    .max(8)
});

async function readEpisodeFromFile(file: string): Promise<{ absolute: string; episode: Episode }> {
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    throw new Error('Invalid episode file');
  }
  const absolute = path.join(episodesDir(), file);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(absolute, 'utf8')) as unknown);
  return { absolute, episode };
}

function hookAppearingLords(episode: Episode): string[] {
  if (episode.hookAppearingLords?.length) return episode.hookAppearingLords;
  const primary = episode.featuredLords?.find((lord) => lord.importance === 'primary');
  return primary ? [primary.nameEn] : [];
}

export async function buildImagePromptsForEpisode(file: string): Promise<ImagePromptsResponse> {
  const { episode } = await readEpisodeFromFile(file);
  const visualStyle = resolveEpisodeVisualStyle(episode);
  const tech = isTechEditorialEpisode(episode);
  const items: ImagePromptItem[] = [];
  const selected = await loadReviewSelected(file);
  const ids = requiredImageIds(
    episode.scenes,
    Boolean(resolveSpokenHook(episode)),
    Boolean(episode.ending.payoffHi.trim()),
    selected?.sceneVisuals,
    selected?.clips,
    { hookTechVisual: episode.hookTechVisual }
  );

  if (ids.includes(0)) {
    const visualPrompt = resolveHookVisualPrompt(episode);
    const appearingLords = hookAppearingLords(episode);
    const camera = tech
      ? 'frontal vertical 9:16 diagram cold open'
      : 'low-angle medium close-up, vertical 9:16 cold open';
    const style = {
      episode,
      scene: {
        id: 0,
        importance: 8,
        appearingLords,
        ...(episode.hookCharacterStates ? { characterStates: episode.hookCharacterStates } : {})
      },
      scenes: episode.scenes,
      camera,
      ...(visualStyle.brand === 'EPICASTRA_HERITAGE'
        ? {
            frameVariant: visualStyle.frameVariant,
            frameWeight: 'thin' as const,
            look: visualStyle.look
          }
        : {}),
      strictAppearingLords: true
    };
    const finalPrompt = buildSceneImagePrompt(visualPrompt, style);
    assertValidImagePrompt({
      label: 'hook',
      finalPrompt,
      visualPrompt,
      brand: visualStyle.brand,
      ...(visualStyle.brand === 'EPICASTRA_HERITAGE' ? { look: visualStyle.look } : {}),
      appearingLords,
      featuredLords: episode.featuredLords,
      ...(episode.hookCharacterStates ? { characterStates: episode.hookCharacterStates } : {})
    });
    items.push({
      id: 'hook',
      label: 'Spoken hook',
      kind: 'hook',
      visualPrompt,
      finalPrompt,
      frameWeight: tech ? 'none' : 'thin',
      camera,
      appearingLords
    });
  }

  for (const scene of episode.scenes) {
    if (!ids.includes(scene.id)) continue;
    const frameWeight = tech
      ? ('none' as const)
      : resolveHeritageFrameWeight(scene, episode.scenes, episode);
    const style = {
      episode,
      scene,
      scenes: episode.scenes,
      camera: scene.camera,
      ...(visualStyle.brand === 'EPICASTRA_HERITAGE'
        ? {
            frameVariant: visualStyle.frameVariant,
            frameWeight: frameWeight === 'none' ? 'thin' : frameWeight,
            look: visualStyle.look
          }
        : {}),
      strictAppearingLords: true
    };
    const finalPrompt = buildSceneImagePrompt(scene.visualPrompt, style);
    assertValidImagePrompt({
      label: `scene ${scene.id}`,
      finalPrompt,
      visualPrompt: scene.visualPrompt,
      brand: visualStyle.brand,
      ...(visualStyle.brand === 'EPICASTRA_HERITAGE' ? { look: visualStyle.look } : {}),
      appearingLords: scene.appearingLords,
      featuredLords: episode.featuredLords,
      ...(scene.characterStates ? { characterStates: scene.characterStates } : {})
    });
    items.push({
      id: scene.id,
      label: `Scene ${scene.id}`,
      kind: 'scene',
      visualPrompt: scene.visualPrompt,
      ...(scene.videoPrompt ? { videoPrompt: scene.videoPrompt } : {}),
      ...(scene.videoNegativePrompt ? { videoNegativePrompt: scene.videoNegativePrompt } : {}),
      renderMode: scene.renderMode,
      finalPrompt,
      frameWeight,
      camera: scene.camera,
      appearingLords: scene.appearingLords || []
    });
  }

  return {
    episodeId: episode.id,
    brand: visualStyle.brand,
    frameVariant:
      visualStyle.brand === 'EPICASTRA_HERITAGE' ? visualStyle.frameVariant : visualStyle.brand,
    look: visualStyle.brand === 'EPICASTRA_HERITAGE' ? visualStyle.look : undefined,
    items
  };
}

export async function saveVisualPrompts(
  file: string,
  patch: unknown
): Promise<ImagePromptsResponse> {
  const body = VisualPromptsPatchSchema.parse(patch);
  const { absolute, episode } = await readEpisodeFromFile(file);

  const byId = new Map(body.scenes.map((scene) => [scene.id, scene]));
  if (body.scenes.some((item) => !episode.scenes.some((scene) => scene.id === item.id))) {
    throw new Error('Unknown scene in visual prompts');
  }

  const nextScenes = episode.scenes.map((scene) => {
    const patch = byId.get(scene.id);
    if (!patch) return scene;
    const next: typeof scene = {
      ...scene,
      visualPrompt: patch.visualPrompt.trim() || scene.visualPrompt
    };
    if (patch.videoPrompt !== undefined) {
      const trimmed = patch.videoPrompt.trim();
      if (trimmed) next.videoPrompt = trimmed;
      else delete next.videoPrompt;
    }
    if (patch.videoNegativePrompt !== undefined) {
      const trimmed = patch.videoNegativePrompt.trim();
      if (trimmed) next.videoNegativePrompt = trimmed;
      else delete next.videoNegativePrompt;
    }
    return next;
  });

  let next: Episode = { ...episode, scenes: nextScenes };
  if (body.hookVisualPrompt !== undefined) {
    const hook = body.hookVisualPrompt.trim();
    if (hook) {
      next = { ...next, hookVisualPrompt: hook };
    } else {
      const clone: Episode = { ...next };
      delete clone.hookVisualPrompt;
      next = clone;
    }
  }

  const parsed = EpisodeSchema.parse(next);
  await writeFile(absolute, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return buildImagePromptsForEpisode(file);
}
