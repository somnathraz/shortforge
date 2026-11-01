import type { Episode } from '../schema/episode.js';
import { narrationSegments } from '../lib/ttsScript.js';
import { probeAudioDuration } from './ffprobe.js';

export type AlignedSceneTiming = {
  id: string | number;
  startSecond: number;
  durationSeconds: number;
  narrationHi: string;
  visualPrompt: string;
  camera: string;
  importance: number;
  soundCue: string;
  kind?: 'spokenHook' | 'scene' | 'ending';
};

export type NarrationTimeline = {
  scenes: AlignedSceneTiming[];
  /** Hook segment when spokenHook exists (also included in scenes[0] when kind=spokenHook). */
  spokenHook?: AlignedSceneTiming;
  narrationDurationSeconds: number;
  method: 'narration-aligned' | 'scene-planned';
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function timingFromSegment(
  episode: Episode,
  segment: ReturnType<typeof narrationSegments>[number],
  startSecond: number,
  durationSeconds: number
): AlignedSceneTiming {
  if (segment.kind === 'spokenHook') {
    const first = episode.scenes[0];
    return {
      id: 'spokenHook',
      kind: 'spokenHook',
      startSecond: round2(startSecond),
      durationSeconds: round2(durationSeconds),
      narrationHi: segment.text,
      visualPrompt: first?.visualPrompt || 'Opening mythology hook visual',
      camera: first?.camera || 'slow push-in',
      importance: Math.max(8, first?.importance || 8),
      soundCue: first?.soundCue || 'subtle curiosity whoosh'
    };
  }

  if (segment.kind === 'ending') {
    const last = episode.scenes[episode.scenes.length - 1];
    return {
      id: 'ending',
      kind: 'ending',
      startSecond: round2(startSecond),
      durationSeconds: round2(durationSeconds),
      narrationHi: segment.text,
      visualPrompt: last?.visualPrompt || 'Closing mythology visual',
      camera: last?.camera || 'slow pull-back',
      importance: last?.importance || 7,
      soundCue: last?.soundCue || 'soft conclusive swell'
    };
  }

  const scene = episode.scenes.find((item) => item.id === segment.id) || episode.scenes[0]!;
  return {
    id: scene.id,
    kind: 'scene',
    startSecond: round2(startSecond),
    durationSeconds: round2(durationSeconds),
    narrationHi: scene.narrationHi,
    visualPrompt: scene.visualPrompt,
    camera: scene.camera,
    importance: scene.importance,
    soundCue: scene.soundCue
  };
}

function plannedAligned(episode: Episode): AlignedSceneTiming[] {
  return narrationSegments(episode).map((segment) =>
    timingFromSegment(
      episode,
      segment,
      segment.plannedStartSecond,
      segment.plannedDurationSeconds
    )
  );
}

/**
 * Map narration segments onto real TTS length (char-weighted).
 * spokenHook is always first when present; scenes shift after it; ending is last.
 * Falls back to planned scene starts if narration cannot be probed.
 */
export async function buildNarrationTimeline(
  episode: Episode,
  narrationPath?: string
): Promise<NarrationTimeline> {
  const planned = plannedAligned(episode);
  const plannedTotal = planned.reduce((sum, sc) => sum + sc.durationSeconds, 0);

  if (!narrationPath) {
    const spokenHook = planned.find((item) => item.kind === 'spokenHook');
    return {
      scenes: planned,
      ...(spokenHook ? { spokenHook } : {}),
      narrationDurationSeconds: plannedTotal,
      method: 'scene-planned'
    };
  }

  let narrationDurationSeconds: number;
  try {
    narrationDurationSeconds = await probeAudioDuration(narrationPath);
  } catch {
    const spokenHook = planned.find((item) => item.kind === 'spokenHook');
    return {
      scenes: planned,
      ...(spokenHook ? { spokenHook } : {}),
      narrationDurationSeconds: plannedTotal,
      method: 'scene-planned'
    };
  }

  const segments = narrationSegments(episode);
  // Word-count weighting tracks spoken English timing better than raw character length
  // (long words / punctuation were stretching some scenes and making visuals feel late).
  const weights = segments.map((segment) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(4, words);
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let cursor = 0;

  const scenes: AlignedSceneTiming[] = segments.map((segment, index) => {
    const durationSeconds =
      index === segments.length - 1
        ? Math.max(0.05, narrationDurationSeconds - cursor)
        : (weights[index]! / totalWeight) * narrationDurationSeconds;
    const startSecond = cursor;
    cursor += durationSeconds;
    return timingFromSegment(episode, segment, startSecond, durationSeconds);
  });

  const spokenHook = scenes.find((item) => item.kind === 'spokenHook');
  return {
    scenes,
    ...(spokenHook ? { spokenHook } : {}),
    narrationDurationSeconds: round2(narrationDurationSeconds),
    method: 'narration-aligned'
  };
}
