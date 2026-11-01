/** Shared, browser-safe visual plan. 0 = spoken hook, -1 = ending. */
export type SceneVisual = {
  source: 'image' | 'upload' | 'ai';
  durationSeconds?: number | undefined;
  trimStartSeconds?: number | undefined;
  shortClip?: 'freeze' | 'loop' | undefined;
};
export type SceneVisuals = Record<string, SceneVisual>;

export function visualSource(
  id: number, renderMode: string | undefined, visuals?: SceneVisuals
): SceneVisual['source'] {
  return visuals?.[String(id)]?.source ?? (renderMode === 'AI_VIDEO' ? 'ai' : 'image');
}

export type VisualTiming = { id: number; startSecond: number; durationSeconds: number };

/** Fixed visual windows do not retime speech; remaining pictures share the remaining audio. */
export function fitVisualTimings<T extends VisualTiming>(slots: T[], visuals?: SceneVisuals): T[] {
  const total = slots.reduce((sum, slot) => sum + slot.durationSeconds, 0);
  const fixed = slots.reduce((sum, slot) => sum + (visuals?.[slot.id]?.durationSeconds ?? 0), 0);
  const flexible = slots.filter((slot) => visuals?.[slot.id]?.durationSeconds === undefined);
  if ((flexible.length && total - fixed < flexible.length * 0.1) ||
      (!flexible.length && Math.abs(total - fixed) > 0.05)) {
    throw new Error(`Visual durations must fit the ${total.toFixed(1)}s narration. Leave some sections on Auto or shorten the fixed durations.`);
  }
  const weight = flexible.reduce((sum, slot) => sum + slot.durationSeconds, 0);
  let cursor = 0;
  return slots.map((slot, index) => {
    const duration = visuals?.[slot.id]?.durationSeconds ?? (slot.durationSeconds / weight) * (total - fixed);
    const next = { ...slot, startSecond: cursor, durationSeconds: index === slots.length - 1 ? total - cursor : duration };
    cursor += next.durationSeconds;
    return next;
  });
}

/** True when this section still needs a generated / selected still (not an uploaded or locked video). */
export function needsSceneImage(
  id: number,
  renderMode: string | undefined,
  visuals?: SceneVisuals,
  clips?: Record<string, string>,
  /** When true, deterministic techVisual covers this slot — no AI still required. */
  hasTechVisual?: boolean
): boolean {
  if (hasTechVisual) return false;
  const source = visualSource(id, renderMode, visuals);
  if (source === 'upload') return false;
  if (source === 'ai' && clips?.[String(id)]) return false;
  return true;
}

/**
 * Image ids to generate. Upload / selected-video sections are skipped.
 * Ending stills reuse the last image-plan scene — never force image gen for a video section.
 */
export function requiredImageIds(
  scenes: Array<{ id: number; renderMode: string; techVisual?: unknown }>,
  hasHook: boolean,
  hasEnding: boolean,
  visuals?: SceneVisuals,
  clips?: Record<string, string>,
  opts?: { hookTechVisual?: unknown }
): number[] {
  const ids = scenes
    .filter((scene) =>
      needsSceneImage(scene.id, scene.renderMode, visuals, clips, Boolean(scene.techVisual))
    )
    .map((scene) => scene.id);
  if (hasHook && needsSceneImage(0, undefined, visuals, clips, Boolean(opts?.hookTechVisual))) {
    ids.unshift(0);
  }
  if (hasEnding && needsSceneImage(-1, undefined, visuals, clips)) {
    const donor = [...scenes].reverse().find((scene) =>
      needsSceneImage(scene.id, scene.renderMode, visuals, clips, Boolean(scene.techVisual))
    );
    if (donor) ids.push(donor.id);
  }
  return [...new Set(ids)];
}

/** Last scene that still uses artwork (for ending / hook fallbacks). */
export function lastImageSceneId(
  scenes: Array<{ id: number; renderMode: string }>,
  visuals?: SceneVisuals,
  clips?: Record<string, string>
): number | undefined {
  return [...scenes].reverse().find((scene) =>
    needsSceneImage(scene.id, scene.renderMode, visuals, clips)
  )?.id ?? [...scenes].reverse().find((scene) =>
    visualSource(scene.id, scene.renderMode, visuals) === 'image'
  )?.id;
}
