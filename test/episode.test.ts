import assert from 'node:assert/strict';
import test from 'node:test';
import type { Budget } from '../src/config/budget.js';
import {
  assertBudgetPolicy,
  assertEditorialPolicy,
  assertSpokenHookPolicy,
  routeWithinBudget
} from '../src/guards/episode.js';
import { mockEpisode } from '../src/providers/mock.js';
import { STORY_PROVIDERS } from '../src/pipeline/generateEpisode.js';
import { EpisodeGenerationSchema, EpisodeSchema } from '../src/schema/episode.js';

const budget: Budget = {
  targetDurationSeconds: 40,
  maxScenes: 8,
  maxPaidMotionScenes: 2,
  maxPaidMotionSeconds: 10,
  maxCostPerShortInr: 120,
  paidMotionCostPerSecondInr: 12
};

test('mock episode passes schema, editorial, and budget policies', () => {
  const episode = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
  assert.doesNotThrow(() => assertEditorialPolicy(episode));
  assert.deepEqual(assertBudgetPolicy(episode, budget), {
    sceneCount: 7,
    paidMotionScenes: 2,
    paidMotionSeconds: 10,
    estimatedCostInr: 120
  });
});

test('mythology cannot bypass human source review', () => {
  const episode = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
  episode.sourceReview.status = 'FICTION';
  assert.throws(() => assertEditorialPolicy(episode), /NEEDS_REVIEW/);
});

test('budget rejects excess paid motion', () => {
  const episode = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
  episode.scenes[1]!.renderMode = 'AI_VIDEO';
  assert.throws(() => assertBudgetPolicy(episode, budget), /paid scenes|paid motion|estimated cost/);
});

test('budget router keeps the highest-priority affordable paid shot', () => {
  const episode = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
  episode.scenes[1]!.renderMode = 'AI_VIDEO';
  episode.scenes[1]!.importance = 2;
  const routed = routeWithinBudget(episode, budget);
  const paid = routed.scenes.filter((scene) => scene.renderMode === 'AI_VIDEO');
  assert.equal(paid.length, 2);
  assert.deepEqual(paid.map((scene) => scene.id), [1, 7]);
  assert.doesNotThrow(() => assertBudgetPolicy(routed, budget));
});

test('schema rejects a broken scene timeline', () => {
  const raw = mockEpisode('Why Hanuman forgot his powers') as { scenes: Array<{ startSecond: number }> };
  raw.scenes[2]!.startSecond = 99;
  assert.throws(() => EpisodeSchema.parse(raw), /stay continuous|continuous timeline/);
});

test('hosted free providers are registered', () => {
  assert.deepEqual(
    [...STORY_PROVIDERS],
    ['gemini', 'ollama', 'nvidia', 'openai', 'openrouter', 'groq']
  );
});

test('spokenHook policy rejects title copy and scene-1 repeats', () => {
  const episode = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
  assert.doesNotThrow(() => assertSpokenHookPolicy(episode));

  episode.spokenHook = episode.titleHi;
  assert.throws(() => assertSpokenHookPolicy(episode), /must not copy title/);

  const fresh = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
  const hookText =
    typeof fresh.spokenHook === 'string' ? fresh.spokenHook : fresh.spokenHook!.textHi;
  fresh.scenes[0]!.narrationHi = hookText;
  assert.throws(() => EpisodeSchema.parse(fresh), /must continue after spokenHook|must not repeat/);
});

test('spokenHook without duration fails schema refine', () => {
  const raw = mockEpisode('Why Hanuman forgot his powers') as {
    spokenHookDurationSeconds?: number;
  };
  delete raw.spokenHookDurationSeconds;
  assert.throws(() => EpisodeSchema.parse(raw), /spokenHookDurationSeconds/);
});

test('generation schema requires spokenHook fields for strict LLM output', () => {
  const raw = mockEpisode('Why Hanuman forgot his powers');
  assert.doesNotThrow(() => EpisodeGenerationSchema.parse(raw));
  const incomplete = { ...(raw as object) } as Record<string, unknown>;
  delete incomplete.spokenHook;
  assert.throws(() => EpisodeGenerationSchema.parse(incomplete), /spokenHook|Required|expected/i);
});

test('generation schema requires featuredLords for image identity', () => {
  const raw = mockEpisode('Why Hanuman forgot his powers') as { featuredLords?: unknown };
  assert.ok(raw.featuredLords);
  delete raw.featuredLords;
  assert.throws(() => EpisodeGenerationSchema.parse(raw), /featuredLords|Required|expected/i);
});
