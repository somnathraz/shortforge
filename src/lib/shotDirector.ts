import type { Episode } from '../schema/episode.js';
import type { NarrationTimeline } from '../audio/narration-timeline.js';
import { resolveHookVisualPrompt } from './sceneImage.js';

export type ProductionShot = {
  id: string; sceneId: number; kind: string; startSecond: number; durationSeconds: number;
  visualPrompt: string; camera: string; subjectMotion: string; environmentMotion: string;
  negativeMotion: string;
};
export type ProductionPlan = {
  version: 1; episodeId: string; storyScenes: number; durationSeconds: number;
  timingMethod: string; shots: ProductionShot[];
};

/** Deterministic coverage plan; audio and captions retain their original continuous timeline. */
export function directShots(episode: Episode, timeline: NarrationTimeline): ProductionPlan {
  const shots: ProductionShot[] = [];
  const cameras = ['medium action shot, slow tracking move', 'close reaction shot, restrained push-in',
    'wide spatial reveal, slow pull-back', 'detail insert, locked camera'];
  let cursor = 0;
  for (const [index, section] of timeline.scenes.entries()) {
    const end = index === timeline.scenes.length - 1 ? timeline.narrationDurationSeconds
      : timeline.scenes[index + 1]!.startSecond;
    const duration = end - cursor;
    if (!(duration > 0)) throw new Error('Narration timeline must have positive contiguous sections');
    const count = Math.min(4, Math.max(section.kind === 'scene' ? 2 : 1, Math.round(duration / 3)));
    for (let part = 0; part < count; part++) {
      const start = cursor + duration * part / count;
      const camera = cameras[part % cameras.length]!;
      shots.push({ id: `shot-${String(shots.length + 1).padStart(3, '0')}`,
        sceneId: section.kind === 'spokenHook' ? 0 : section.kind === 'ending' ? -1 : Number(section.id),
        kind: section.kind || 'scene', startSecond: start, durationSeconds: duration / count,
        visualPrompt: `${section.kind === 'spokenHook' ? resolveHookVisualPrompt(episode) : section.visualPrompt}. Coverage: ${camera}. Preserve the same moment, cast and location; do not invent new story events.`,
        camera, subjectMotion: 'Continue the depicted action with restrained natural movement; stable face, costume and anatomy.',
        environmentMotion: 'Subtle physically consistent movement of existing cloth, hair and atmospheric elements only.',
        negativeMotion: 'face morphing, identity changes, extra limbs, flicker, camera shake, abrupt cuts, text, logos, new characters'
      });
    }
    cursor = end;
  }
  return { version: 1, episodeId: episode.id, storyScenes: episode.scenes.length,
    durationSeconds: cursor, timingMethod: timeline.method, shots };
}
