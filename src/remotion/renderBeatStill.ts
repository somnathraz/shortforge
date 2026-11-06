/**
 * Still of one beat of a tech reel at a chosen time, for previewing custom.layers animation
 * (Desk and MCP). Uses the same Remotion CLI path as renderSceneStill.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TechReel } from '../schema/techReel.js';
import { beatFrames, REEL_FPS, type TechReelProps } from './techReelModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => chunks.push(Buffer.from(d)));
    child.stderr?.on('data', (d) => chunks.push(Buffer.from(d)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(chunks).toString('utf8').trim().slice(-1200) || `${command} exited ${code}`));
    });
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function renderBeatStill(input: {
  reel: TechReel;
  beatId: string;
  /** Seconds from the start of the beat (clamped to the beat). */
  atSeconds: number;
  scale?: number;
}): Promise<{ absolutePath: string; frame: number; cached: boolean }> {
  const index = input.reel.beats.findIndex((beat) => beat.id === input.beatId);
  if (index < 0) throw new Error(`No beat "${input.beatId}" in reel ${input.reel.id}`);
  const frames = beatFrames(input.reel);
  const start = frames.slice(0, index).reduce((a, b) => a + b, 0);
  const local = Math.min(frames[index]! - 1, Math.max(0, Math.round(input.atSeconds * REEL_FPS)));
  const frame = start + local;
  const scale = Math.min(1, Math.max(0.2, input.scale ?? 0.4));

  const props: TechReelProps = { reel: input.reel, captions: [] };
  const fingerprint = createHash('sha1').update(JSON.stringify({ props, frame, scale })).digest('hex').slice(0, 12);
  const directory = path.join(ROOT, 'output/tech-beat-previews', input.reel.id);
  await mkdir(directory, { recursive: true });
  const absolutePath = path.join(directory, `${input.beatId}-${fingerprint}.png`);
  if (await exists(absolutePath)) return { absolutePath, frame, cached: true };

  const propsPath = path.join(directory, `${fingerprint}-props.json`);
  await writeFile(propsPath, JSON.stringify(props));
  await run(
    process.execPath,
    [
      path.join(ROOT, 'remotion/node_modules/@remotion/cli/remotion-cli.js'),
      'still',
      'src/index.ts',
      'TechReel',
      absolutePath,
      '--props',
      propsPath,
      '--frame',
      String(frame),
      '--scale',
      String(scale),
      '--log',
      'error'
    ],
    path.join(ROOT, 'remotion')
  );
  if (!(await exists(absolutePath))) throw new Error(`Remotion still did not write ${absolutePath}`);
  return { absolutePath, frame, cached: false };
}
