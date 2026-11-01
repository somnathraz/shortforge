#!/usr/bin/env node
/**
 * Verify SFX (18) + BGM mood folders (expect 3+ each) are present.
 *
 *   npm run audio:check-library
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import {
  BGM_MOOD_DIRS,
  SFX_LIBRARY,
  bgmMoodDir,
  listBgmTracks,
  resolveSfxPath
} from '../audio/sfx-library.js';
import type { BgmMood } from '../schema/audioPlan.js';

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const cwd = process.cwd();
  let missing = 0;

  console.log('SFX (18)');
  for (const entry of SFX_LIBRARY) {
    const filePath = resolveSfxPath(entry.id, cwd);
    const ok = await exists(filePath);
    console.log(`  ${ok ? '✓' : '✗'} ${entry.relativePath}`);
    if (!ok) missing += 1;
  }

  console.log('\nBGM (3+ per mood folder)');
  for (const mood of Object.keys(BGM_MOOD_DIRS) as BgmMood[]) {
    const dir = bgmMoodDir(mood, cwd);
    const tracks = await listBgmTracks(mood, cwd);
    const ok = tracks.length >= 3;
    const rel = path.relative(cwd, dir);
    console.log(`  ${ok ? '✓' : tracks.length > 0 ? '~' : '✗'} ${rel}/  (${tracks.length} tracks)`);
    for (const track of tracks) {
      console.log(`      ${path.basename(track)}`);
    }
    if (!ok) missing += Math.max(0, 3 - tracks.length);
  }

  console.log('');
  if (missing > 0) {
    console.error(`Library incomplete — ${missing} file(s) still needed. See assets/audio/DOWNLOAD.md`);
    process.exit(1);
  }
  console.log('Library complete.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
