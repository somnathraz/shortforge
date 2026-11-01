import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAudioPlan } from '../src/audio/sound-director.js';
import { buildSfxFilterComplex } from '../src/audio/sfx-mixer.js';
import { AudioPlanSchema } from '../src/schema/audioPlan.js';
import { SFX_LIBRARY, isAllowedEffect, BGM_MOOD_DIRS } from '../src/audio/sfx-library.js';
import { buildNarrationTimeline } from '../src/audio/narration-timeline.js';
import type { Episode } from '../src/schema/episode.js';

test('SFX library covers 18 reusable effects', () => {
  assert.equal(SFX_LIBRARY.length, 18);
  assert.ok(isAllowedEffect('deep-boom'));
  assert.equal(isAllowedEffect('made-up-boom'), false);
});

test('BGM mood folders are defined for random pick', () => {
  assert.equal(Object.keys(BGM_MOOD_DIRS).length, 5);
  assert.equal(BGM_MOOD_DIRS.divine_mystery, 'divine_mystery');
});

test('normalizeAudioPlan drops invented effects and adds soft opening for sacred moods', () => {
  const plan = normalizeAudioPlan(
    {
      bgmMood: 'divine_mystery',
      sfx: [
        { time: 8, effect: 'thunder', volume: 0.35, reason: 'storm' },
        { time: 15, effect: 'not-a-real-effect', volume: 0.5, reason: 'bad' },
        { time: 34, effect: 'heavy-impact', volume: 0.9, reason: 'doors' }
      ]
    },
    55,
    { timingSource: 'narration-aligned', narrationDurationSeconds: 55 }
  );
  assert.equal(plan.bgmMood, 'divine_mystery');
  assert.equal(plan.timingSource, 'narration-aligned');
  assert.ok(plan.sfx.some((cue) => cue.time <= 1 && cue.effect === 'divine-chime'));
  assert.ok(!plan.sfx.some((cue) => cue.time <= 1 && cue.effect === 'deep-boom'));
  assert.ok(!plan.sfx.some((cue) => cue.effect === ('not-a-real-effect' as never)));
  const impact = plan.sfx.find((cue) => cue.effect === 'heavy-impact');
  assert.ok(impact);
  assert.ok(impact!.volume <= 0.8);
  assert.doesNotThrow(() => AudioPlanSchema.parse(plan));
});

test('normalizeAudioPlan strips loud opening boom on soft moods', () => {
  const plan = normalizeAudioPlan(
    {
      bgmMood: 'emotional',
      sfx: [
        { time: 0.1, effect: 'deep-boom', volume: 0.8, reason: 'wrong boom' },
        { time: 12, effect: 'wind', volume: 0.3, reason: 'breeze' },
        { time: 40, effect: 'riser', volume: 0.6, reason: 'build one' },
        { time: 48, effect: 'riser', volume: 0.6, reason: 'build two' }
      ]
    },
    55
  );
  assert.ok(!plan.sfx.some((cue) => cue.effect === 'deep-boom'));
  assert.ok(plan.sfx.some((cue) => cue.time <= 1 && cue.effect === 'divine-chime'));
  assert.equal(plan.sfx.filter((cue) => cue.effect === 'riser').length, 1);
});

test('normalizeAudioPlan keeps cinematic boom for epic moods', () => {
  const plan = normalizeAudioPlan(
    {
      bgmMood: 'epic_battle',
      sfx: [{ time: 10, effect: 'sword-clash', volume: 0.5, reason: 'fight' }]
    },
    40
  );
  assert.ok(plan.sfx.some((cue) => cue.time <= 1 && cue.effect === 'deep-boom'));
});

test('buildSfxFilterComplex maps time/volume to adelay', () => {
  const filter = buildSfxFilterComplex([
    { time: 0.2, effect: 'deep-boom', volume: 0.8, reason: 'hook' },
    { time: 7, effect: 'thunder', volume: 0.35, reason: 'storm' }
  ]);
  assert.match(filter, /adelay=200\|200/);
  assert.match(filter, /adelay=7000\|7000/);
  assert.match(filter, /\[0:a\]volume=1\.050\[narr\]/);
  assert.match(filter, /amix=inputs=3/);
  assert.match(filter, /alimiter=/);
});

test('buildNarrationTimeline falls back to scene-planned without audio', async () => {
  const episode = {
    id: 't1',
    titleHi: 't',
    titleEn: 't',
    hookHi: 'h',
    storyKind: 'mystery',
    targetDurationSeconds: 20,
    scenes: [
      {
        id: 's1',
        startSecond: 0,
        durationSeconds: 8,
        narrationHi: 'abcdefghij',
        visualPrompt: 'v',
        camera: 'c',
        importance: 8,
        soundCue: 'boom',
        motionHint: 'static',
        characterIds: []
      },
      {
        id: 's2',
        startSecond: 8,
        durationSeconds: 12,
        narrationHi: 'abcdefghijklmnop',
        visualPrompt: 'v',
        camera: 'c',
        importance: 9,
        soundCue: 'bell',
        motionHint: 'static',
        characterIds: []
      }
    ],
    ending: { payoffHi: 'p', payoffEn: 'p', ctaHi: 'c' },
    characters: []
  } as unknown as Episode;

  const timeline = await buildNarrationTimeline(episode);
  assert.equal(timeline.method, 'scene-planned');
  assert.equal(timeline.scenes[0]!.startSecond, 0);
  assert.equal(timeline.scenes[1]!.startSecond, 8);
});
