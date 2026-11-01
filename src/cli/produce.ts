#!/usr/bin/env node
import { defaultVideoProviderName } from '../providers/videoGeneration.js';
import { isTechBrand } from '../lib/brands.js';
import { parseStillEffects } from '../lib/stillEffects.js';
/**
 * Final composer — publish-ready Short.
 * STILL → FFmpeg; AI_VIDEO → wan|veo; assemble → output/final/<id>.mp4
 */
import '../lib/loadEnv.js';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { AI_VIDEO_PROVIDERS, type AiVideoProvider } from '../providers/aiVideo.js';
import { produceEpisode } from '../pipeline/produce.js';
import {
  loadReviewSelected,
  resolveEpisodeNarrationAudio,
  resolveOutputPath
} from '../lib/selectedAssets.js';
import { mixEpisodeAudio } from '../audio/mix-episode.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function resolveEpisodePath(raw?: string): Promise<string> {
  if (!raw) {
    throw new Error(
      [
        'Usage: npm run produce -- --episode data/episodes/file.json [--provider wan|veo]',
        '       [--audio out.mp3] [--drive assets/driving/leap.mp4] [--motion high]',
        '       [--tech-engine remotion|ffmpeg]  # tech A/B visuals',
        '       [--reuse-ai]  # do not call Wan/Veo; use existing AI clips only'
      ].join('\n')
    );
  }
  if (raw.endsWith('.json') || raw.includes('/') || raw.includes('\\')) {
    await access(raw);
    return path.resolve(raw);
  }
  const { readdir } = await import('node:fs/promises');
  const dir = path.resolve('data/episodes');
  const files = await readdir(dir);
  const needle = raw.toLowerCase();
  const byName = files.find((f) => f.toLowerCase().includes(needle) && f.endsWith('.json'));
  if (byName) return path.join(dir, byName);

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as { id?: string };
      if (parsed.id === raw) return path.join(dir, file);
    } catch {
      // continue
    }
  }
  throw new Error(`No episode matching "${raw}" in ${dir}`);
}

async function main(): Promise<void> {
  const episodePath = await resolveEpisodePath(valueFor('--episode'));
  const providerRaw = valueFor('--provider') || process.env.AI_VIDEO_PROVIDER || (defaultVideoProviderName().startsWith('runway') ? 'runway' : 'wan');
  if (!AI_VIDEO_PROVIDERS.includes(providerRaw as AiVideoProvider)) {
    throw new Error(`--provider must be ${AI_VIDEO_PROVIDERS.join(' | ')}`);
  }
  const provider = providerRaw as AiVideoProvider;
  const motionRaw = valueFor('--motion') || process.env.VIDEO_MOTION || 'high';
  if (!['low', 'medium', 'high'].includes(motionRaw)) {
    throw new Error('--motion must be low|medium|high');
  }
  const techEngineRaw =
    valueFor('--tech-engine') || process.env.TECH_VISUAL_ENGINE || '';
  if (techEngineRaw && !['remotion', 'ffmpeg'].includes(techEngineRaw)) {
    throw new Error('--tech-engine must be remotion|ffmpeg');
  }

  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  process.env.FFMPEG_STILL_EFFECTS = isTechBrand(episode.brandId) || episode.storyKind === 'TECH_EDUCATION' ? 'off' : parseStillEffects(valueFor('--ffmpeg-effects'));
  const selected = await loadReviewSelected(path.basename(episodePath));
  let audioPath = await resolveEpisodeNarrationAudio({
    episodeId: episode.id,
    episodeFile: path.basename(episodePath),
    ...(valueFor('--audio') ? { explicitAudio: valueFor('--audio')! } : {})
  });
  const reuseAi = args.includes('--reuse-ai');
  const drive = valueFor('--drive');
  const skipAudioMix = args.includes('--no-audio-mix') || process.env.AUDIO_AUTO_MIX === 'false';

  if (!skipAudioMix && !valueFor('--audio')) {
    try {
      console.log('Sound Director: mixing narration + SFX + BGM…');
      const mixed = await mixEpisodeAudio({
        episode,
        narrationPath: audioPath,
        episodePath,
        autoPlan: process.env.SOUND_DIRECTOR_AUTO_PLAN !== 'false'
      });
      audioPath = mixed.finalMixPath;
      console.log(`Using final mix: ${audioPath}`);
    } catch (error) {
      console.warn(
        `Audio mix skipped (${error instanceof Error ? error.message : String(error)}). Using narration only.`
      );
    }
  } else if (
    valueFor('--audio') &&
    /final-mix|sfx-mix/i.test(valueFor('--audio')!)
  ) {
    console.log('Using pre-mixed Sound Director audio (skip auto-mix)');
  }

  const selectedClips: Record<number, string> = {};
  const selectedImages: Record<number, string> = {};
  if (selected?.clips) {
    for (const [sceneId, relative] of Object.entries(selected.clips)) {
      const absolute = resolveOutputPath(relative);
      if (absolute) {
        try {
          await access(absolute);
          selectedClips[Number(sceneId)] = absolute;
        } catch {
          console.warn(`Selected clip missing for scene ${sceneId}: ${relative}`);
        }
      }
    }
  }
  if (selected?.images) {
    for (const [sceneId, relative] of Object.entries(selected.images)) {
      const absolute = resolveOutputPath(relative);
      if (absolute) {
        try {
          await access(absolute);
          selectedImages[Number(sceneId)] = absolute;
        } catch {
          console.warn(`Selected image missing for scene ${sceneId}: ${relative}`);
        }
      }
    }
  }

  console.log(`Produce ${episode.id}`);
  console.log(`AI_VIDEO provider: ${provider}`);
  console.log(`STILL motion: FFmpeg (${motionRaw})`);
  if (techEngineRaw) console.log(`Tech visual engine: ${techEngineRaw}`);
  console.log(
    `Audio: ${audioPath}${valueFor('--audio') ? ' (from --audio)' : selected?.audio ? ' (from review selection)' : ' (episode-tagged file)'}`
  );
  if (Object.keys(selectedClips).length) {
    console.log(`Selected AI clips: scenes ${Object.keys(selectedClips).sort().join(', ')}`);
  }
  if (Object.keys(selectedImages).length) {
    console.log(`Selected stills: scenes ${Object.keys(selectedImages).sort().join(', ')}`);
  }

  const { finalPath, reportPath } = await produceEpisode({
    episode,
    audioPath,
    provider,
    motion: motionRaw as 'low' | 'medium' | 'high',
    generateAi: !reuseAi,
    burnSubtitles: !args.includes('--no-subs') && selected?.burnSubtitles !== false,
    ...(selected?.sceneVisuals ? { sceneVisuals: selected.sceneVisuals } : {}),
    ...(drive ? { drivingVideoPath: path.resolve(drive) } : {}),
    ...(valueFor('--output') ? { outputPath: path.resolve(valueFor('--output')!) } : {}),
    ...(Object.keys(selectedClips).length ? { selectedClips } : {}),
    ...(Object.keys(selectedImages).length ? { selectedImages } : {}),
    ...(techEngineRaw
      ? { techVisualEngine: techEngineRaw as 'remotion' | 'ffmpeg' }
      : {})
  });

  console.log(`Final: ${finalPath}`);
  console.log(`Report: ${reportPath}`);
  console.log('Next: npm run review -- --episode ' + episode.id + ' --action APPROVE');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
