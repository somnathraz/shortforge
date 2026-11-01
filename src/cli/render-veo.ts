#!/usr/bin/env node
/**
 * Path B — full Veo 3 Short (separate from FFmpeg Path A).
 * Uses Gemini stills as reference / first-frame images per scene.
 * Output: output/veo/<episodeId>/
 */
import '../lib/loadEnv.js';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import { assembleEpisodeFromClips } from '../providers/ffmpegRender.js';
import { generateVeoClip, veoClipsDir, veoEpisodeDir } from '../providers/veo.js';

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

async function findImage(imagesDir: string, sceneId: number): Promise<string> {
  for (const name of [`scene-${sceneId}.png`, `scene-${sceneId}.jpg`, `scene-${sceneId}.jpeg`]) {
    const full = path.join(imagesDir, name);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  throw new Error(`Missing reference still for scene ${sceneId} in ${imagesDir}`);
}

async function resolveAudio(episodeId: string, explicit?: string): Promise<string> {
  if (explicit) {
    await access(explicit);
    return path.resolve(explicit);
  }
  const audioDir = path.resolve(process.env.TTS_OUTPUT_DIR || 'output/audio');
  const candidates = [
    path.join(audioDir, `${episodeId}.mp3`),
    path.join(audioDir, 'hanuman-forgot-powers.mp3'),
    path.join(audioDir, 'hanuman-forgot-powers-edge.mp3')
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error(`Audio not found. Pass --audio path.mp3`);
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  if (!episodePath) {
    throw new Error(
      [
        'Path B (Veo 3 only) — separate from npm run render (FFmpeg).',
        'Usage: npm run render:veo -- --episode data/episodes/file.json [--audio out.mp3]',
        '       [--scene 4] [--mode image|refs] [--extra-refs a.png,b.png] [--skip-generate]'
      ].join('\n')
    );
  }

  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const imagesDir = path.join(imagesRootDir(), episode.id);
  const clipsDir = veoClipsDir(episode.id);
  const episodeOutDir = veoEpisodeDir(episode.id);
  const audioPath = await resolveAudio(episode.id, valueFor('--audio'));
  const mode = (valueFor('--mode') || 'image') as 'image' | 'refs';
  if (!['image', 'refs'].includes(mode)) throw new Error('--mode must be image or refs');

  const extraRefs = (valueFor('--extra-refs') || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));

  for (const ref of extraRefs) await access(ref);

  const sceneFilter = valueFor('--scene') ? Number(valueFor('--scene')) : undefined;
  const skipGenerate = args.includes('--skip-generate');
  const stamp = stampNow();
  const targets = episode.scenes.filter((scene) => (sceneFilter ? scene.id === sceneFilter : true));

  console.log(`Path B — Veo 3 Short for ${episode.id}`);
  console.log(`Model: ${process.env.VEO_MODEL || 'veo-3.1-generate-preview'}`);
  console.log(`Mode: ${mode === 'refs' ? 'referenceImages (asset refs)' : 'image-to-video (first frame)'}`);
  console.log(`Stills (refs): ${imagesDir}`);
  console.log(`Clips out: ${clipsDir}`);
  console.log(`Final out: ${episodeOutDir}/`);

  const clipByScene = new Map<number, string>();

  if (!skipGenerate) {
    for (const scene of targets) {
      const still = await findImage(imagesDir, scene.id);
      const fileName = `scene-${scene.id}-veo-${stamp}.mp4`;
      const outputPath = path.join(clipsDir, fileName);

      if (mode === 'refs') {
        const referenceImagePaths = [still, ...extraRefs].slice(0, 3);
        console.log(
          `Scene ${scene.id}: Veo refs → ${referenceImagePaths.map((p) => path.basename(p)).join(', ')} → ${fileName}`
        );
        await generateVeoClip({
          prompt: `${scene.visualPrompt}. Camera: ${scene.camera}. Cinematic motion, mythology Short, keep character consistent with reference images.`,
          outputPath,
          referenceImagePaths,
          durationSeconds: Math.min(8, scene.durationSeconds)
        });
      } else {
        console.log(`Scene ${scene.id}: Veo first-frame ${path.basename(still)} → ${fileName}`);
        await generateVeoClip({
          prompt: `${scene.visualPrompt}. Camera: ${scene.camera}. Cinematic motion, mythology Short.`,
          outputPath,
          imagePath: still,
          durationSeconds: Math.min(8, scene.durationSeconds)
        });
      }
      clipByScene.set(scene.id, outputPath);
      console.log(`Created: ${outputPath}`);
    }
  }

  // Full Short only when generating/assembling every scene
  if (sceneFilter) {
    console.log('Single-scene Veo clip done. Run without --scene to assemble the full Short.');
    return;
  }

  // Collect one clip per scene (this run's clips, or newest existing)
  const assembledClips: string[] = [];
  for (const scene of episode.scenes) {
    const fromRun = clipByScene.get(scene.id);
    if (fromRun) {
      assembledClips.push(fromRun);
      continue;
    }
    let entries: string[] = [];
    try {
      entries = await readdir(clipsDir);
    } catch {
      throw new Error(`No Veo clips in ${clipsDir}. Run without --skip-generate first.`);
    }
    const matches = entries
      .filter((name) => name.startsWith(`scene-${scene.id}-veo`) && name.endsWith('.mp4'))
      .map((name) => path.join(clipsDir, name));
    if (!matches.length) {
      throw new Error(`Missing Veo clip for scene ${scene.id} in ${clipsDir}`);
    }
    const ranked = await Promise.all(
      matches.map(async (full) => ({ full, mtimeMs: (await stat(full)).mtimeMs }))
    );
    ranked.sort((a, b) => b.mtimeMs - a.mtimeMs);
    assembledClips.push(ranked[0]!.full);
  }

  const outputPath = path.resolve(
    valueFor('--output') || path.join(episodeOutDir, `${episode.id}-veo-${stamp}.mp4`)
  );
  console.log('Assembling Veo clips + audio…');
  const destination = await assembleEpisodeFromClips({
    episode,
    audioPath,
    outputPath,
    clipPaths: assembledClips,
    burnSubtitles: !args.includes('--no-subs')
  });
  console.log(`Created Veo Short: ${destination}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
