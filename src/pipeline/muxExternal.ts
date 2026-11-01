import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Episode } from '../schema/episode.js';
import { buildNarrationTimeline } from '../audio/narration-timeline.js';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { plannedVisualDurationSeconds } from '../lib/ttsScript.js';
import { assSubtitlesFilter, buildAssCaptions } from '../lib/burnCaptions.js';

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
  try {
    await run('ffmpeg', ['-version']);
    return 'ffmpeg';
  } catch {
    throw new Error('ffmpeg is required. Install with: brew install ffmpeg');
  }
}

function buildSrt(timeline: Awaited<ReturnType<typeof buildNarrationTimeline>>): string {
  const lines: string[] = [];
  let index = 1;
  for (const scene of timeline.scenes) {
    const text = scene.narrationHi?.trim();
    if (!text) continue;
    const start = scene.startSecond;
    const end = scene.startSecond + scene.durationSeconds;
    const fmt = (s: number) => {
      const ms = Math.max(0, Math.round(s * 1000));
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const sec = Math.floor((ms % 60_000) / 1000);
      const milli = ms % 1000;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
    };
    lines.push(String(index++), `${fmt(start)} --> ${fmt(end)}`, text, '');
  }
  return lines.join('\n');
}

/**
 * Replace audio on an externally generated video with this episode's narration/mix.
 * Pads or trims the video timeline to match the voice length (same policy as free Short render).
 */
export async function muxExternalVideoWithAudio(input: {
  episode: Episode;
  videoPath: string;
  audioPath: string;
  outputPath: string;
  burnSubtitles?: boolean;
}): Promise<string> {
  const ffmpeg = await resolveFfmpeg();
  await access(input.videoPath);
  await access(input.audioPath);
  await mkdir(path.dirname(input.outputPath), { recursive: true });

  const burnSubtitles = input.burnSubtitles ?? process.env.VIDEO_BURN_SUBTITLES !== 'false';
  const width = Number(process.env.VIDEO_WIDTH || '1080');
  const height = Number(process.env.VIDEO_HEIGHT || '1920');
  const timeline = await buildNarrationTimeline(input.episode, input.audioPath);
  const planned = plannedVisualDurationSeconds(input.episode);
  let audioDuration = planned;
  try {
    audioDuration = await probeAudioDuration(input.audioPath);
  } catch {
    // keep planned
  }
  const totalDuration = Math.max(audioDuration, timeline.narrationDurationSeconds, planned);

  const tempDir = await mkdtemp(path.join(tmpdir(), 'mythology-mux-ext-'));
  try {
    const scaled = path.join(tempDir, 'scaled.mp4');
    // Normalize to 9:16 Short canvas; keep visual from upload, drop its audio.
    await run(ffmpeg, [
      '-y',
      '-i',
      input.videoPath,
      '-vf',
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-t',
      String(totalDuration),
      scaled
    ]);

    // If source was shorter than audio, loop/pad last frame via tpad.
    const padded = path.join(tempDir, 'padded.mp4');
    await run(ffmpeg, [
      '-y',
      '-i',
      scaled,
      '-vf',
      `tpad=stop_mode=clone:stop_duration=${Math.max(0.1, totalDuration).toFixed(3)}`,
      '-t',
      String(totalDuration),
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      padded
    ]);

    const withAudio = path.join(tempDir, 'with-audio.mp4');
    await run(ffmpeg, [
      '-y',
      '-i',
      padded,
      '-i',
      input.audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-t',
      String(totalDuration),
      withAudio
    ]);

    const srtPath = input.outputPath.replace(/\.mp4$/i, '.srt');
    await writeFile(srtPath, buildSrt(timeline), 'utf8');

    if (!burnSubtitles) {
      await run(ffmpeg, ['-y', '-i', withAudio, '-c', 'copy', input.outputPath]);
      return input.outputPath;
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
        input.outputPath
      ]);
    } catch {
      await run(ffmpeg, ['-y', '-i', withAudio, '-c', 'copy', input.outputPath]);
    }
    return input.outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
