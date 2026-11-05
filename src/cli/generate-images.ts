#!/usr/bin/env node
import '../lib/loadEnv.js';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import {
  hookImagePath,
  imagesRootDir,
  resolveHookVisualPrompt,
  sceneImagePath
} from '../lib/sceneImage.js';
import { generatePollinationsImage } from '../providers/pollinations.js';
import { generateGeminiImage } from '../providers/geminiImage.js';
import { resolveSceneImageReferences } from '../lib/imageReferences.js';
import {
  resolveBorderStrategy,
  resolveHeritageFrameWeight
} from '../visual/epicastra-style.js';
import { applyHeritageFrameOverlay } from '../visual/heritageFrameOverlay.js';
import { resolveEpisodeVisualStyle } from '../visual/resolveVisualStyle.js';
import { isTechEditorialEpisode } from '../visual/tech-editorial-style.js';
import { payoffIsSpoken, resolveSpokenHook } from '../lib/ttsScript.js';
import { loadReviewSelected } from '../lib/selectedAssets.js';
import { requiredImageIds } from '../lib/sceneVisualPlan.js';
const args = process.argv.slice(2);
export const IMAGE_PROVIDERS = ['pollinations', 'gemini'] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when output/images/<id>/ already has a still for this slot (AI or upload). */
async function hasExistingStill(episodeId: string, sceneId: number): Promise<boolean> {
  const dir = path.join(imagesRootDir(), episodeId);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return false;
  }
  const re =
    sceneId === 0
      ? /^scene-hook(\.|-)/i
      : new RegExp(`^scene-${sceneId}(\\.|-)`, 'i');
  return names.some((name) => re.test(name) && /\.(png|jpe?g|webp)$/i.test(name));
}

