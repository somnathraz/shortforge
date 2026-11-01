#!/usr/bin/env node
import path from 'node:path';
import '../lib/loadEnv.js';
import { renderTechReel } from '../remotion/renderTechReel.js';

const value = (flag: string) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
const storyboard = value('--storyboard');
const tts = value('--tts') || 'elevenlabs';
if (tts !== 'edge' && tts !== 'elevenlabs') throw new Error('--tts must be edge or elevenlabs');
if (!storyboard) {
  console.error('Usage: npm run tech:reel -- --storyboard data/tech-reels/database-scaling.json [--silent] [--prepare-only] [--scale 1]');
  process.exitCode = 1;
} else {
  renderTechReel({ legacyTemplate: process.argv.includes('--legacy-template'), storyboardPath: path.resolve(storyboard), tts, silent: process.argv.includes('--silent'), prepareOnly: process.argv.includes('--prepare-only'), scale: Number(value('--scale') || '1') })
    .then(file => console.log(`Tech reel ready: ${file}`))
    .catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
