import { z } from 'zod';
import { TECH_REEL_THEME, TECH_REEL_PALETTE } from '../visual/techReelTheme.js';
import { TECH_REEL_ELEMENT_KINDS } from '../visual/techReelElements.js';
import { isKnownTechReelTemplate } from '../visual/techReelTemplates.js';
import { phraseMatches, phraseTokens } from '../remotion/phraseTokens.js';
import { TECH_DEFAULT_VOICE_PROFILE, isTechVoiceProfileId } from '../lib/techVoiceProfile.js';

const Id = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NodeState = z.object({
  x: z.number().min(80).max(1000).optional(),
  y: z.number().min(440).max(1370).optional(),
  opacity: z.number().min(0).max(1).optional(),
  load: z.number().min(0).max(1).optional(),
  color: Color.optional(),
  label: z.string().max(24).optional(),
  detail: z.string().max(30).optional(),
  scale: z.number().min(0.5).max(2.5).optional(),
  cores: z.number().int().min(1).max(64).optional(),
  memoryGb: z.number().int().min(1).max(1024).optional(),
  memoryUsed: z.number().min(0).max(1).optional(),
  queueDepth: z.number().int().min(0).max(24).optional(),
  status: z.enum(['online', 'offline']).optional(),
  labelPlacement: z.enum(['above', 'below']).optional(),
}).strict();
const Node = NodeState.extend({
  id: Id,
  kind: z.enum(TECH_REEL_ELEMENT_KINDS),
  coreSlots: z.number().int().min(1).max(64).optional(),
  memorySlots: z.number().int().min(1).max(16).optional(),
  memoryUnitGb: z.number().int().min(1).max(256).optional(),
  label: z.string().min(1).max(24),
  x: z.number().min(80).max(1000),
  y: z.number().min(440).max(1370),
}).strict();
const Flow = z.object({
  from: Id,
  to: Id,
  color: Color.default('#8d9be8'),
  packets: z.number().int().min(0).max(12).default(3),
  speed: z.number().min(0.1).max(3).default(0.5),
  bend: z.number().min(-200).max(200).default(0),
  lanes: z.number().int().min(1).max(7).optional(),
  spread: z.number().min(40).max(400).optional(),
}).strict();

const Cue = z.object({
  onPhrase: z.string().min(1).max(100),
  transitionSeconds: z.number().min(0.2).max(2.5).default(1),
  nodes: z.record(Id, NodeState).default({}),
  flows: z.array(Flow).max(100).optional(),
}).strict();

