/**
 * Wan I2V targets: opening hook (0), story scenes, ending (-1).
 * Shared by UI + sceneVideo pipeline.
 */

export type WanVideoSlot = {
  id: number;
  label: string;
  durationSeconds: number;
  startSecond: number;
  renderMode: 'STILL' | 'AI_VIDEO';
  narrationHi: string;
  visualPrompt: string;
  videoPrompt?: string;
  videoNegativePrompt?: string;
  camera: string;
};

/** Minimal episode shape so UI + server can share this helper. */
export type WanEpisodeLike = {
  spokenHook?: unknown;
  spokenHookDurationSeconds?: number;
  hookVisualPrompt?: string;
  scenes: Array<{
    id: number;
    startSecond: number;
    durationSeconds: number;
    narrationHi: string;
    visualPrompt: string;
    videoPrompt?: string;
    videoNegativePrompt?: string;
    camera: string;
    renderMode: 'STILL' | 'AI_VIDEO' | string;
  }>;
  ending?: { payoffHi?: string };
};

function hookText(episode: WanEpisodeLike): string {
  const hook = episode.spokenHook;
  if (typeof hook === 'string') return hook;
  if (hook && typeof hook === 'object' && 'textHi' in hook) {
    return String((hook as { textHi?: string }).textHi || '');
  }
  return '';
}

function hasHook(episode: WanEpisodeLike): boolean {
  return hookText(episode).trim().length > 0;
}

/** Build the list shown in Scene videos · Wan (hook → scenes → ending). */
export function listWanVideoSlots(episode: WanEpisodeLike): WanVideoSlot[] {
  const slots: WanVideoSlot[] = [];
  let cursor = 0;

  if (hasHook(episode)) {
    const durationSeconds = episode.spokenHookDurationSeconds || 5;
    const visual =
      episode.hookVisualPrompt?.trim() ||
      `Cinematic vertical 9:16 opening for: ${hookText(episode)}`;
    slots.push({
      id: 0,
      label: 'Opening hook',
      durationSeconds,
      startSecond: cursor,
      renderMode: 'STILL',
      narrationHi: hookText(episode),
      visualPrompt: visual,
      videoPrompt: `Subtle cinematic motion from the opening hook still. Camera: slow push in. Preserve faces, clothing, and sacred details. Animate lightly — candle flicker, fabric, particles.`,
      camera: 'slow push in'
    });
    cursor += durationSeconds;
  }

  for (const scene of episode.scenes) {
    slots.push({
      id: scene.id,
      label: `Scene ${scene.id}`,
      durationSeconds: scene.durationSeconds,
      startSecond: scene.startSecond,
      renderMode: scene.renderMode === 'AI_VIDEO' ? 'AI_VIDEO' : 'STILL',
      narrationHi: scene.narrationHi,
      visualPrompt: scene.visualPrompt,
      ...(scene.videoPrompt ? { videoPrompt: scene.videoPrompt } : {}),
      ...(scene.videoNegativePrompt ? { videoNegativePrompt: scene.videoNegativePrompt } : {}),
      camera: scene.camera
    });
    cursor = scene.startSecond + scene.durationSeconds;
  }

  if (episode.ending?.payoffHi?.trim()) {
    const last = episode.scenes.at(-1);
    slots.push({
      id: -1,
      label: 'Ending',
      durationSeconds: 3,
      startSecond: cursor,
      renderMode: 'STILL',
      narrationHi: episode.ending.payoffHi,
      visualPrompt:
        last?.visualPrompt ||
        `Cinematic vertical 9:16 ending still for: ${episode.ending.payoffHi}`,
      videoPrompt: `Gentle closing motion on the ending still. Camera: slow pull back. Soft light pulse. Preserve identity and sacred details.`,
      camera: 'slow pull back',
      ...(last?.videoNegativePrompt ? { videoNegativePrompt: last.videoNegativePrompt } : {})
    });
  }

  return slots;
}

export function findWanSlot(episode: WanEpisodeLike, slotId: number): WanVideoSlot | undefined {
  return listWanVideoSlots(episode).find((slot) => slot.id === slotId);
}

export function wanSlotMotionPrompt(slot: WanVideoSlot): string {
  const dedicated = slot.videoPrompt?.trim();
  if (dedicated) return dedicated;
  return `${slot.visualPrompt}. Camera: ${slot.camera}. Animate naturally. Preserve faces, clothing and character identity.`;
}

export function wanSlotMotionNegative(slot: WanVideoSlot): string {
  return (
    slot.videoNegativePrompt?.trim() ||
    (typeof process !== 'undefined' ? process.env.WAN_COMFY_NEGATIVE?.trim() : undefined) ||
    'facial deformation, extra fingers, extra limbs, warped hands, changing identity, morphing faces, changing clothes, frame flicker, floating objects, unnatural body movement, text, subtitles, logo, watermark'
  );
}
