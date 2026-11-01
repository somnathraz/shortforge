import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import type { TechVisual } from '../schema/techVisual.js';
import { TechVisualSchema } from '../schema/techVisual.js';
import { renderTechVisualSvg } from './layouts.js';
import { TECH_VISUAL_THEME } from './theme.js';

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-2000) || `${command} exited ${code}`));
    });
  });
}

async function resolveFfmpeg(): Promise<string> {
  const configured = process.env.FFMPEG_BIN;
  if (configured) return configured;
  return 'ffmpeg';
}

export type RenderTechClipInput = {
  visual: TechVisual;
  durationSeconds: number;
  outputPath: string;
  fps?: number;
  width?: number;
  height?: number;
};

/** Render a deterministic teaching clip (SVG frames → PNG → H.264). */
export async function renderTechVisualClip(input: RenderTechClipInput): Promise<string> {
  const visual = TechVisualSchema.parse(input.visual);
  const fps = input.fps ?? Number(process.env.VIDEO_FPS || '30');
  const width = input.width ?? TECH_VISUAL_THEME.width;
  const height = input.height ?? TECH_VISUAL_THEME.height;
  const duration = Math.max(0.2, input.durationSeconds);
  const frameCount = Math.max(1, Math.round(duration * fps));
  const ffmpeg = await resolveFfmpeg();

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tech-visual-'));
  try {
    for (let i = 0; i < frameCount; i++) {
      const t = frameCount === 1 ? 1 : i / (frameCount - 1);
      const svg = renderTechVisualSvg(visual, t);
      const pngPath = path.join(tempDir, `frame-${String(i).padStart(5, '0')}.png`);
      await sharp(Buffer.from(svg)).resize(width, height).png().toFile(pngPath);
    }

    await run(ffmpeg, [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      path.join(tempDir, 'frame-%05d.png'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-t',
      String(duration),
      input.outputPath
    ]);
    return input.outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function writeTechVisualPreviewPng(
  visual: TechVisual,
  outputPath: string,
  t = 1
): Promise<string> {
  const parsed = TechVisualSchema.parse(visual);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const svg = renderTechVisualSvg(parsed, t);
  await sharp(Buffer.from(svg))
    .resize(TECH_VISUAL_THEME.width, TECH_VISUAL_THEME.height)
    .png()
    .toFile(outputPath);
  await writeFile(outputPath.replace(/\.png$/i, '.svg'), svg, 'utf8');
  return outputPath;
}
