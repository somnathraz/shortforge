#!/usr/bin/env node
/**
 * Path B — AI video / animate (pluggable).
 * Providers: veo | wan
 * Separate from Path A FFmpeg motion (`npm run render`).
 *
 * Output: output/ai-video/<episodeId>/
 */
import '../lib/loadEnv.js';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import { loadReviewSelected, resolveOutputPath } from '../lib/selectedAssets.js';
import { sceneMotionNegativePrompt, sceneMotionPrompt } from '../lib/sceneMotionPrompt.js';
import { checkRunwayHealth } from '../providers/runway.js';
import { assembleEpisodeFromClips } from '../providers/ffmpegRender.js';
import {
  AI_VIDEO_PROVIDERS,
  type AiVideoProvider,
  aiVideoClipsDir,
  aiVideoEpisodeDir,
  generateAiVideoClip
} from '../providers/aiVideo.js';
import { wanRemoteHealth } from '../workers/wanRemote.js';

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
  throw new Error(`Missing scene still for scene ${sceneId} in ${imagesDir}`);
}

/** Prefer reviewer-locked still, then canonical scene-N.* under images/. */
async function resolveSceneImage(
  imagesDir: string,
  sceneId: number,
  selectedImages?: Record<string, string>,
  explicitImage?: string
): Promise<string> {
  if (explicitImage) {
    const full = path.resolve(explicitImage);
    await access(full);
    return full;
  }
  const locked = selectedImages?.[String(sceneId)];
  if (locked) {
    const full = resolveOutputPath(locked);
    if (full) {
      await access(full);
      return full;
    }
  }
  return findImage(imagesDir, sceneId);
}

async function resolveDrive(sceneId: number, explicit?: string): Promise<string | undefined> {
  if (explicit) {
    const full = path.resolve(explicit);
    await access(full);
    return full;
  }
  const candidates = [
    path.resolve(`assets/driving/scene-${sceneId}.mp4`),
    path.resolve('assets/driving/default.mp4'),
    path.resolve(process.env.WAN_DRIVE_VIDEO || '')
  ].filter((p) => p && !p.endsWith(path.sep));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return undefined;
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
  throw new Error('Audio not found. Pass --audio path.mp3');
}

async function newestClip(clipsDir: string, sceneId: number, provider: AiVideoProvider): Promise<string> {
  const entries = await readdir(clipsDir).catch(() => [] as string[]);
  const matches = entries
    .filter((name) => name.startsWith(`scene-${sceneId}-${provider}`) && name.endsWith('.mp4'))
    .map((name) => path.join(clipsDir, name));
  if (!matches.length) throw new Error(`Missing ${provider} clip for scene ${sceneId} in ${clipsDir}`);
  const ranked = await Promise.all(
    matches.map(async (full) => ({ full, mtimeMs: (await stat(full)).mtimeMs }))
  );
  ranked.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return ranked[0]!.full;
}

