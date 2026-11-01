import type { Episode } from '../schema/episode.js';
import type { TechVisual } from '../schema/techVisual.js';
import { isTechEditorialEpisode } from '../visual/tech-editorial-style.js';
import { syncTechVisualToNarration } from './syncNarration.js';
import { resolveSpokenHook } from '../lib/ttsScript.js';

/** Hook uses episode.hookTechVisual; scenes use scene.techVisual. Mythology → undefined. */
export function resolveTechVisualForSlot(
  episode: Episode,
  slotId: number,
  opts?: { narration?: string; syncToSpeech?: boolean }
): TechVisual | undefined {
  if (!isTechEditorialEpisode(episode)) return undefined;
  let visual: TechVisual | undefined;
  let narration = opts?.narration?.trim() || '';
  if (slotId === 0) {
    visual = episode.hookTechVisual;
    narration ||= resolveSpokenHook(episode) || '';
  } else if (slotId === -1) {
    const last = episode.scenes[episode.scenes.length - 1];
    visual = last?.techVisual;
    narration ||= episode.ending.payoffHi.trim();
  } else {
    const scene = episode.scenes.find((item) => item.id === slotId);
    visual = scene?.techVisual;
    narration ||= scene?.narrationHi?.trim() || '';
  }
  if (!visual) return undefined;
  if (opts?.syncToSpeech === false) return visual;
  return syncTechVisualToNarration(visual, narration);
}

export function episodeUsesTechVisuals(episode: Episode): boolean {
  if (!isTechEditorialEpisode(episode)) return false;
  if (episode.hookTechVisual) return true;
  return episode.scenes.some((scene) => Boolean(scene.techVisual));
}
