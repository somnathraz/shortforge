import type { TechReel } from '../schema/techReel.js';
import { phraseMatches, phraseTokens } from './phraseTokens';

export type CaptionWord = { text: string; start: number; end: number };
export type TechReelProps = { reel: TechReel; captions: CaptionWord[] };
export type DiagramNode = TechReel['nodes'][number];
export const REEL_FPS = 30;
export function beatFrames(reel: TechReel): number[] {
  return reel.beats.map(beat => Math.max(1, Math.round(beat.durationSeconds * REEL_FPS)));
}
export function reelFrames(reel: TechReel): number {
  return beatFrames(reel).reduce((a, b) => a + b, 0);
}
export function beatAt(reel: TechReel, frame: number) {
  const frames = beatFrames(reel);
  let start = 0;
  for (let index = 0; index < frames.length; index++) {
    const duration = frames[index]!;
    if (frame < start + duration || index === frames.length - 1) return { index, start, duration, local: Math.max(0, frame - start) };
    start += duration;
  }
  throw new Error('A reel requires at least one beat');
}
export function nodeStateAt(reel: TechReel, index: number): DiagramNode[] {
  return reel.nodes.map(node => {
    let state: DiagramNode = { opacity: 1, load: 0, color: '#8d9be8', ...node };
    for (let i = 0; i <= index; i++) {
      const patch = Object.fromEntries(Object.entries(reel.beats[i]?.nodes[node.id] || {}).filter(([, value]) => value !== undefined)) as Partial<DiagramNode>;
      state = { ...state, ...patch };
      for (const cue of reel.beats[i]?.cues || []) {
        const cuePatch = Object.fromEntries(Object.entries(cue.nodes[node.id] || {}).filter(([, value]) => value !== undefined));
        state = { ...state, ...cuePatch };
      }
    }
    return state;
  });
}

export const motionEase = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
type NodePatch = TechReel['beats'][number]['nodes'];
export type MotionEvent = { frame: number; duration: number; nodes: NodePatch; flows?: TechReel['beats'][number]['flows']; onPhrase?: string };

/** Narrated reels require real word alignment. Only silent previews estimate cue timing. */
export function motionEvents(reel: TechReel, captions: CaptionWord[], index: number): MotionEvent[] {
  const beat = reel.beats[index]!;
  const start = beatFrames(reel).slice(0, index).reduce((a, b) => a + b, 0) / REEL_FPS;
  const spoken = captions.filter(word => word.start >= start - 0.001 && word.start < start + beat.durationSeconds - 0.001);
  const tokens = spoken.map(word => phraseTokens(word.text).join(''));
  const script = phraseTokens(beat.narration);
  return [{ frame: 0, duration: 26, nodes: beat.nodes, flows: beat.flows }, ...(beat.cues || []).map(cue => {
    const matches = phraseMatches(captions.length ? tokens : script, cue.onPhrase);
    if (matches.length !== 1) throw new Error(`Cannot align cue "${cue.onPhrase}" in ${beat.id}; check narration and word timing`);
    const second = captions.length ? spoken[matches[0]!]!.start - start : matches[0]! / script.length * beat.durationSeconds;
    const frame = Math.max(0, Math.round(second * REEL_FPS));
    const remaining = Math.round(beat.durationSeconds * REEL_FPS) - frame;
    return { frame, duration: Math.max(1, Math.min(remaining, Math.round(cue.transitionSeconds * REEL_FPS))), nodes: cue.nodes, ...(cue.flows !== undefined ? { flows: cue.flows } : {}), onPhrase: cue.onPhrase };
  })];
}

/** Per-property transitions keep simultaneous CPU/RAM/queue actions independent and seekable. */
export function animatedNodesAt(reel: TechReel, index: number, local: number, events: MotionEvent[]): DiagramNode[] {
  return nodeStateAt(reel, index - 1).map(initial => {
    let state: DiagramNode = { scale: 1, memoryUsed: 0, queueDepth: 0, ...initial };
    const transitions = new Map<string, { from: number; to: number; start: number; duration: number }>();
    const evaluate = (at: number): DiagramNode => {
      const next = { ...state };
      for (const [key, value] of transitions) Object.assign(next, { [key]: value.from + (value.to - value.from) * motionEase((at - value.start) / value.duration) });
      return next;
    };
    for (const event of events) {
      if (event.frame > local) continue;
      const from = evaluate(event.frame);
      for (const [key, value] of Object.entries(event.nodes[initial.id] || {})) {
        if (value === undefined) continue;
        const old = from[key as keyof DiagramNode];
        Object.assign(state, { [key]: value });
        if (typeof old === 'number' && typeof value === 'number') transitions.set(key, { from: old, to: value, start: event.frame, duration: event.duration });
        else transitions.delete(key);
      }
    }
    return evaluate(local);
  });
}

export function finalFlows(reel: TechReel, index: number): TechReel['beats'][number]['flows'] {
  const beat = reel.beats[index];
  if (!beat) return [];
  return [...(beat.cues || [])].reverse().find(cue => cue.flows !== undefined)?.flows ?? beat.flows;
}
export function flowLayersAt(reel: TechReel, index: number, local: number, events: MotionEvent[]) {
  let previous = finalFlows(reel, index - 1);
  let current = previous;
  let progress = 1;
  for (const event of events) {
    if (event.frame > local || event.flows === undefined) continue;
    previous = current; current = event.flows;
    progress = motionEase((local - event.frame) / event.duration);
  }
  return { previous, current, progress };
}

export const previewReel: TechReel = {
  version: 1, brandId: 'tech-instagram', id: 'preview', title: 'System design', accent: '#efc373', style: 'orbital', voice: 'TECH_ENGLISH_INDIA', lang: 'en',
  nodes: [{ id: 'app', kind: 'server', label: 'APP', x: 540, y: 660 }, { id: 'db', kind: 'database', label: 'POSTGRES', x: 540, y: 1060 }],
  beats: [{ id: 'intro', chapter: 'SYSTEM DESIGN', headline: 'Follow the request.', subhead: 'Persistent diagrams · purposeful motion', narration: 'Follow the request.', durationSeconds: 6, nodes: {}, flows: [{ from: 'app', to: 'db', color: '#efc373', packets: 3, speed: 0.5, bend: 0 }] }],
};
