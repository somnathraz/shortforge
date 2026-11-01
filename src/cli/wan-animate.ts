#!/usr/bin/env node
import '../lib/loadEnv.js';
import { animateWithWanNim, checkWanNimHealth } from '../providers/wan-nim.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  if (args.includes('--health')) {
    console.log(`Wan NIM is ready at ${await checkWanNimHealth()}`);
    return;
  }

  const imagePath = valueFor('--image');
  const videoPath = valueFor('--video');
  const prompt = valueFor('--prompt');
  const outputPath = valueFor('--output');
  const rawSeed = valueFor('--seed');
  if (!imagePath || !videoPath || !prompt) {
    throw new Error('Usage: npm run wan:animate -- --image character.png --video driving.mp4 --prompt "Movement description" [--output result.mp4] [--seed 0]');
  }

  const result = await animateWithWanNim({
    imagePath,
    videoPath,
    prompt,
    ...(outputPath ? { outputPath } : {}),
    ...(rawSeed ? { seed: Number(rawSeed) } : {})
  });
  console.log(`Created: ${result}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
