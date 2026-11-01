import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TechReelSchema } from '../src/schema/techReel.js';
import { isTechBrand } from '../src/lib/brands.js';
import { beatAt, beatFrames, nodeStateAt, previewReel, reelFrames } from '../src/remotion/techReelModel.js';
import { audioWindow } from '../src/remotion/renderTechReel.js';
import { alignmentWords } from '../src/remotion/techReelSpeech.js';

test('sample storyboards validate and all flows refer to stable nodes', async () => {
  for (const id of ['database-scaling', 'request-coalescing', 'vertical-scaling', 'sliding-window']) {
    const reel = TechReelSchema.parse(JSON.parse(await readFile(`data/tech-reels/${id}.json`, 'utf8')));
    assert.ok(reel.beats.length >= 7);
    assert.equal(reelFrames(reel), beatFrames(reel).reduce((a, b) => a + b, 0));
  }
});
test('reject mythology, dangling edges, duplicate IDs, and unsafe output IDs', () => {
  assert.equal(isTechBrand('epicastra'), false);
  assert.equal(isTechBrand('tech-instagram'), true);
  assert.equal(TechReelSchema.safeParse({ ...previewReel, id: '../escape' }).success, false);
  assert.equal(TechReelSchema.safeParse({ ...previewReel, nodes: [...previewReel.nodes, previewReel.nodes[0]] }).success, false);
  const bad = structuredClone(previewReel);
  bad.beats[0]!.flows[0]!.to = 'missing';
  assert.equal(TechReelSchema.safeParse(bad).success, false);
});
test('diagram state persists across beats without mutating the source', () => {
  const reel = structuredClone(previewReel);
  reel.beats[0]!.nodes = { db: { x: 300, load: 0.9 } };
  reel.beats.push({ ...reel.beats[0]!, id: 'next', nodes: { db: { load: 0.1 } } });
  const db = nodeStateAt(reel, 1).find(n => n.id === 'db')!;
  assert.equal(db.x, 300); assert.equal(db.load, 0.1);
  assert.equal(reel.nodes.find(n => n.id === 'db')!.x, 540);
  assert.equal(beatAt(reel, 179).index, 0);
  assert.equal(beatAt(reel, 180).index, 1);
  assert.equal(beatAt(reel, 180).local, 0);
});
test('audio timing rounds upward to whole frames and keeps speech intact', () => {
  for (const duration of [0.01, 3.333, 7.081, 12.9]) {
    const window = audioWindow(duration);
    assert.ok(window >= duration + 0.18 - 1e-9);
    assert.ok(Math.abs(window * 30 - Math.round(window * 30)) < 1e-9);
  }
  assert.throws(() => audioWindow(NaN));
});
test('character timing becomes word timing, preserving punctuation and final word', () => {
  const characters = Array.from('Ask once.');
  const words = alignmentWords({ characters, character_start_times_seconds: characters.map((_, i) => i / 10), character_end_times_seconds: characters.map((_, i) => (i + 1) / 10) });
  assert.deepEqual(words, [{ part: 'Ask', start: 0, end: 300 }, { part: 'once.', start: 400, end: 900 }]);
  assert.throws(() => alignmentWords({ characters, character_start_times_seconds: [], character_end_times_seconds: [] }));
});

test('default tech bundle uses the approved template and a complete topic-specific LLM contract', async () => {
  const { buildScriptBundle } = await import('../src/lib/episodeScriptTemplate.js');
  const { TechReelAuthoringSchema } = await import('../src/schema/techReel.js');
  const bundle = buildScriptBundle('tech-instagram', 'Database indexing');
  const reel = TechReelAuthoringSchema.parse(bundle.template);
  assert.equal(reel.style, 'orbital'); assert.equal(reel.accent, '#efc373');
  assert.equal(reel.voice, 'TECH_ENGLISH_INDIA'); assert.equal(reel.lang, 'en');
  assert.match(bundle.llmPrompt, /TOPIC: Database indexing/);
  assert.match(bundle.llmPrompt, /LOCKED — DO NOT EDIT/);
  assert.match(bundle.llmPrompt, /TECH_ENGLISH_INDIA/);
  assert.match(bundle.llmPrompt, /"id": "vertical-scaling"/);
  assert.ok(!bundle.llmPrompt.includes('{{SAMPLE_JSON}}'));
  assert.ok(!bundle.llmPrompt.includes('{{SCENE_TEMPLATES}}'));
  assert.match(bundle.llmPrompt, /`window\.array`/);
  assert.notEqual(buildScriptBundle('tech-instagram', 'Indexing', 'legacy').template.style, 'orbital');
  assert.equal(buildScriptBundle('epicastra').brandId, 'epicastra');
});

