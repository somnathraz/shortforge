#!/usr/bin/env node
/**
 * Generate individual Veo 3 clips (Path B). Does not touch FFmpeg Shorts.
 * Prefer: npm run render:veo for a full episode.
 */
import '../lib/loadEnv.js';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import { generateVeoClip, veoClipsDir } from '../providers/veo.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function stampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function findImage(imagesDir: string, sceneId: number): Promise<string | undefined> {
  for (const name of [`scene-${sceneId}.png`, `scene-${sceneId}.jpg`, `scene-${sceneId}.jpeg`]) {
    const full = path.join(imagesDir, name);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  if (!episodePath) {
    throw new Error(
      'Usage: npm run veo -- --episode data/episodes/file.json [--scene 4] [--mode image|refs] [--extra-refs a.png,b.png]'
    );
  }

  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const imagesDir = path.join(imagesRootDir(), episode.id);
  const clipsDir = veoClipsDir(episode.id);
  const sceneFilter = valueFor('--scene') ? Number(valueFor('--scene')) : undefined;
  const allAi = args.includes('--all-ai');
  const textOnly = args.includes('--text-only');
  const mode = (valueFor('--mode') || 'image') as 'image' | 'refs';
  const stamp = stampNow();

  const extraRefs = (valueFor('--extra-refs') || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
  for (const ref of extraRefs) await access(ref);

  const targets = episode.scenes.filter((scene) => {
    if (sceneFilter) return scene.id === sceneFilter;
    if (allAi) return true;
    return scene.renderMode === 'AI_VIDEO';
  });

  if (!targets.length) {
    throw new Error('No matching scenes. Use --scene N, mark scenes AI_VIDEO, or pass --all-ai.');
  }

  console.log(`Path B — Veo clip(s) for ${episode.id} → ${clipsDir}`);
  console.log('(FFmpeg Shorts stay under output/video/ via npm run render)');

  for (const scene of targets) {
    const fileName = `scene-${scene.id}-veo-${stamp}.mp4`;
    const outputPath = path.join(clipsDir, fileName);
    const still = textOnly ? undefined : await findImage(imagesDir, scene.id);

    if (mode === 'refs') {
      if (!still && !extraRefs.length) throw new Error(`Scene ${scene.id}: need still or --extra-refs for refs mode`);
      const referenceImagePaths = [...(still ? [still] : []), ...extraRefs].slice(0, 3);
      console.log(`Scene ${scene.id}: refs ${referenceImagePaths.map((p) => path.basename(p)).join(', ')} → ${fileName}`);
      await generateVeoClip({
        prompt: `${scene.visualPrompt}. Camera: ${scene.camera}. Cinematic motion, mythology Short, keep character consistent with reference images.`,
        outputPath,
        referenceImagePaths,
        durationSeconds: Math.min(8, scene.durationSeconds)
      });
    } else {
      console.log(
        `Scene ${scene.id}: ${still ? `first-frame ${path.basename(still)}` : 'text-to-video'} → ${fileName}`
      );
      await generateVeoClip({
        prompt: `${scene.visualPrompt}. Camera: ${scene.camera}. Cinematic motion, mythology Short.`,
        outputPath,
        ...(still ? { imagePath: still } : {}),
        durationSeconds: Math.min(8, scene.durationSeconds)
      });
    }
    console.log(`Created: ${outputPath}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
