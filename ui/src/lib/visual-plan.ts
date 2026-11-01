import type { EpisodeDetail, SelectedAssets } from './types';
import { hasSpokenHook, spokenHookDisplayText as spokenHookText } from './spoken-hook';
import { fitVisualTimings, visualSource } from '../../../src/lib/sceneVisualPlan';
export { requiredImageIds, visualSource, needsSceneImage } from '../../../src/lib/sceneVisualPlan';

export function visualRows(detail: EpisodeDetail, selected: SelectedAssets) {
  const episode = detail.episode;
  const rows = [
    ...(hasSpokenHook(episode.spokenHook) ? [{ id: 0, label: 'Opening hook', text: spokenHookText(episode.spokenHook), renderMode: 'STILL', durationSeconds: episode.spokenHookDurationSeconds || 5 }] : []),
    ...episode.scenes.map((scene) => ({ id: scene.id, label: `Scene ${scene.id}`, text: scene.narrationHi, renderMode: scene.renderMode, durationSeconds: scene.durationSeconds })),
    ...(episode.ending.payoffHi ? [{ id: -1, label: 'Ending', text: episode.ending.payoffHi, renderMode: 'STILL', durationSeconds: 3 }] : [])
  ].map((row) => ({ ...row, startSecond: 0, durationSeconds: detail.visualTimeline?.find((slot) => slot.id === row.id)?.durationSeconds ?? row.durationSeconds }));
  return fitVisualTimings(rows, selected.sceneVisuals);
}

function hasTechVisualForRow(detail: EpisodeDetail, rowId: number): boolean {
  if (rowId === 0) return Boolean(detail.episode.hookTechVisual);
  if (rowId === -1) {
    return Boolean(detail.episode.scenes.at(-1)?.techVisual);
  }
  return Boolean(detail.episode.scenes.find((scene) => scene.id === rowId)?.techVisual);
}

export function missingVisuals(detail: EpisodeDetail, selected: SelectedAssets, requireClips = false): string[] {
  let rows;
  try { rows = visualRows(detail, selected); } catch (error) { return [String(error instanceof Error ? error.message : error)]; }
  return rows.flatMap((row) => {
    // Deterministic tech diagrams are generated at render time — no still/clip pick needed.
    if (hasTechVisualForRow(detail, row.id)) return [];
    const source = visualSource(row.id, row.renderMode, selected.sceneVisuals);
    const key = row.id === -1 ? detail.episode.scenes.at(-1)!.id : row.id;
    const image = selected.images?.[key] || detail.assets.images.find((asset) => asset.sceneId === key)?.imagePath;
    const clip = selected.clips?.[row.id];
    const allClips = detail.assets.images.flatMap((asset) => asset.clipCandidates || []);
    if (source === 'upload' || (source === 'ai' && requireClips)) {
      if (!clip || !allClips.some((asset) => asset.path === clip)) return [`${row.label}: select a video`];
    } else if (!image && !(source === 'ai' && clip)) return [`${row.label}: select an image`];
    return [];
  });
}
