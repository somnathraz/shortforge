#!/usr/bin/env node
/**
 * Generate one EpicAstra Heritage Frame preview still (thin — matches production).
 * Defaults to free Pollinations so frame checks do not burn Gemini credits.
 *
 * Usage:
 *   npm run images:demo -- --episode data/episodes/file.json [--variant HERITAGE_CLASSIC]
 *   npm run images:demo -- --episode data/episodes/file.json --provider gemini   # paid opt-in
 *   npm run images:demo -- --episode … --provider gemini --prompt "SCENE ACTION…" --name reference-match
 */
import '../lib/loadEnv.js';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import { generatePollinationsImage } from '../providers/pollinations.js';
import { generateGeminiImage } from '../providers/geminiImage.js';
import {
  EPICASTRA_LOOKS,
  HERITAGE_FRAME_VARIANTS,
  resolveBorderStrategy,
  resolveEpicAstraLook,
  resolveHeritageVariant,
  visualStyleForEpisode,
  type EpicAstraLook,
  type HeritageFrameVariant,
  type HeritageFrameWeight
} from '../visual/epicastra-style.js';
import { applyHeritageFrameOverlay } from '../visual/heritageFrameOverlay.js';
import { resolveSceneImageReferences } from '../lib/imageReferences.js';

const args = process.argv.slice(2);
const IMAGE_PROVIDERS = ['pollinations', 'gemini'] as const;
type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

/** Production locks every scene to thin — demo must match (never generate strong). */
const DEMO_WEIGHT: HeritageFrameWeight = 'thin';

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function demoPath(
  episodeId: string,
  weight: HeritageFrameWeight,
  ext: string,
  name?: string
): string {
  const stem = name?.trim()
    ? `demo-${name.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')}`
    : `demo-heritage-${weight}`;
  return path.join(imagesRootDir(), episodeId, `${stem}.${ext}`);
}

function pickDemoScene(episode: ReturnType<typeof EpisodeSchema.parse>) {
  const ordered = [...episode.scenes].sort((a, b) => b.importance - a.importance);
  return ordered[0] || episode.scenes[0];
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  if (!episodePath) {
    throw new Error(
      'Usage: npm run images:demo -- --episode data/episodes/file.json [--provider pollinations|gemini] [--variant HERITAGE_LIGHT|HERITAGE_CLASSIC|HERITAGE_DRAMATIC] [--prompt "…"] [--name reference-match]'
    );
  }
  const promptOverride = valueFor('--prompt')?.trim();
  const demoName = valueFor('--name')?.trim();

  // Explicit --provider only. Do NOT inherit IMAGE_PROVIDER=gemini — demos must stay free by default.
  const providerArg = valueFor('--provider')?.trim().toLowerCase();
  const provider = (providerArg || 'pollinations') as ImageProvider;
  if (!IMAGE_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported image provider: ${provider}`);
  }
  if (provider === 'gemini') {
    console.warn('Warning: heritage demo uses paid Gemini. Prefer pollinations for free previews.');
  }

  const variantArg = valueFor('--variant')?.trim().toUpperCase();
  if (variantArg && !(HERITAGE_FRAME_VARIANTS as readonly string[]).includes(variantArg)) {
    throw new Error(
      `Invalid --variant ${variantArg}. Use ${HERITAGE_FRAME_VARIANTS.join(' | ')}`
    );
  }
  const variantOverride = variantArg as HeritageFrameVariant | undefined;
  const lookArg = valueFor('--look')?.trim().toUpperCase();
  if (lookArg && !(EPICASTRA_LOOKS as readonly string[]).includes(lookArg)) {
    throw new Error(`Invalid --look ${lookArg}. Use ${EPICASTRA_LOOKS.join(' | ')}`);
  }
  const lookOverride = lookArg as EpicAstraLook | undefined;

  let episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const visualStyle = {
    ...visualStyleForEpisode(episode, variantOverride),
    ...(lookOverride ? { look: resolveEpicAstraLook(lookOverride) } : {})
  };
  visualStyle.borderStrategy = resolveBorderStrategy(
    visualStyle.look,
    (episode.visualStyle?.brand === 'EPICASTRA_HERITAGE' ? episode.visualStyle.borderStrategy : undefined)
  );
  episode = { ...episode, visualStyle };
  await writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');

  const scene = pickDemoScene(episode);
  if (!scene) throw new Error('Episode has no scenes to demo');
  const visualPrompt = promptOverride || scene.visualPrompt;

  const ext = provider === 'gemini' ? 'png' : 'jpg';
  const stamp = Date.now();
  const frameVariant = resolveHeritageVariant(episode);
  const borderStrategy = visualStyle.borderStrategy;
  console.log(`Heritage demo for ${episode.id} (1 image · ${DEMO_WEIGHT} · matches production)`);
  console.log(`Look: ${visualStyle.look} · frame ${frameVariant} · border ${borderStrategy}`);
  console.log(
    promptOverride
      ? `Prompt: custom override (${visualPrompt.slice(0, 80)}…)`
      : `Sample scene: #${scene.id} (importance ${scene.importance})`
  );
  console.log(`Provider: ${provider}${provider === 'pollinations' ? ' (free)' : ' (paid)'}`);
  console.log(`Model: ${process.env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image'}`);

  const outputPath = demoPath(episode.id, DEMO_WEIGHT, ext, demoName);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const versionedStem = path.basename(outputPath, path.extname(outputPath));
  const versioned = path.join(path.dirname(outputPath), `${versionedStem}-${stamp}.${ext}`);

  const style = {
    episode,
    scene,
    scenes: episode.scenes,
    camera: scene.camera,
    frameVariant,
    frameWeight: DEMO_WEIGHT,
    look: visualStyle.look,
    borderStrategy
  };

  const refs = await resolveSceneImageReferences({
    visualPrompt,
    episodeId: episode.id,
    sceneId: scene.id,
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

  if (borderStrategy === 'POST_PROCESS') {
    destination = await applyHeritageFrameOverlay(destination);
  }

  await copyFile(destination, outputPath);

  const meta = {
    kind: promptOverride ? 'reference-match-demo' : 'heritage-demo',
    provider,
    costTier: provider === 'pollinations' ? 'free' : 'paid',
    generatedAt: new Date().toISOString(),
    sceneId: scene.id,
    visualPrompt,
    model: process.env.GOOGLE_IMAGE_MODEL || null,
    visualStyle,
    borderStrategy,
    referenceImagePaths: refs.referenceImagePaths,
    frameWeight: DEMO_WEIGHT,
    canonical: path.basename(outputPath)
  };
  await writeFile(`${destination}.source.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await writeFile(`${outputPath}.source.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  console.log(`Demo ${visualStyle.look}: ${outputPath}`);
  console.log('Done — one preview. Generate all images only when the look is right.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
