#!/usr/bin/env node
/**
 * Wan via ComfyUI (I2V) or NIM.
 *
 * Comfy (default):
 *   WAN_BACKEND=comfy WAN_COMFY_URL=http://127.0.0.1:8188
 *   npm run wan:comfy -- --health
 *   npm run wan:comfy -- --image still.png --prompt "..." --output out.mp4
 *
 * NIM:
 *   WAN_BACKEND=nim npm run wan:animate -- --image still.png --video drive.mp4 --prompt "..."
 */
import '../lib/loadEnv.js';
import path from 'node:path';
import { wanBackend, wanRemoteAnimate, wanRemoteHealth } from '../workers/wanRemote.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  if (args.includes('--health')) {
    const backend = wanBackend();
    console.log(`Wan backend=${backend} ready at ${await wanRemoteHealth()}`);
    return;
  }

  const imagePath = valueFor('--image');
  const prompt = valueFor('--prompt');
  const outputPath = valueFor('--output');
  const videoPath = valueFor('--video') || valueFor('--drive');
  const rawSeed = valueFor('--seed');
  const width = valueFor('--width');
  const height = valueFor('--height');
  const frames = valueFor('--frames');

  if (!imagePath || !prompt) {
    throw new Error(
      [
        'Usage:',
        '  npm run wan:comfy -- --health',
        '  npm run wan:comfy -- --image scene.png --prompt "..." [--output out.mp4] [--width 480] [--height 832] [--frames 49]',
        '  WAN_BACKEND=nim npm run wan:animate -- --image scene.png --video drive.mp4 --prompt "..."'
      ].join('\n')
    );
  }

  const backend = wanBackend();
  if (backend === 'nim' && !videoPath) {
    throw new Error('NIM backend needs --video / --drive');
  }

  const result = await wanRemoteAnimate({
    imagePath: path.resolve(imagePath),
    prompt,
    ...(videoPath ? { videoPath: path.resolve(videoPath) } : {}),
    ...(outputPath ? { outputPath: path.resolve(outputPath) } : {}),
    ...(rawSeed ? { seed: Number(rawSeed) } : {}),
    ...(width ? { width: Number(width) } : {}),
    ...(height ? { height: Number(height) } : {}),
    ...(frames ? { frames: Number(frames) } : {})
  });
  console.log(`Created: ${result}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
