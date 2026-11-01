import { stillFilterArgs } from '../lib/stillEffects.js';
import { pickMotion, zoompanFilter } from '../lib/stillMotion.js';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Episode } from '../schema/episode.js';
import { imagesRootDir } from '../lib/sceneImage.js';
import {
  buildNarrationTimeline,
  type NarrationTimeline
} from '../audio/narration-timeline.js';
import { plannedVisualDurationSeconds } from '../lib/ttsScript.js';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { fitVisualTimings, type SceneVisuals } from '../lib/sceneVisualPlan.js';
import { assSubtitlesFilter, buildAssCaptions } from '../lib/burnCaptions.js';
import { brandEpisodesDir } from '../lib/brands.js';
import { resolveTechVisualForSlot } from '../tech-visuals/resolve.js';
import { renderTechVisualClip } from '../tech-visuals/renderClip.js';
import {
  remotionCliInstalled,
  remotionRootDir,
  remotionSilentPath,
  renderRemotionTechSilent,
  resolveTechVisualEngine,
  type TechVisualEngine
} from '../remotion/renderTechEpisode.js';

async function resolveEpisodeJsonPath(episode: Episode): Promise<string> {
  try {
    const dir = brandEpisodesDir();
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const full = path.join(dir, file);
      try {
        const raw = JSON.parse(await readFile(full, 'utf8')) as { id?: string };
        if (raw.id === episode.id) return full;
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // fall through to write snapshot
  }
  const snapshot = path.join(remotionRootDir(), `${episode.id}.episode.json`);
  await mkdir(path.dirname(snapshot), { recursive: true });
  await writeFile(snapshot, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
  return snapshot;
}

function assembleHasUploadedClips(input: AssembleClipsInput): boolean {
  if (input.visualSources) {
    for (const source of Object.values(input.visualSources)) {
      if (source?.clipPath) return true;
    }
  }
  if (input.productionShots?.some((shot) => shot.clipPath)) return true;
  return false;
}

export type VisualInput = {
  imagePath?: string;
  clipPath?: string;
  trimStartSeconds?: number | undefined;
  shortClip?: 'freeze' | 'loop' | undefined;
};

export type RenderInput = {
  episode: Episode;
  audioPath: string;
  outputPath: string;
  imagesDir?: string;
  width?: number;
  height?: number;
  fps?: number;
  burnSubtitles?: boolean;
  motion?: 'low' | 'medium' | 'high';
  /** Tech only: remotion (persistent SVG world) vs ffmpeg (per-scene SVG clips). */
  techVisualEngine?: TechVisualEngine;
};

export type ProductionVisual = VisualInput & { durationSeconds: number; camera: string };

export type AssembleClipsInput = {
  productionShots?: ProductionVisual[];
  episode: Episode;
  audioPath: string;
  outputPath: string;
  /** Ordered source clip paths, one per scene */
  clipPaths?: string[];
  /** Explicit source per slot: 0 = hook, -1 = ending. */
  visualSources?: Record<number, VisualInput>;
  sceneVisuals?: SceneVisuals;
  motion?: 'low' | 'medium' | 'high';
  width?: number;
  height?: number;
  fps?: number;
  burnSubtitles?: boolean;
  /** Tech only: remotion vs ffmpeg SVG clips — for A/B compare. */
  techVisualEngine?: TechVisualEngine;
};

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-2000) || `${command} exited with code ${code}`));
    });
  });
}

async function resolveFfmpeg(): Promise<string> {
  // Homebrew's minimal ffmpeg omits libass. Prefer its full build when installed.
  const configured = process.env.FFMPEG_BIN;
  if (configured) { await run(configured, ['-version']); return configured; }
  for (const candidate of ['/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg', '/usr/local/opt/ffmpeg-full/bin/ffmpeg']) {
    try { await access(candidate); await run(candidate, ['-version']); return candidate; } catch { /* try next */ }
  }
  try {
    await run('ffmpeg', ['-version']);
    return 'ffmpeg';
  } catch {
    throw new Error('ffmpeg is required. Install with: brew install ffmpeg');
  }
}