/** Deliberately separate from EpisodeSchema: never changes mythology or legacy DSA rendering. */
export const TechReelSchema = z.object({
  version: z.literal(1),
  /** Must name a tech-kind pipeline; checked server-side (assertTechReelBrand) — this schema is browser-shared. */
  brandId: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  id: Id,
  title: z.string().min(1).max(90),
  accent: Color.default(TECH_REEL_THEME.accent),
  style: z.enum(['editorial', 'orbital', 'scale-lab', 'window-lab']).default('orbital'),
  /** Locked voice profile id (TECH_ENGLISH_INDIA / TECH_HINDI) — never a raw ElevenLabs voice id. */
  voice: z.string().min(1).default(TECH_DEFAULT_VOICE_PROFILE),
  lang: z.string().min(1).default('en'),
  sourceReview: z.object({
    status: z.enum(['NEEDS_REVIEW', 'VERIFIED']),
    learningGoal: z.string().min(1).max(240),
    caveat: z.string().min(1).max(300),
    claims: z.array(z.object({ claim: z.string().min(1).max(400), sourceUrl: z.url().optional() }).strict()).min(1).max(12),
  }).strict().optional(),
  nodes: z.array(Node).min(1).max(40),
  beats: z.array(z.object({
    id: Id,
    chapter: z.string().min(1).max(32),
    headline: z.string().min(1).max(64),
    subhead: z.string().max(90).default(''),
    narration: z.string().min(1).max(700),
    durationSeconds: z.number().min(2).max(30),
    nodes: z.record(Id, NodeState).default({}),
    flows: z.array(Flow).max(100).default([]),
    cues: z.array(Cue).max(8).optional(),
    metric: z.object({ label: z.string().max(32), value: z.string().max(40) }).strict().optional(),
    /**
     * Scene template id from the TS registry (e.g. window.array).
     * Create the .tsx first (`npm run tech:template:scaffold`), then set this id.
     */
    template: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/).max(64).optional(),
    /** Extra props for scene templates (e.g. mobility.map). */
    templateProps: z.record(z.string(), z.unknown()).optional(),
    hardware: z.object({
      cores: z.number().int().min(1).max(64),
      memoryGb: z.number().int().min(1).max(1024),
      demand: z.number().min(0).max(1),
      capacity: z.number().min(0.05).max(1),
      stage: z.enum(['normal', 'upgrade', 'ceiling', 'restart', 'compare']).default('normal'),
    }).optional(),
    /** Physical window-lab diagram (conveyor tokens + sliding frame). */
    window: z.object({
      values: z.array(z.number().int().min(-99).max(99)).min(3).max(10),
      windowStart: z.number().int().min(0).max(9),
      windowSize: z.number().int().min(1).max(6),
      left: z.number().int().min(0).max(9).optional(),
      right: z.number().int().min(0).max(9).optional(),
      sum: z.number().int().min(-999).max(999).optional(),
      stage: z.enum(['nested', 'frame', 'slide', 'update', 'compare', 'pointers', 'cta']).default('frame'),
    }).optional(),
  }).strict()).min(1).max(24),
}).strict().superRefine((reel, ctx) => {
  const ids = new Set(reel.nodes.map(n => n.id));
  const resourceStates = new Map(reel.nodes.map(node => [node.id, { ...node }]));
  const checkCapacity = (node: z.infer<typeof Node>, path: (string | number)[]) => {
    if (node.kind !== 'compute') return;
    if ((node.cores || 1) > (node.coreSlots || 16)) ctx.addIssue({ code: 'custom', path, message: 'cores exceeds the compute element coreSlots; reserve slots for the largest state' });
    if ((node.memoryGb || 8) > (node.memorySlots || 8) * (node.memoryUnitGb || 8)) ctx.addIssue({ code: 'custom', path, message: 'memoryGb exceeds memorySlots × memoryUnitGb; reserve modules for the largest state' });
  };
  reel.nodes.forEach((node, i) => checkCapacity(node, ['nodes', i]));
  if (ids.size !== reel.nodes.length) ctx.addIssue({ code: 'custom', path: ['nodes'], message: 'Node IDs must be unique' });
  if (new Set(reel.beats.map(b => b.id)).size !== reel.beats.length) ctx.addIssue({ code: 'custom', path: ['beats'], message: 'Beat IDs must be unique' });
  reel.beats.forEach((beat, i) => {
    for (const patch of [beat.nodes, ...(beat.cues || []).map(cue => cue.nodes)]) {
      for (const [id, change] of Object.entries(patch)) {
        const before = resourceStates.get(id);
        if (!before) continue;
        const next = { ...before, ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)) };
        resourceStates.set(id, next);
        checkCapacity(next, ['beats', i, 'nodes', id]);
      }
    }
    let lastPhrase = -1;
    for (const [j, cue] of (beat.cues || []).entries()) {
      const matches = phraseMatches(phraseTokens(beat.narration), cue.onPhrase);
      if (matches.length !== 1 || matches[0]! <= lastPhrase) ctx.addIssue({ code: 'custom', path: ['beats', i, 'cues', j, 'onPhrase'], message: 'Cue phrase must occur exactly once in narration; cues must follow spoken order' });
      lastPhrase = matches[0] ?? lastPhrase;
      if (!Object.keys(cue.nodes).length && cue.flows === undefined) ctx.addIssue({ code: 'custom', path: ['beats', i, 'cues', j], message: 'A cue must change nodes or flows' });
      for (const id of Object.keys(cue.nodes)) if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['beats', i, 'cues', j, 'nodes'], message: `Unknown node ${id}` });
      for (const flow of cue.flows || []) if (!ids.has(flow.from) || !ids.has(flow.to) || flow.from === flow.to) ctx.addIssue({ code: 'custom', path: ['beats', i, 'cues', j, 'flows'], message: 'Flows require two distinct existing nodes' });
    }
    if (beat.template && !isKnownTechReelTemplate(beat.template)) {
      ctx.addIssue({
        code: 'custom',
        path: ['beats', i, 'template'],
        message: `Unknown template "${beat.template}". Create it first: npm run tech:template:scaffold -- --id ${beat.template}`
      });
    }
    if (beat.template === 'window.array' && !beat.window) {
      ctx.addIssue({ code: 'custom', path: ['beats', i, 'window'], message: 'window.array requires beat.window' });
    }
    if (beat.template === 'scale.machine' && !beat.hardware) {
      ctx.addIssue({ code: 'custom', path: ['beats', i, 'hardware'], message: 'scale.machine requires beat.hardware' });
    }
    const usingTemplates = reel.beats.every((b) => Boolean(b.template));
    if (!usingTemplates && reel.style === 'scale-lab' && !beat.hardware) {
      ctx.addIssue({ code: 'custom', path: ['beats', i, 'hardware'], message: 'Scale Lab requires hardware settings for every beat' });
    }
    if (!usingTemplates && reel.style === 'window-lab' && !beat.window) {
      ctx.addIssue({ code: 'custom', path: ['beats', i, 'window'], message: 'Window Lab requires window settings for every beat' });
    }
    if (beat.window && beat.window.windowStart + beat.window.windowSize > beat.window.values.length) {
      ctx.addIssue({ code: 'custom', path: ['beats', i, 'window'], message: 'windowStart + windowSize exceeds values length' });
    }
    for (const id of Object.keys(beat.nodes)) if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['beats', i, 'nodes'], message: `Unknown node ${id}` });
    for (const flow of beat.flows) if (!ids.has(flow.from) || !ids.has(flow.to) || flow.from === flow.to) ctx.addIssue({ code: 'custom', path: ['beats', i, 'flows'], message: 'Flows require two distinct existing nodes' });
  });
});

