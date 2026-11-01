/**
 * Remotion-safe props loader (no node:fs — webpack cannot bundle node: protocol).
 * Studio / default: bundled Day-1 episode.
 * CLI produce: pass --props JSON written by renderTechEpisode.ts
 */
import fallbackEpisode from '../../../data/episodes-tech/1792080056105-big-o-time-and-space-complexity.json';
import type { BigOEpisodeProps, EpisodeSegment } from '../compositions/BigOEpisode';
import type { AnimationStep, VisualData } from './viewState';

type RawVisual = {
  visualType: string;
  visualData?: VisualData;
  animationSteps?: AnimationStep[];
};

type RawScene = {
  id: number;
  durationSeconds: number;
  techVisual?: RawVisual;
};

type RawEpisode = {
  id?: string;
  hookTechVisual?: RawVisual;
  spokenHookDurationSeconds?: number;
  scenes: RawScene[];
};

function toSegment(visual: RawVisual, durationSeconds: number): EpisodeSegment {
  return {
    visualType: visual.visualType,
    visualData: visual.visualData || {},
    animationSteps: visual.animationSteps || [],
    durationSeconds
  };
}

export function segmentsFromEpisode(episode: RawEpisode): EpisodeSegment[] {
  const segments: EpisodeSegment[] = [];
  if (episode.hookTechVisual) {
    segments.push(toSegment(episode.hookTechVisual, episode.spokenHookDurationSeconds || 5));
  }
  for (const scene of episode.scenes || []) {
    if (!scene.techVisual) continue;
    segments.push(toSegment(scene.techVisual, scene.durationSeconds || 6));
  }
  return segments;
}

/** Default props for Studio / when CLI does not pass --props. */
export function loadBigOEpisodeProps(): BigOEpisodeProps {
  return { segments: segmentsFromEpisode(fallbackEpisode as RawEpisode) };
}

export function totalDurationInFrames(props: BigOEpisodeProps, fps = 30): number {
  const seconds = props.segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  return Math.max(1, Math.round((seconds || 58) * fps));
}