test('authoring rejects visual drift and unsupported presentation fields', async () => {
  const { TechReelAuthoringSchema } = await import('../src/schema/techReel.js');
  const original = JSON.parse(await readFile('templates/tech-reel-sample.json', 'utf8'));
  for (const change of [
    { style: 'editorial' }, { accent: '#d95632' }, { font: 'Comic Sans' }, { lang: 'hi' }, { voice: 'u7bRcYbD7visSINTyAT8' },
    { sourceReview: undefined },
    { beats: original.beats.slice(0, 2) }, { nodes: [{ ...original.nodes[0], color: '#ffffff' }] },
  ]) assert.equal(TechReelAuthoringSchema.safeParse({ ...original, ...change }).success, false);
  const unknownBeat = structuredClone(original); unknownBeat.beats[0].fontSize = 80;
  assert.equal(TechReelAuthoringSchema.safeParse(unknownBeat).success, false);
  const longSpeech = structuredClone(original); longSpeech.beats[0].narration = Array(36).fill('word').join(' ');
  assert.equal(TechReelAuthoringSchema.safeParse(longSpeech).success, false);
});

test('approved sample and vertical scaling validate under the same authoring contract', async () => {
  const { TechReelAuthoringSchema } = await import('../src/schema/techReel.js');
  for (const id of ['request-coalescing', 'vertical-scaling']) {
    const reel = TechReelAuthoringSchema.parse(JSON.parse(await readFile(`data/tech-reels/${id}.json`, 'utf8')));
    assert.equal(reel.style, 'orbital');
    assert.equal(reel.voice, 'TECH_ENGLISH_INDIA');
    assert.equal(reel.lang, 'en');
    if (id === 'vertical-scaling') {
      const final = nodeStateAt(reel, reel.beats.length - 1);
      assert.equal(final.find(n => n.id === 'machine')!.opacity, 1);
      assert.equal(final.find(n => n.id === 'waiting')!.opacity, 0);
    }
  }
});

test('scene-template reels validate only after registered template ids exist', async () => {
  const { TechReelAuthoringSchema } = await import('../src/schema/techReel.js');
  const reel = TechReelAuthoringSchema.parse(JSON.parse(await readFile('data/tech-reels/sliding-window.json', 'utf8')));
  assert.ok(reel.beats.every((beat) => beat.template === 'window.array'));
  const unknown = structuredClone(reel);
  unknown.beats.forEach((beat) => {
    beat.template = 'mobility.surge';
  });
  const rejected = TechReelAuthoringSchema.safeParse(unknown);
  assert.equal(rejected.success, false);
  assert.match(JSON.stringify(rejected.error?.issues || []), /Create it first|Unknown template|registered template/);
});

test('phrase cues use real speech timing and animate independent resource properties', async () => {
  const { motionEvents, animatedNodesAt } = await import('../src/remotion/techReelModel.js');
  const reel = TechReelSchema.parse({
    ...previewReel,
    nodes: [{ id: 'machine', kind: 'compute', label: 'SERVER', x: 540, y: 1100, cores: 2, memoryGb: 8 }],
    beats: [{ ...previewReel.beats[0], narration: 'Wait then add cores and more memory.', nodes: {}, flows: [], durationSeconds: 8,
      cues: [
        { onPhrase: 'add cores', transitionSeconds: 2, nodes: { machine: { cores: 8 } } },
        { onPhrase: 'more memory', transitionSeconds: 2, nodes: { machine: { memoryGb: 32 } } },
      ] }],
  });
  const captions = reel.beats[0]!.narration.split(' ').map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const events = motionEvents(reel, captions, 0);
  assert.equal(events[1]!.frame, 30);
  assert.equal(events[2]!.frame, 75);
  assert.equal(animatedNodesAt(reel, 0, 29, events)[0]!.cores, 2);
  assert.equal(animatedNodesAt(reel, 0, 60, events)[0]!.cores, 5);
  assert.equal(animatedNodesAt(reel, 0, 60, events)[0]!.memoryGb, 8);
  assert.equal(animatedNodesAt(reel, 0, 105, events)[0]!.cores, 8);
  assert.equal(animatedNodesAt(reel, 0, 105, events)[0]!.memoryGb, 20);
  assert.equal(nodeStateAt(reel, 0)[0]!.memoryGb, 32);
  assert.throws(() => motionEvents(reel, [{ text: 'different', start: 0, end: 1 }], 0), /Cannot align cue/);
});

test('motion cues reject unsupported states, ambiguous phrases and visual identity changes', async () => {
  const { TechReelAuthoringSchema } = await import('../src/schema/techReel.js');
  const original = JSON.parse(await readFile('templates/tech-reel-sample.json', 'utf8'));
  const badPhrase = structuredClone(original); badPhrase.beats[1].cues[0].onPhrase = 'not in the narration';
  assert.equal(TechReelAuthoringSchema.safeParse(badPhrase).success, false);
  const badColor = structuredClone(original); badColor.beats[1].cues[0].nodes = { machine: { color: '#ffffff' } };
  assert.equal(TechReelAuthoringSchema.safeParse(badColor).success, false);
  const badSlots = structuredClone(original); badSlots.beats[2].cues[0].nodes.machine.cores = 64;
  assert.equal(TechReelAuthoringSchema.safeParse(badSlots).success, false);
  const badLanes = structuredClone(original); badLanes.beats[1].cues[0].flows[0].lanes = 20;
  assert.equal(TechReelAuthoringSchema.safeParse(badLanes).success, false);
});
