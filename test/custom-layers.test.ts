import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LayersSchema, layerIssues, layerStateAt } from '../src/schema/customLayers.js';
import { TechReelAuthoringSchema } from '../src/schema/techReel.js';

const layers = LayersSchema.parse([
  { id: 'title', type: 'text', text: 'Cache miss', x: 540, y: 80, enter: 'type', enterSeconds: 1 },
  { id: 'db', type: 'box', x: 300, y: 360, w: 200, h: 100, label: 'DB', keys: [{ at: 1, x: 300 }, { at: 3, x: 700 }] },
  { id: 'flow', type: 'arrow', x: 150, y: 360, x2: 450, y2: 360, enter: 'draw', from: 0.5 },
  { id: 'hits', type: 'counter', x: 540, y: 600, toValue: 1200, suffix: ' rps', to: 5 }
]);

function reel(beatLayers: unknown) {
  const beat = (i: number, extra: object = {}) => ({
    id: `b${i}`,
    chapter: `0${i} / TEST`,
    headline: `Beat ${i}`,
    narration: 'A short spoken line for this beat.',
    durationSeconds: 5,
    template: 'custom.layers',
    layers: beatLayers,
    ...extra
  });
  return {
    version: 1,
    brandId: 'tech-instagram',
    id: 'layers-test',
    title: 'Layers test',
    voice: 'TECH_ENGLISH_INDIA',
    sourceReview: { status: 'NEEDS_REVIEW', learningGoal: 'g', caveat: 'c', claims: [{ claim: 'x' }] },
    nodes: [{ id: 'n', kind: 'service', label: 'N', x: 540, y: 900 }],
    beats: [1, 2, 3, 4, 5].map((i) => beat(i))
  };
}

test('defaults fill in and unknown fields are rejected', () => {
  assert.equal(layers[0]!.enter, 'type');
  assert.equal(layers[1]!.from, 0);
  assert.throws(() => LayersSchema.parse([{ id: 'x', type: 'text', text: 'a', x: 1, y: 1, bogus: true }]));
  assert.throws(() => LayersSchema.parse([{ id: 'x', type: 'script', x: 1, y: 1 }]));
});

test('layer state: hidden before from, keyframes interpolate, to fades out', () => {
  const box = layers[1]!;
  assert.equal(layerStateAt(layers[2]!, 0.2).visible, false);
  assert.equal(layerStateAt(box, 1).x, 300);
  const mid = layerStateAt(box, 2).x;
  assert.ok(mid > 300 && mid < 700, `mid ${mid}`);
  assert.equal(layerStateAt(box, 3.5).x, 700);
  const counter = layers[3]!;
  assert.equal(layerStateAt(counter, 4.9).visible, true);
  assert.equal(layerStateAt(counter, 5.3).visible, false);
  assert.equal(layerStateAt(layers[0]!, 0.5).progress > 0.4, true);
});

test('layerIssues flags duplicate ids, bad ranges and keyframe order', () => {
  const bad = LayersSchema.parse([
    { id: 'a', type: 'text', text: 't', x: 1, y: 1, from: 2, to: 1 },
    { id: 'a', type: 'box', x: 1, y: 1, w: 50, h: 50, keys: [{ at: 2, x: 1 }, { at: 1, x: 2 }] },
    { id: 'c', type: 'code', x: 1, y: 1, lines: ['x'], highlight: [3] }
  ]);
  const messages = layerIssues(bad, 5).map((i) => i.message).join('|');
  assert.match(messages, /Duplicate/);
  assert.match(messages, /later than from/);
  assert.match(messages, /increasing time/);
  assert.match(messages, /highlight/);
});

test('a reel of custom.layers beats passes authoring validation', () => {
  TechReelAuthoringSchema.parse(reel(layers));
});

test('layers need the custom.layers template and vice versa', () => {
  const noLayers = reel(undefined);
  assert.throws(() => TechReelAuthoringSchema.parse(noLayers), /requires beat.layers/);
  const wrongTemplate = reel(layers) as any;
  wrongTemplate.beats[0].template = 'window.array';
  assert.throws(() => TechReelAuthoringSchema.parse(wrongTemplate));
});
