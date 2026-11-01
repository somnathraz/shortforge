#!/usr/bin/env node
import { isTechBrand } from '../lib/brands.js';
import { parseStillEffects } from '../lib/stillEffects.js';
/**
 * Path A — FFmpeg-only Short (stills + Ken Burns). Never uses Veo.
 * Output: output/video/
 */
import '../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { renderEpisodeShort } from '../providers/ffmpegRender.js';
import { buildProductionReport, writeProductionReport } from '../lib/productionCost.js';
import { resolveEpisodeNarrationAudio } from '../lib/selectedAssets.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function versionStamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  if (!episodePath) {
    throw new Error(
      'Path A (FFmpeg only). Usage: npm run render -- --episode data/episodes/file.json [--audio out.mp3] [--motion low|medium|high]\nVeo path: npm run render:veo'
    );
  }

  const resolvedEpisode = path.resolve(episodePath);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(resolvedEpisode, 'utf8')) as unknown);
  const audioPath = await resolveEpisodeNarrationAudio({
    episodeId: episode.id,
    episodeFile: path.basename(resolvedEpisode),
    ...(valueFor('--audio') ? { explicitAudio: valueFor('--audio')! } : {})
  });
  const videoOutputDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || 'output/video');
  const outputPath = path.resolve(
    valueFor('--output') || path.join(videoOutputDir, `${episode.id}-${versionStamp()}.mp4`)
  );
  process.env.FFMPEG_STILL_EFFECTS = isTechBrand(episode.brandId) || episode.storyKind === 'TECH_EDUCATION' ? 'off' : parseStillEffects(valueFor('--ffmpeg-effects'));
  const motionRaw = valueFor('--motion') || process.env.VIDEO_MOTION || 'medium';
  if (!['low', 'medium', 'high'].includes(motionRaw)) {
    throw new Error('--motion must be low, medium, or high');
  }

  console.log(`Path A — FFmpeg Short for ${episode.id} (motion=${motionRaw})`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Images: output/images/${episode.id}/`);
  console.log(`Output: ${outputPath}`);
  const startedAt = Date.now();
  const destination = await renderEpisodeShort({
    episode,
    audioPath,
    outputPath,
    burnSubtitles: !args.includes('--no-subs'),
    motion: motionRaw as 'low' | 'medium' | 'high'
  });
  const generationSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  await writeProductionReport(
    buildProductionReport(
      episode.id,
      episode.scenes.map((scene) => ({
        sceneId: scene.id,
        renderMode: scene.renderMode,
        provider: 'ffmpeg' as const,
        costUsd: 0,
        generationSeconds: Number((generationSeconds / Math.max(1, episode.scenes.length)).toFixed(2)),
        attempts: 1,
        accepted: true
      })),
      destination
    )
  );
  console.log(`Created: ${destination}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