export type TechReel = z.infer<typeof TechReelSchema>;

/** True when every beat points at a registered Remotion scene template (TS created first). */
export function isSceneTemplateReel(reel: Pick<TechReel, 'beats'>): boolean {
  return reel.beats.length > 0 && reel.beats.every((beat) => Boolean(beat.template) && isKnownTechReelTemplate(beat.template!));
}

/**
 * Studio / new-script contract.
 * - Default: locked Request Coalescing / orbital identity.
 * - Scene-template path: every beat has a known `template` id (create TS first, then upload JSON).
 */
export const TechReelAuthoringSchema = TechReelSchema.superRefine((reel, ctx) => {
  const error = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const templated = isSceneTemplateReel(reel);

  if (!templated) {
    if (reel.style !== TECH_REEL_THEME.style) error(['style'], 'New tech reels must use orbital (Request Coalescing template)');
    if (reel.accent !== TECH_REEL_THEME.accent) error(['accent'], 'The channel accent is locked to #efc373');
    if (reel.lang !== 'en') error(['lang'], 'Tech channel default is simple English (lang: en)');
    if (reel.voice !== TECH_DEFAULT_VOICE_PROFILE) {
      error(['voice'], 'Tech channel default voice profile is TECH_ENGLISH_INDIA (Rahul Bharadwaj). Do not put ElevenLabs voice ids in JSON.');
    }
  } else if (reel.voice && !isTechVoiceProfileId(reel.voice) && !/^hi[-_]/i.test(reel.voice) && reel.voice !== 'en-US-GuyNeural') {
    // Allow legacy Neural names on old templated samples; reject raw ElevenLabs ids.
    if (/^[a-zA-Z0-9]{20,}$/.test(reel.voice)) {
      error(['voice'], 'Use voice profile TECH_ENGLISH_INDIA or TECH_HINDI — not a raw ElevenLabs voice id');
    }
  }

  if (!reel.sourceReview) error(['sourceReview'], 'Include a learning goal, caveat, and claims for review');
  if (reel.beats.length < 5 || reel.beats.length > 9) error(['beats'], 'Write 5–9 focused teaching beats');

  // Partial template usage is invalid — either all beats are templated, or none.
  const anyTemplate = reel.beats.some((b) => Boolean(b.template));
  if (anyTemplate && !templated) {
    error(['beats'], 'Every beat needs a registered template id, or omit template on all beats. Create missing scenes first: npm run tech:template:scaffold');
  }

  const checkColor = (color: string | undefined, path: (string | number)[]) => {
    if (color && !TECH_REEL_PALETTE.includes(color)) error(path, 'Use the locked channel palette');
  };
  if (!templated) {
    reel.nodes.forEach((node, i) => checkColor(node.color, ['nodes', i, 'color']));
  }
  reel.beats.forEach((beat, i) => {
    if (!templated) {
      Object.entries(beat.nodes).forEach(([id, node]) => checkColor(node.color, ['beats', i, 'nodes', id, 'color']));
      beat.flows.forEach((flow, j) => checkColor(flow.color, ['beats', i, 'flows', j, 'color']));
      (beat.cues || []).forEach((cue, j) => {
        Object.entries(cue.nodes).forEach(([id, node]) => checkColor(node.color, ['beats', i, 'cues', j, 'nodes', id, 'color']));
        (cue.flows || []).forEach((flow, k) => checkColor(flow.color, ['beats', i, 'cues', j, 'flows', k, 'color']));
      });
      if (beat.hardware || beat.window) error(['beats', i], 'Use orbital nodes and flows; paper-template fields are not allowed');
    }
    if (beat.durationSeconds < 4 || beat.durationSeconds > 12) error(['beats', i, 'durationSeconds'], 'Plan each beat for 4–12 seconds');
    if (beat.narration.trim().split(/\s+/).length > 35) error(['beats', i, 'narration'], 'Keep each beat to 35 spoken words or fewer');
    if (!templated && beat.metric && beat.metric.value.length > 28) error(['beats', i, 'metric', 'value'], 'Orbital metric values must be at most 28 characters');
  });
});
