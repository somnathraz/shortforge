#!/usr/bin/env node
/**
 * Wrap an assembled EpicAstra Short with Remotion chrome
 * (intro card + watermark + end/subscribe).
 *
 * Usage:
 *   npm run remotion:chrome -- --video output/final/foo.mp4 \
 *     --title "..." [--subtitle "..."] [--out output/final/foo-chrome.mp4]
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeAudioDuration } from '../audio/ffprobe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FPS = 30;
const INTRO = 60;
const OUTRO = 75;

function value(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i < 0 ? undefined : process.argv[i + 1];
}

function run(command: string, args: string[], cwd = ROOT): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

async function main() {
  const videoArg = value('--video');
  if (!videoArg) {
    console.error(
      'Usage: npm run remotion:chrome -- --video output/final/<file>.mp4 --title "..." [--subtitle "..."] [--out path.mp4]'
    );
    process.exitCode = 1;
    return;
  }

  const absoluteVideo = path.resolve(ROOT, videoArg);
  const title =
    value('--title') ||
    path.basename(absoluteVideo, path.extname(absoluteVideo)).replace(/-final-.*$/, '');
  const subtitle = value('--subtitle') || '';
  const brand = value('--brand') || 'EpicAstra';
  const episodeId = value('--episode')?.trim();
  const cta =
    value('--cta') || 'Follow EpicAstra for more mythology Shorts.';

  const duration = await probeAudioDuration(absoluteVideo);
  const mainFrames = Math.max(1, Math.round(duration * FPS));
  const durationInFrames = INTRO + mainFrames + OUTRO;

  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  const baseName = episodeId
    ? `${episodeId}-chrome-${stamp}.mp4`
    : `${path.basename(absoluteVideo, path.extname(absoluteVideo))}-chrome-${stamp}.mp4`;
  const out = value('--out') || path.join(ROOT, 'output/final', baseName);

  // Remotion serves media from remotion/public via staticFile().
  const publicDir = path.join(ROOT, 'remotion/public/chrome');
  await mkdir(publicDir, { recursive: true });
  const publicName = `source-${stamp}.mp4`;
  await copyFile(absoluteVideo, path.join(publicDir, publicName));
  const videoSrc = `chrome/${publicName}`;

  const workDir = path.join(ROOT, 'output/remotion/chrome');
  await mkdir(workDir, { recursive: true });
  const propsPath = path.join(workDir, 'chrome.props.json');
  const props = {
    videoSrc,
    mainFrames,
    title,
    subtitle,
    brand,
    cta,
    introFrames: INTRO,
    outroFrames: OUTRO
  };
  await writeFile(propsPath, JSON.stringify(props, null, 2));

  console.log(`Chrome wrap: ${mainFrames} story frames + intro/outro → ${out}`);
  await run(
    process.execPath,
    [
      path.join(ROOT, 'remotion/node_modules/@remotion/cli/remotion-cli.js'),
      'render',
      'src/index.ts',
      'EpicAstraChrome',
      out,
      '--props',
      propsPath,
      '--codec',
      'h264',
      '--crf',
      '18',
      '--concurrency',
      '2',
      '--log',
      'error'
    ],
    path.join(ROOT, 'remotion')
  );
  console.log(`Done: ${out} (${durationInFrames} frames @ ${FPS}fps)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