async function findSceneImage(imagesDir: string, sceneId: number): Promise<string> {
  const candidates = [`scene-${sceneId}.png`, `scene-${sceneId}.jpg`, `scene-${sceneId}.jpeg`];
  for (const name of candidates) {
    const full = path.join(imagesDir, name);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  const listing = await readdir(imagesDir).catch(() => []);
  throw new Error(`Missing image for scene ${sceneId} in ${imagesDir}. Found: ${listing.join(', ') || '(empty)'}`);
}

/** Prefer dedicated spoken-hook still; fall back to scene 1. */
async function findHookImage(imagesDir: string, fallbackSceneId: number): Promise<string> {
  for (const name of ['scene-hook.png', 'scene-hook.jpg', 'scene-hook.jpeg']) {
    const full = path.join(imagesDir, name);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  return findSceneImage(imagesDir, fallbackSceneId);
}

function toSrtTimestamp(totalSeconds: number): string {
  const ms = Math.round(totalSeconds * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function buildSrt(timeline: NarrationTimeline): string {
  return timeline.scenes
    .map((segment, index) => {
      const start = toSrtTimestamp(segment.startSecond);
      const end = toSrtTimestamp(segment.startSecond + segment.durationSeconds);
      return `${index + 1}\n${start} --> ${end}\n${segment.narrationHi}\n`;
    })
    .join('\n');
}

/**
 * Visual slots for the final Short: stretch/compress to real TTS length
 * (hook + scenes + ending), not the shorter planned script clock.
 */
export function visualSlotsFromTimeline(
  timeline: NarrationTimeline,
  episode: Episode
): Array<{
  key: string;
  kind: 'spokenHook' | 'scene' | 'ending';
  sceneId: number;
  durationSeconds: number;
  camera: string;
  index: number;
  narration: string;
}> {
  const lastScene = episode.scenes[episode.scenes.length - 1];
  if (!lastScene) throw new Error('Episode has no scenes to render');

  return timeline.scenes.map((slot, index) => {
    if (slot.kind === 'spokenHook') {
      return {
        key: 'spokenHook',
        kind: 'spokenHook' as const,
        sceneId: episode.scenes[0]!.id,
        durationSeconds: slot.durationSeconds,
        camera: slot.camera,
        index,
        narration: slot.narrationHi
      };
    }
    if (slot.kind === 'ending') {
      return {
        key: 'ending',
        kind: 'ending' as const,
        sceneId: lastScene.id,
        durationSeconds: slot.durationSeconds,
        camera: slot.camera,
        index,
        narration: slot.narrationHi
      };
    }
    const sceneId = typeof slot.id === 'number' ? slot.id : Number(slot.id);
    const scene = episode.scenes.find((item) => item.id === sceneId) || lastScene;
    return {
      key: `scene-${scene.id}`,
      kind: 'scene' as const,
      sceneId: scene.id,
      durationSeconds: slot.durationSeconds,
      camera: scene.camera || slot.camera,
      index,
      narration: slot.narrationHi
    };
  });
}

async function renderStillClip(
  ffmpeg: string,
  imagePath: string,
  outputPath: string,
  durationSeconds: number,
  camera: string,
  sceneIndex: number,
  width: number,
  height: number,
  fps: number,
  motionLevel: 'low' | 'medium' | 'high'
): Promise<void> {
  const motion = pickMotion(camera, sceneIndex);
  const filter = zoompanFilter(durationSeconds, fps, width, height, motion, motionLevel);
  await run(ffmpeg, [
    '-y',
    '-loop',
    '1',
    '-i',
    imagePath,
    ...stillFilterArgs(filter, width, height, fps, durationSeconds),
    '-t',
    String(durationSeconds),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    outputPath
  ]);
}

async function padVideoToDuration(
  ffmpeg: string,
  videoPath: string,
  targetDuration: number,
  outputPath: string
): Promise<string> {
  let current = 0;
  try {
    current = await probeAudioDuration(videoPath);
  } catch {
    return videoPath;
  }
  const lag = targetDuration - current;
  if (lag <= 0.08) return videoPath;
  await run(ffmpeg, [
    '-y',
    '-i',
    videoPath,
    '-vf',
    `tpad=stop_mode=clone:stop_duration=${lag.toFixed(3)}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    outputPath
  ]);
  return outputPath;
}

async function normalizeClip(
  ffmpeg: string,
  sourcePath: string,
  outputPath: string,
  durationSeconds: number,
  width: number,
  height: number,
  fps: number
): Promise<void> {
  // Loop short AI clips so they can fill narration-aligned windows longer than the source.
  await run(ffmpeg, [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    sourcePath,
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps}`,
    '-t',
    String(durationSeconds),
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    outputPath
  ]);
}

/** Keep presenter motion at its original speed and drop source audio. */
async function normalizeUploadedClip(
  ffmpeg: string, source: VisualInput, output: string, duration: number,
  width: number, height: number, fps: number
): Promise<void> {
  const start = source.trimStartSeconds ?? 0;
  const sourceDuration = await probeAudioDuration(source.clipPath!);
  if (start >= sourceDuration - 0.01) throw new Error(`Clip trim starts after the end of ${path.basename(source.clipPath!)}`);
  const remaining = Math.max(0, sourceDuration - start);
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},setpts=PTS-STARTPTS`;
  const freeze = source.shortClip !== 'loop';
  const padSeconds = freeze ? Math.max(0, duration - remaining + 0.05) : 0;
  await run(ffmpeg, ['-y', ...(freeze ? [] : ['-stream_loop', '-1']),
    '-ss', String(start), '-i', source.clipPath!, '-map', '0:v:0',
    '-vf', `${filter}${padSeconds > 0.05 ? `,tpad=stop_mode=clone:stop_duration=${padSeconds}` : ''}`,
    '-t', String(duration), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output]);
}

export type KenBurnsClipInput = {
  imagePath: string;
  outputPath: string;
  durationSeconds: number;
  camera: string;
  sceneIndex: number;
  width?: number;
  height?: number;
  fps?: number;
  motion?: 'low' | 'medium' | 'high';
};

/** Render one still image into a timed Ken Burns clip (Path A per-scene). */
export async function renderKenBurnsClip(input: KenBurnsClipInput): Promise<string> {
  const ffmpeg = await resolveFfmpeg();
  const width = input.width ?? Number(process.env.VIDEO_WIDTH || '1080');
  const height = input.height ?? Number(process.env.VIDEO_HEIGHT || '1920');
  const fps = input.fps ?? Number(process.env.VIDEO_FPS || '30');
  const motionLevel = (input.motion || process.env.VIDEO_MOTION || 'medium') as 'low' | 'medium' | 'high';
  await access(input.imagePath);
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const motion = pickMotion(input.camera, input.sceneIndex);
  const filter = zoompanFilter(input.durationSeconds, fps, width, height, motion, motionLevel);
  await run(ffmpeg, [
    '-y',
    '-loop', '1',
    '-i', input.imagePath,
    ...stillFilterArgs(filter, width, height, fps, input.durationSeconds),
    '-t', String(input.durationSeconds),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-an',
    input.outputPath
  ]);
  return input.outputPath;
}

async function finalizeWithAudioAndSubs(
  ffmpeg: string,
  episode: Episode,
  audioPath: string,
  silentVideo: string,
  outputPath: string,
  burnSubtitles: boolean,
  timeline: NarrationTimeline,
  width = 1080,
  height = 1920
): Promise<string> {
  const planned = plannedVisualDurationSeconds(episode);
  let audioDuration = planned;
  try {
    audioDuration = await probeAudioDuration(audioPath);
  } catch {
    // keep planned
  }
  // Final Short must match real voice length (never cut TTS short to the 25–60s plan).
  const totalDuration = audioDuration;
  const tempDir = path.dirname(silentVideo);
  const paddedVideo = await padVideoToDuration(
    ffmpeg,
    silentVideo,
    totalDuration,
    path.join(tempDir, 'video-padded.mp4')
  );

  const withAudio = path.join(tempDir, 'with-audio.mp4');
  // Do NOT use -shortest: planned visuals used to be shorter than TTS and truncated the voice.
  await run(ffmpeg, [
    '-y',
    '-i',
    paddedVideo,
    '-i',
    audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-t',
    String(totalDuration),
    withAudio
  ]);

  const srtPath = outputPath.replace(/\.mp4$/i, '.srt');
  await writeFile(srtPath, buildSrt(timeline), 'utf8');

  if (!burnSubtitles) {
    await run(ffmpeg, ['-y', '-i', withAudio, '-c', 'copy', outputPath]);
    return outputPath;
  }

  const assPath = path.join(tempDir, 'captions.ass');
  await writeFile(
    assPath,
    buildAssCaptions(
      timeline.scenes.map((segment) => ({
        startSecond: segment.startSecond,
        durationSeconds: segment.durationSeconds,
        narrationHi: segment.narrationHi
      })),
      width,
      height
    ),
    'utf8'
  );

  try {
    await run(ffmpeg, [
      '-y',
      '-i',
      withAudio,
      '-vf',
      assSubtitlesFilter(assPath),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      outputPath
    ]);
  } catch (error) {
    await rm(outputPath, { force: true });
    throw new Error(`Could not burn subtitles. Check that FFmpeg supports libass/ass, or turn off burned subtitles and use the SRT. ${error instanceof Error ? error.message : String(error)}`);
  }
  return outputPath;
}

/** Path A: FFmpeg-only Short from stills + Ken Burns. Never mixes Veo clips. */
export async function renderEpisodeShort(input: RenderInput): Promise<string> {
  const ffmpeg = await resolveFfmpeg();
  const width = input.width ?? Number(process.env.VIDEO_WIDTH || '1080');
  const height = input.height ?? Number(process.env.VIDEO_HEIGHT || '1920');
  const fps = input.fps ?? Number(process.env.VIDEO_FPS || '30');
  const burnSubtitles = input.burnSubtitles ?? process.env.VIDEO_BURN_SUBTITLES !== 'false';
  const motionLevel = (input.motion || process.env.VIDEO_MOTION || 'medium') as 'low' | 'medium' | 'high';
  const imagesDir = input.imagesDir || path.join(imagesRootDir(), input.episode.id);

  await access(input.audioPath);
  await mkdir(path.dirname(input.outputPath), { recursive: true });

  const timeline = await buildNarrationTimeline(input.episode, input.audioPath);
  const slots = visualSlotsFromTimeline(timeline, input.episode);
  console.log(
    `Visual clock: ${timeline.method} → ${timeline.narrationDurationSeconds.toFixed(1)}s ` +
      `(planned script was ${plannedVisualDurationSeconds(input.episode)}s)`
  );

  const tempDir = await mkdtemp(path.join(tmpdir(), 'mythology-render-'));
  try {
    const techEngine = resolveTechVisualEngine(input.episode, input.techVisualEngine);
    console.log(`Tech visual engine: ${techEngine}`);
    if (techEngine === 'remotion' && (await remotionCliInstalled())) {
      try {
        const episodeJson = await resolveEpisodeJsonPath(input.episode);
        const silentVideo = await renderRemotionTechSilent({
          episode: input.episode,
          episodeJsonPath: episodeJson,
          outputPath: remotionSilentPath(input.episode.id),
          slots
        });
        console.log(`Remotion silent ready → mux narration (${path.basename(silentVideo)})`);
        return await finalizeWithAudioAndSubs(
          ffmpeg,
          input.episode,
          input.audioPath,
          silentVideo,
          input.outputPath,
          burnSubtitles,
          timeline,
          width,
          height
        );
      } catch (error) {
        console.warn(
          `Remotion tech render failed — falling back to FFmpeg SVG clips. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const clipPaths: string[] = [];
    for (const slot of slots) {
      const clipPath = path.join(tempDir, `clip-${slot.key}.mp4`);
      const slotId =
        slot.kind === 'spokenHook' ? 0 : slot.kind === 'ending' ? -1 : slot.sceneId;
      const techVisual = resolveTechVisualForSlot(input.episode, slotId, {
        narration: slot.narration
      });
      if (techVisual) {
        console.log(
          `${slot.kind}: techVisual ${techVisual.visualType} speech-synced (${slot.durationSeconds.toFixed(2)}s) [ffmpeg]`
        );
        await renderTechVisualClip({
          visual: techVisual,
          durationSeconds: slot.durationSeconds,
          outputPath: clipPath,
          fps,
          width,
          height
        });
        clipPaths.push(clipPath);
        continue;
      }
      const imagePath =
        slot.kind === 'spokenHook'
          ? await findHookImage(imagesDir, slot.sceneId)
          : await findSceneImage(imagesDir, slot.sceneId);
      console.log(
        `${slot.kind}: FFmpeg (${slot.durationSeconds.toFixed(2)}s) using ${path.basename(imagePath)}`
      );
      await renderStillClip(
        ffmpeg,
        imagePath,
        clipPath,
        slot.durationSeconds,
        slot.camera,
        slot.index,
        width,
        height,
        fps,
        motionLevel
      );
      clipPaths.push(clipPath);
    }

    const concatList = path.join(tempDir, 'concat.txt');
    await writeFile(
      concatList,
      `${clipPaths.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n')}\n`,
      'utf8'
    );

    const silentVideo = path.join(tempDir, 'video-silent.mp4');
    await run(ffmpeg, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatList,
      '-c',
      'copy',
      silentVideo
    ]);

    return await finalizeWithAudioAndSubs(
      ffmpeg,
      input.episode,
      input.audioPath,
      silentVideo,
      input.outputPath,
      burnSubtitles,
      timeline,
      width,
      height
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/** Concatenate pre-made scene clips (e.g. Veo) + narration into one Short. */
export async function assembleEpisodeFromClips(input: AssembleClipsInput): Promise<string> {
  if (!input.productionShots && !input.visualSources && input.clipPaths?.length !== input.episode.scenes.length) {
    throw new Error(
      `Expected ${input.episode.scenes.length} clips (one per scene), got ${input.clipPaths?.length || 0}`
    );
  }

  const ffmpeg = await resolveFfmpeg();
  const width = input.width ?? Number(process.env.VIDEO_WIDTH || '1080');
  const height = input.height ?? Number(process.env.VIDEO_HEIGHT || '1920');
  const fps = input.fps ?? Number(process.env.VIDEO_FPS || '30');
  const burnSubtitles = input.burnSubtitles ?? process.env.VIDEO_BURN_SUBTITLES !== 'false';

  await access(input.audioPath);
  await mkdir(path.dirname(input.outputPath), { recursive: true });

  const timeline = await buildNarrationTimeline(input.episode, input.audioPath);
  if (input.productionShots) {
    const total = input.productionShots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    if (!input.productionShots.length || input.productionShots.some(shot =>
      !Number.isFinite(shot.durationSeconds) || shot.durationSeconds <= 0 || (!shot.clipPath && !shot.imagePath)) ||
      Math.abs(total - timeline.narrationDurationSeconds) > 0.05) {
      throw new Error('Production shots must cover the complete narration duration with valid sources');
    }
  }
  const slots = input.productionShots ? input.productionShots.map((shot, index) => ({
    key: `shot-${index + 1}`, kind: 'scene' as const, sceneId: index + 1, index,
    durationSeconds: shot.durationSeconds, camera: shot.camera
  })) : fitVisualTimings(visualSlotsFromTimeline(timeline, input.episode).map((slot) => ({
    ...slot, id: slot.kind === 'spokenHook' ? 0 : slot.kind === 'ending' ? -1 : slot.sceneId,
    startSecond: 0
  })), input.sceneVisuals);
  console.log(
    `Visual clock: ${timeline.method} → ${timeline.narrationDurationSeconds.toFixed(1)}s ` +
      `(planned script was ${plannedVisualDurationSeconds(input.episode)}s)`
  );

  const tempDir = await mkdtemp(path.join(tmpdir(), 'mythology-assemble-'));
  try {
    // Tech Remotion path (opt-in via techVisualEngine): one silent MP4 → FFmpeg mux.
    // FFmpeg engine keeps per-scene SVG clips for A/B compare.
    const techEngine = resolveTechVisualEngine(input.episode, input.techVisualEngine);
    console.log(`Tech visual engine: ${techEngine}`);
    if (
      techEngine === 'remotion' &&
      !assembleHasUploadedClips(input) &&
      (await remotionCliInstalled())
    ) {
      try {
        const episodeJson = await resolveEpisodeJsonPath(input.episode);
        const silentVideo = await renderRemotionTechSilent({
          episode: input.episode,
          episodeJsonPath: episodeJson,
          outputPath: remotionSilentPath(input.episode.id),
          slots
        });
        console.log(`Remotion silent ready → mux narration (${path.basename(silentVideo)})`);
        return await finalizeWithAudioAndSubs(
          ffmpeg,
          input.episode,
          input.audioPath,
          silentVideo,
          input.outputPath,
          burnSubtitles,
          timeline,
          width,
          height
        );
      } catch (error) {
        console.warn(
          `Remotion tech render failed — falling back to FFmpeg SVG clips. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const normalized: string[] = [];
    const imagesDir = path.join(imagesRootDir(), input.episode.id);
    const clipBySceneId = new Map(
      input.episode.scenes.map((scene, index) => [scene.id, input.clipPaths?.[index]] as const)
    );

    for (const slot of slots) {
      const clipPath = path.join(tempDir, `clip-${slot.key}.mp4`);
      const slotId = slot.kind === 'spokenHook' ? 0 : slot.kind === 'ending' ? -1 : slot.sceneId;
      const chosen = input.productionShots?.[slot.index] || input.visualSources?.[slotId];
      const techVisual = resolveTechVisualForSlot(input.episode, slotId, {
        narration: 'narration' in slot ? String(slot.narration || '') : undefined
      });
      // Deterministic tech diagrams beat Ken Burns on old AI stills.
      // Uploaded / AI video clips still win when present.
      if (techVisual && !chosen?.clipPath) {
        console.log(
          `${slot.kind}: techVisual ${techVisual.visualType} speech-synced (${slot.durationSeconds.toFixed(2)}s) [ffmpeg]`
        );
        await renderTechVisualClip({
          visual: techVisual,
          durationSeconds: slot.durationSeconds,
          outputPath: clipPath,
          fps,
          width,
          height
        });
        normalized.push(clipPath);
        continue;
      }
      if (input.visualSources && !chosen) throw new Error(`Missing visual for section ${slotId}`);
      if (chosen?.imagePath) {
        await renderStillClip(ffmpeg, chosen.imagePath, clipPath, slot.durationSeconds,
          slot.camera, slot.index, width, height, fps, input.motion || 'medium');
      } else if (chosen?.clipPath) {
        await normalizeUploadedClip(ffmpeg, chosen, clipPath, slot.durationSeconds, width, height, fps);
      } else if (slot.kind === 'spokenHook') {
        const imagePath = await findHookImage(imagesDir, slot.sceneId);
        console.log(
          `Spoken hook: still ${path.basename(imagePath)} (${slot.durationSeconds.toFixed(2)}s)`
        );
        await renderStillClip(
          ffmpeg,
          imagePath,
          clipPath,
          slot.durationSeconds,
          slot.camera,
          slot.index,
          width,
          height,
          fps,
          'medium'
        );
      } else {
        const source = clipBySceneId.get(slot.sceneId);
        if (!source) {
          throw new Error(`Missing source clip for scene ${slot.sceneId}`);
        }
        await access(source);
        console.log(
          `${slot.kind} ${slot.sceneId}: normalize ${path.basename(source)} → ${slot.durationSeconds.toFixed(2)}s`
        );
        await normalizeClip(ffmpeg, source, clipPath, slot.durationSeconds, width, height, fps);
      }
      normalized.push(clipPath);
    }

    const concatList = path.join(tempDir, 'concat.txt');
    await writeFile(
      concatList,
      `${normalized.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n')}\n`,
      'utf8'
    );

    const silentVideo = path.join(tempDir, 'video-silent.mp4');
    await run(ffmpeg, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatList,
      '-c',
      'copy',
      silentVideo
    ]);

    return await finalizeWithAudioAndSubs(
      ffmpeg,
      input.episode,
      input.audioPath,
      silentVideo,
      input.outputPath,
      burnSubtitles,
      timeline,
      width,
      height
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