async function main(): Promise<void> {
  if (args.includes('--health')) {
    const provider = (valueFor('--provider') || 'wan') as AiVideoProvider;
    if (provider === 'wan') {
      console.log(`Wan ready at ${await wanRemoteHealth()}`);
      return;
    }
    if (provider === 'runway') {
      console.log((await checkRunwayHealth()).message);
      return;
    }
    console.log('Veo has no local health endpoint; needs GOOGLE_AI_API_KEY + billing.');
    return;
  }

  const episodePath = valueFor('--episode');
  const providerRaw = valueFor('--provider') || process.env.AI_VIDEO_PROVIDER || 'veo';
  if (!AI_VIDEO_PROVIDERS.includes(providerRaw as AiVideoProvider)) {
    throw new Error(`--provider must be one of: ${AI_VIDEO_PROVIDERS.join(', ')}`);
  }
  const provider = providerRaw as AiVideoProvider;

  if (!episodePath) {
    throw new Error(
      [
        'Path B — AI animate (pluggable). Path A motion: npm run render',
        'Usage:',
        '  npm run animate -- --provider veo|wan|runway --episode data/episodes/file.json [--scene 4]',
        '  npm run animate -- --provider wan --episode ... --scene 4 [--image path.png]',
        '  npm run animate -- --provider wan --episode ... --scene 4 --drive assets/driving/leap.mp4',
        '  npm run animate -- --provider veo --episode ... --assemble',
        '  npm run animate -- --health --provider wan'
      ].join('\n')
    );
  }

  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const imagesDir = path.join(imagesRootDir(), episode.id);
  const clipsDir = aiVideoClipsDir(episode.id, provider);
  const episodeOutDir = aiVideoEpisodeDir(episode.id);
  const sceneFilter = valueFor('--scene') ? Number(valueFor('--scene')) : undefined;
  const allScenes = args.includes('--all');
  const assemble = args.includes('--assemble');
  const skipGenerate = args.includes('--skip-generate');
  const veoMode = (valueFor('--mode') || 'image') as 'image' | 'refs';
  const driveExplicit = valueFor('--drive');
  const imageExplicit = valueFor('--image');
  const stamp = stampNow();
  const selected = await loadReviewSelected(path.basename(episodePath));

  const extraRefs = (valueFor('--extra-refs') || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
  for (const ref of extraRefs) await access(ref);

  const targets = episode.scenes.filter((scene) => {
    if (sceneFilter) return scene.id === sceneFilter;
    if (allScenes) return true;
    return scene.renderMode === 'AI_VIDEO';
  });

  if (!targets.length && !assemble) {
    throw new Error('No AI_VIDEO scenes. Pass --scene N or --all, or mark scenes AI_VIDEO.');
  }

  console.log(`Path B — animate (${provider}) for ${episode.id}`);
  console.log(`Clips → ${clipsDir}`);
  console.log(`Final → ${episodeOutDir}/ (with --assemble)`);

  const clipByScene = new Map<number, string>();

  if (!skipGenerate) {
    for (const scene of targets) {
      const still = await resolveSceneImage(
        imagesDir,
        scene.id,
        selected?.images,
        imageExplicit && sceneFilter === scene.id ? imageExplicit : undefined
      );
      const fileName = `scene-${scene.id}-${provider}-${stamp}.mp4`;
      const outputPath = path.join(clipsDir, fileName);
      const prompt = sceneMotionPrompt(scene);
      const negativePrompt = sceneMotionNegativePrompt(scene);

      if (provider === 'wan') {
        const backend = (process.env.WAN_BACKEND || 'comfy').trim().toLowerCase();
        if (backend === 'comfy') {
          console.log(
            `Scene ${scene.id}: wan/comfy I2V image=${path.basename(still)} → ${fileName}`
          );
          await generateAiVideoClip({
            provider: 'wan',
            prompt,
            negativePrompt,
            outputPath,
            imagePath: still,
            durationSeconds: scene.durationSeconds
          });
        } else {
          const drive = await resolveDrive(scene.id, driveExplicit);
          if (!drive) {
            throw new Error(
              `Wan NIM needs a driving video for scene ${scene.id}. Pass --drive path.mp4 or set WAN_BACKEND=comfy`
            );
          }
          console.log(
            `Scene ${scene.id}: wan/nim image=${path.basename(still)} drive=${path.basename(drive)} → ${fileName}`
          );
          await generateAiVideoClip({
            provider: 'wan',
            prompt,
            negativePrompt,
            outputPath,
            imagePath: still,
            drivingVideoPath: drive
          });
        }
      } else if (provider === 'runway') {
        console.log(`Scene ${scene.id}: runway I2V still=${path.basename(still)} → ${fileName}`);
        await generateAiVideoClip({
          provider: 'runway',
          prompt,
          outputPath,
          imagePath: still,
          durationSeconds: scene.durationSeconds
        });
      } else {
        console.log(
          `Scene ${scene.id}: veo mode=${veoMode} still=${path.basename(still)} → ${fileName}`
        );
        await generateAiVideoClip({
          provider: 'veo',
          prompt,
          outputPath,
          imagePath: still,
          referenceImagePaths: extraRefs,
          veoMode,
          durationSeconds: Math.min(8, scene.durationSeconds)
        });
      }
      clipByScene.set(scene.id, outputPath);
      console.log(`Created: ${outputPath}`);
    }
  }

  const shouldAssemble =
    assemble || (!sceneFilter && allScenes) || (!sceneFilter && targets.length === episode.scenes.length);

  if (!shouldAssemble) {
    if (!sceneFilter && targets.length < episode.scenes.length) {
      console.log(
        `Generated ${targets.length} AI_VIDEO clip(s). Add --assemble after all scenes, or --all to animate every scene.`
      );
    }
    return;
  }

  const audioPath = await resolveAudio(episode.id, valueFor('--audio'));
  const assembledClips: string[] = [];
  for (const scene of episode.scenes) {
    if (clipByScene.has(scene.id)) {
      assembledClips.push(clipByScene.get(scene.id)!);
      continue;
    }
    // For assemble of mixed episode: prefer this provider's clip; else error for missing AI scenes
    try {
      assembledClips.push(await newestClip(clipsDir, scene.id, provider));
    } catch {
      throw new Error(
        `Cannot assemble: missing ${provider} clip for scene ${scene.id}. Run with --all or generate each scene first.`
      );
    }
  }

  const outputPath = path.resolve(
    valueFor('--output') || path.join(episodeOutDir, `${episode.id}-${provider}-${stamp}.mp4`)
  );
  console.log('Assembling AI clips + audio…');
  const destination = await assembleEpisodeFromClips({
    episode,
    audioPath,
    outputPath,
    clipPaths: assembledClips,
    burnSubtitles: !args.includes('--no-subs')
  });
  console.log(`Created AI Short: ${destination}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
