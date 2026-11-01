import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { EpisodeSchema } from '../src/schema/episode.js';
import { renderTechVisualSvg } from '../src/tech-visuals/layouts.js';
import { viewStateForVisual } from '../src/tech-visuals/state.js';
import { requiredImageIds } from '../src/lib/sceneVisualPlan.js';

test('ARRAY_LOOKUP SVG contains exact indexes and result', () => {
  const visual = {
    visualType: 'ARRAY_LOOKUP' as const,
    visualData: {
      values: [10, 20, 30, 40, 50],
      targetIndex: 2,
      result: 30,
      complexity: 'O(1)'
    },
    animationSteps: [
      { at: 0, action: 'showArray' },
      { at: 0.4, action: 'highlightCell', index: 2 },
      { at: 0.7, action: 'showResult' },
      { at: 0.9, action: 'showComplexity', value: 'O(1)' }
    ]
  };
  const mid = renderTechVisualSvg(visual, 0.5);
  assert.match(mid, />30</);
  assert.match(mid, /arr\[2\]/);
  const end = renderTechVisualSvg(visual, 1);
  assert.match(end, /O\(1\)/);
});

test('HALVING reveals 32→16→8→4→2→1 exactly', () => {
  const visual = {
    visualType: 'HALVING' as const,
    visualData: { sequence: [32, 16, 8, 4, 2, 1], complexity: 'O(log n)' },
    animationSteps: [
      { at: 0, action: 'halveTo', index: 0 },
      { at: 0.2, action: 'halveTo', index: 1 },
      { at: 0.4, action: 'halveTo', index: 2 },
      { at: 0.6, action: 'halveTo', index: 3 },
      { at: 0.8, action: 'halveTo', index: 4 },
      { at: 1, action: 'halveTo', index: 5 },
      { at: 1, action: 'showComplexity', value: 'O(log n)' }
    ]
  };
  const early = renderTechVisualSvg(visual, 0.25);
  assert.match(early, />32</);
  assert.match(early, />16</);
  assert.doesNotMatch(early, />1</);
  const done = renderTechVisualSvg(visual, 1);
  for (const n of [32, 16, 8, 4, 2, 1]) assert.match(done, new RegExp(`>${n}<`));
  assert.match(done, /O\(log n\)/);
});

test('techVisual skips AI image requirement', () => {
  const ids = requiredImageIds(
    [
      { id: 1, renderMode: 'STILL', techVisual: { visualType: 'ARRAY_LOOKUP' } },
      { id: 2, renderMode: 'STILL' }
    ],
    true,
    false,
    undefined,
    undefined,
    { hookTechVisual: { visualType: 'TECH_HOOK' } }
  );
  assert.deepEqual(ids, [2]);
});

test('mythology episode rejects techVisual via schema', () => {
  assert.throws(() =>
    EpisodeSchema.parse({
      id: 'myth-test',
      storyKind: 'CANONICAL_MYTHOLOGY',
      topic: 'Test',
      titleHi: 'शीर्षक',
      titleEn: 'Title long enough',
      hookHi: 'Curiosity packaging line here',
      spokenHook: 'Spoken hook that is not the title at all',
      spokenHookDurationSeconds: 5,
      hookDelivery: 'curious',
      featuredLords: [
        {
          nameEn: 'Krishna',
          nameHi: 'कृष्ण',
          importance: 'primary',
          visualIdentity: 'Blue-skinned Krishna with flute and peacock feather crown enough',
          doNotConfuseWith: 'Vishnu reclining on Shesha'
        }
      ],
      targetDurationSeconds: 30,
      audience: 'GENERAL_FAMILY',
      fictionDisclosureRequired: false,
      sourceReview: { status: 'NEEDS_REVIEW', claimsToVerify: ['claim'], notes: [] },
      scenes: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        startSecond: 5 + i * 5,
        durationSeconds: 5,
        narrationHi: `Scene narration number ${i + 1} continues the story`,
        visualPrompt: 'Temple courtyard with warm light and calm figures in frame',
        camera: 'slow push in',
        importance: 8,
        renderMode: 'STILL',
        soundCue: 'soft whoosh',
        techVisual: {
          visualType: 'ARRAY_LOOKUP',
          visualData: { values: [1, 2, 3] },
          animationSteps: []
        }
      })),
      ending: { payoffHi: 'Payoff line here', nextEpisodeTeaseHi: 'Tomorrow tease here' },
      metadata: {
        descriptionHi: 'Description text here for packaging',
        keywords: ['a', 'b', 'c'],
        thumbnailTextHi: 'Thumb'
      }
    })
  );
});

test('syncTechVisualToNarration lands HALVING beats on spoken numbers', async () => {
  const { syncTechVisualToNarration } = await import('../src/tech-visuals/syncNarration.js');
  const synced = syncTechVisualToNarration(
    {
      visualType: 'HALVING',
      visualData: { sequence: [32, 16, 8, 4, 2, 1], complexity: 'O(log n)' },
      animationSteps: []
    },
    'But if we keep cutting the problem in half, thirty-two becomes sixteen, eight, four, two, one. That is O of log n.'
  );
  const halves = synced.animationSteps.filter((step) => step.action === 'halveTo');
  assert.equal(halves.length, 6);
  for (let i = 1; i < halves.length; i++) {
    assert.ok(halves[i]!.at > halves[i - 1]!.at);
  }
  // "thirty-two" is early; "one" is late
  assert.ok(halves[0]!.at < 0.45);
  assert.ok(halves[5]!.at >= 0.55);
});

test('Day 1 Big O episode parses with techVisuals', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir('data/episodes-tech')).filter((f) =>
    f.includes('big-o-time-and-space-complexity')
  );
  assert.ok(files.length, 'expected a Big O tech episode JSON');
  const raw = JSON.parse(await readFile(`data/episodes-tech/${files[0]}`, 'utf8'));
  const episode = EpisodeSchema.parse(raw);
  assert.equal(episode.hookTechVisual?.visualType, 'TECH_HOOK');
  assert.equal(episode.scenes[4]?.techVisual?.visualType, 'HALVING');
  const state = viewStateForVisual(episode.scenes[4]!.techVisual!, 1);
  assert.equal(state.halvingLevel, 6);
});
