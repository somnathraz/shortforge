#!/usr/bin/env node
/**
 * Render deterministic techVisual clips for a tech-instagram episode.
 * Mythology episodes are rejected — they stay on the AI-still + FFmpeg path.
 *
 * Usage:
 *   npm run tech:visuals -- --episode data/episodes-tech/….json
 *   npm run tech:visuals -- --episode … --preview   # PNG + SVG at t=1 only
 */
import '../lib/loadEnv.js';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { isTechEditorialEpisode } from '../visual/tech-editorial-style.js';
import { renderTechVisualClip, writeTechVisualPreviewPng } from '../tech-visuals/renderClip.js';
import { resolveTechVisualForSlot } from '../tech-visuals/resolve.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  if (!episodePath) {
    throw new Error(
      'Usage: npm run tech:visuals -- --episode data/episodes-tech/file.json [--preview]'
    );
  }
  const previewOnly = args.includes('--preview');
  const resolved = path.resolve(episodePath);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(resolved, 'utf8')) as unknown);
  if (!isTechEditorialEpisode(episode)) {
    throw new Error('tech:visuals is for tech-instagram / TECH_EDUCATION only');
  }

  const outDir = path.resolve(
    valueFor('--out') || path.join('output', 'tech-visuals', episode.id)
  );
  await mkdir(outDir, { recursive: true });

  const slots: Array<{ id: number; label: string; duration: number }> = [];
  if (episode.hookTechVisual) {
    slots.push({
      id: 0,
      label: 'hook',
      duration: episode.spokenHookDurationSeconds || 4
    });
  }
  for (const scene of episode.scenes) {
    if (scene.techVisual) {
      slots.push({ id: scene.id, label: `scene-${scene.id}`, duration: scene.durationSeconds });
    }
  }

  if (!slots.length) {
    throw new Error('Episode has no hookTechVisual / scene.techVisual fields');
  }

  for (const slot of slots) {
    const visual = resolveTechVisualForSlot(episode, slot.id);
    if (!visual) continue;
    if (previewOnly) {
      const png = path.join(outDir, `${slot.label}.png`);
      await writeTechVisualPreviewPng(visual, png, 1);
      console.log(`preview ${slot.label}: ${png}`);
      continue;
    }
    const mp4 = path.join(outDir, `${slot.label}.mp4`);
    await renderTechVisualClip({
      visual,
      durationSeconds: slot.duration,
      outputPath: mp4
    });
    console.log(`clip ${slot.label}: ${mp4} (${slot.duration}s, ${visual.visualType})`);
  }
  console.log(`Done → ${outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