/** Parse `--scenes 1,2,3` or `hook` / `0` for the spoken-hook still. */
function parseSceneFilter(): { sceneIds?: number[]; includeHook?: boolean } | undefined {
  const raw = valueFor('--scenes') || valueFor('--scene');
  if (!raw?.trim()) return undefined;
  const parts = raw.split(/[,+\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  const includeHook = parts.some((part) => part === 'hook' || part === '0');
  const ids = parts
    .filter((part) => part !== 'hook' && part !== '0')
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!includeHook && !ids.length) throw new Error(`Invalid --scenes value: ${raw}`);
  return {
    ...(ids.length ? { sceneIds: [...new Set(ids)] } : {}),
    ...(includeHook ? { includeHook: true } : {})
  };
}

/** Append user revision notes so the model fixes issues without rewriting the whole scene. */
function withRevisionFeedback(
  visualPrompt: string,
  feedback: string | undefined,
  tech: boolean
): string {
  const note = feedback?.trim();
  if (!note) return visualPrompt;
  if (tech) {
    return [
      visualPrompt.trim(),
      '',
      'REVISION REQUEST — keep the same tech diagram structure and TECH_EDITORIAL look (no heritage frame).',
      'Still prefer empty regions for exact labels/code overlays. Fix only the problems below:',
      note
    ].join('\n');
  }
  return [
    visualPrompt.trim(),
    '',
    'REVISION REQUEST — keep the same scene, characters, setting, and EpicAstra Heritage Frame.',
    'Keep the same frame family and border language. Fix only the problems below; do not invent a different scene:',
    note
  ].join('\n');
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  if (!episodePath) {
    throw new Error(
      'Usage: npm run images -- --episode data/episodes/file.json [--provider pollinations|gemini] [--scenes 1,2,3] [--feedback "what to fix"]'
    );
  }

  const provider = (valueFor('--provider') || process.env.IMAGE_PROVIDER || 'pollinations') as ImageProvider;
  if (!IMAGE_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported image provider: ${provider}. Use ${IMAGE_PROVIDERS.join(' or ')}.`);
  }

  const feedback = valueFor('--feedback');
  const sceneFilter = parseSceneFilter();
  if (feedback?.trim() && !sceneFilter) {
    throw new Error('--feedback requires --scenes (or --scene) so only those images are revised');
  }

  const delayMs = Number(process.env.IMAGE_REQUEST_DELAY_MS || '1500');
  let episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const visualStyle = resolveEpisodeVisualStyle(episode);
  const tech = isTechEditorialEpisode(episode);
  if (
    !episode.visualStyle ||
    episode.visualStyle.brand !== visualStyle.brand ||
    (visualStyle.brand === 'EPICASTRA_HERITAGE' && episode.visualStyle.brand === 'EPICASTRA_HERITAGE' &&
      (episode.visualStyle.frameVariant !== visualStyle.frameVariant ||
        episode.visualStyle.look !== visualStyle.look))
  ) {
    episode = { ...episode, visualStyle };
    await writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
  }

  const generateAll = !sceneFilter;
  const selected = await loadReviewSelected(path.basename(episodePath));
  const imageIds = requiredImageIds(
    episode.scenes,
    Boolean(resolveSpokenHook(episode)),
    payoffIsSpoken(episode),
    selected?.sceneVisuals,
    selected?.clips,
    { hookTechVisual: episode.hookTechVisual }
  );
  let wantHook =
    imageIds.includes(0) && (generateAll || sceneFilter?.includeHook === true);
  let scenes = (sceneFilter?.sceneIds
    ? episode.scenes.filter((scene) => sceneFilter.sceneIds!.includes(scene.id))
    : generateAll
      ? episode.scenes
      : sceneFilter?.includeHook
        ? []
        : episode.scenes).filter((scene) => imageIds.includes(scene.id));

  if (sceneFilter?.sceneIds) {
    const missing = sceneFilter.sceneIds.filter((id) => !episode.scenes.some((scene) => scene.id === id));
    if (missing.length) {
      throw new Error(`Unknown scene id(s): ${missing.join(', ')}`);
    }
  }

  // Full generate: only fill empty slots. Explicit --scenes / Regenerate always re-runs.
  if (generateAll) {
    const skipped: string[] = [];
    if (wantHook && (await hasExistingStill(episode.id, 0))) {
      wantHook = false;
      skipped.push('hook');
    }
    const keep: typeof scenes = [];
    for (const scene of scenes) {
      if (await hasExistingStill(episode.id, scene.id)) {
        skipped.push(String(scene.id));
      } else {
        keep.push(scene);
      }
    }
    scenes = keep;
    if (skipped.length) {
      console.log(
        `Skipping ${skipped.length} slot(s) that already have a still: ${skipped.join(', ')}`
      );
    }
  }

  if (!wantHook && !scenes.length) {
    console.log(
      generateAll
        ? 'All required stills already exist — nothing to generate. Use Regenerate on a card to replace one.'
        : 'No images needed for the selected visual plan. Uploaded clips are kept.'
    );
    return;
  }

  const ext = provider === 'gemini' ? 'png' : 'jpg';
  const stamp = Date.now();
  const labels = [
    ...(wantHook ? ['hook'] : []),
    ...scenes.map((scene) => String(scene.id))
  ];
  console.log(
    sceneFilter
      ? `Regenerating ${labels.length} image(s) [${labels.join(',')}] for ${episode.id} (${provider})${feedback?.trim() ? ' with feedback' : ''}`
      : `Generating ${labels.length} missing image(s) [${labels.join(',')}] for ${episode.id} (${provider})`
  );
  if (tech) {
    console.log('Tech Editorial: clean 9:16 diagrams (no heritage frame; labels/code prefer Remotion overlays)');
  } else if (visualStyle.brand === 'EPICASTRA_HERITAGE') {
    console.log(
      `EpicAstra ${visualStyle.look}: ${visualStyle.frameVariant} · border ${visualStyle.borderStrategy}`
    );
  }

  let generated = 0;
  const total = (wantHook ? 1 : 0) + scenes.length;

  if (wantHook) {
    const canonical = hookImagePath(episode.id, ext);
    await mkdir(path.dirname(canonical), { recursive: true });
    const versioned = path.join(path.dirname(canonical), `scene-hook-${stamp}.${ext}`);
    const appearingLords =
      episode.hookAppearingLords?.length
        ? episode.hookAppearingLords
        : episode.featuredLords?.find((l) => l.importance === 'primary')
          ? [episode.featuredLords.find((l) => l.importance === 'primary')!.nameEn]
          : [];
    const borderStrategy =
      visualStyle.brand === 'EPICASTRA_HERITAGE'
        ? resolveBorderStrategy(visualStyle.look, visualStyle.borderStrategy)
        : 'NONE';
    const style = {
      episode,
      scene: {
        id: 0,
        importance: 8,
        appearingLords,
        ...(episode.hookCharacterStates ? { characterStates: episode.hookCharacterStates } : {})
      },
      scenes: episode.scenes,
      camera: tech
        ? 'frontal vertical 9:16 diagram cold open'
        : 'low-angle medium close-up, vertical 9:16 cold open',
      ...(visualStyle.brand === 'EPICASTRA_HERITAGE'
        ? {
            frameVariant: visualStyle.frameVariant,
            frameWeight: 'thin' as const,
            look: visualStyle.look,
            borderStrategy
          }
        : {}),
      strictAppearingLords: true
    };
    const visualPrompt = withRevisionFeedback(resolveHookVisualPrompt(episode), feedback, tech);
    const refs = tech
      ? { referenceImagePaths: [] as string[], referenceImageRoles: [] as string[], hasReferences: false }
      : await resolveSceneImageReferences({
          visualPrompt,
          episodeId: episode.id,
          sceneId: 'hook',
          skipContinuity: true
        });
    let destination =
      provider === 'gemini'
        ? await generateGeminiImage({
            visualPrompt,
            outputPath: versioned,
            style,
            ...(refs.referenceImagePaths.length
              ? { referenceImagePaths: refs.referenceImagePaths, referenceImageRoles: refs.referenceImageRoles }
              : {})
          })
        : await generatePollinationsImage({
            visualPrompt,
            outputPath: versioned,
            seed: Number(`${Date.now()}`.slice(-6)),
            style
          });
    if (!tech && borderStrategy === 'POST_PROCESS') {
      destination = await applyHeritageFrameOverlay(destination);
    }
    await copyFile(destination, canonical);
    const meta = {
      provider,
      costTier: provider === 'pollinations' ? 'free' : 'paid',
      generatedAt: new Date().toISOString(),
      sceneId: 'hook',
      regenerated: Boolean(sceneFilter),
      feedback: feedback?.trim() || undefined,
      canonical: path.basename(canonical),
      visualStyle,
      borderStrategy,
      referenceImagePaths: refs.referenceImagePaths.map((file) => path.basename(file)),
      ...(tech ? {} : { frameWeight: 'thin' })
    };
    await writeFile(`${destination}.source.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    await writeFile(`${canonical}.source.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    console.log(
      tech
        ? `Spoken hook: ${destination} → ${canonical} [tech editorial]`
        : `Spoken hook: ${destination} → ${canonical} [${borderStrategy}${refs.hasReferences ? ` · ${refs.referenceImagePaths.length} refs` : ''}]`
    );
    generated += 1;
    if (generated < total && delayMs > 0) await sleep(delayMs);
  }

  for (const [index, scene] of scenes.entries()) {
    const canonical = sceneImagePath(episode.id, scene.id, ext);
    await mkdir(path.dirname(canonical), { recursive: true });
    // Versioned file keeps prior takes as candidates; canonical path stays produce-compatible.
    const versioned = path.join(
      path.dirname(canonical),
      `scene-${scene.id}-${stamp}-${index}.${ext}`
    );

    const frameWeight = tech
      ? undefined
      : resolveHeritageFrameWeight(scene, episode.scenes, episode);
    const borderStrategy =
      visualStyle.brand === 'EPICASTRA_HERITAGE'
        ? resolveBorderStrategy(visualStyle.look, visualStyle.borderStrategy)
        : 'NONE';
    const style = {
      episode,
      scene,
      scenes: episode.scenes,
      camera: scene.camera,
      ...(visualStyle.brand === 'EPICASTRA_HERITAGE'
        ? {
            frameVariant: visualStyle.frameVariant,
            frameWeight,
            look: visualStyle.look,
            borderStrategy
          }
        : {}),
      strictAppearingLords: true
    };

    const visualPrompt = withRevisionFeedback(scene.visualPrompt, feedback, tech);
    const refs = tech
      ? { referenceImagePaths: [] as string[], referenceImageRoles: [] as string[], hasReferences: false }
      : await resolveSceneImageReferences({
          visualPrompt,
          episodeId: episode.id,
          sceneId: scene.id
        });
    let destination =
      provider === 'gemini'
        ? await generateGeminiImage({
            visualPrompt,
            outputPath: versioned,
            style,
            ...(refs.referenceImagePaths.length
              ? { referenceImagePaths: refs.referenceImagePaths, referenceImageRoles: refs.referenceImageRoles }
              : {})
          })
        : await generatePollinationsImage({
            visualPrompt,
            outputPath: versioned,
            seed: Number(`${Date.now()}`.slice(-6)) + scene.id,
            style
          });
    if (!tech && borderStrategy === 'POST_PROCESS') {
      destination = await applyHeritageFrameOverlay(destination);
    }

    await copyFile(destination, canonical);
    const meta = {
      provider,
      costTier: provider === 'pollinations' ? 'free' : 'paid',
      generatedAt: new Date().toISOString(),
      sceneId: scene.id,
      regenerated: Boolean(sceneFilter),
      feedback: feedback?.trim() || undefined,
      canonical: path.basename(canonical),
      visualStyle,
      borderStrategy,
      referenceImagePaths: refs.referenceImagePaths.map((file) => path.basename(file)),
      ...(frameWeight ? { frameWeight } : {})
    };
    await writeFile(`${destination}.source.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    await writeFile(`${canonical}.source.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    console.log(
      tech
        ? `Scene ${scene.id}: ${destination} → ${canonical} [tech editorial]`
        : `Scene ${scene.id}: ${destination} → ${canonical} [${frameWeight} frame]`
    );
    generated += 1;
    if (generated < total && delayMs > 0) await sleep(delayMs);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
