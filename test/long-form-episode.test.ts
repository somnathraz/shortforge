import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBudget } from '../src/config/budget.js';
import { assertBudgetPolicy, isLongFormEpisode, routeWithinBudget } from '../src/guards/episode.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';

test('schema accepts long-form katha masters beyond Short caps', () => {
  const base = episodeScriptTemplate() as Record<string, unknown>;
  const scenes = [];
  for (let i = 0; i < 12; i += 1) {
    const sample = (base.scenes as Array<Record<string, unknown>>)[0]!;
    scenes.push({
      ...sample,
      id: i + 1,
      startSecond: 5 + i * 5,
      durationSeconds: 5,
      narrationHi: `लंबी कथा का भाग ${i + 1} — पिछली पंक्ति से जुड़ी हुई।`,
      renderMode: 'STILL',
      appearingLords: ['Lord Hanuman']
    });
  }
  const longForm = {
    ...base,
    id: 'long-form-katha-test',
    spokenHook: 'क्या आपने सुना कि यह कथा कई पीढ़ियों तक चली?',
    spokenHookDurationSeconds: 5,
    hookDelivery: 'warm',
    targetDurationSeconds: 5 + scenes.length * 5,
    scenes
  };
  const episode = EpisodeSchema.parse(longForm);
  assert.equal(episode.scenes.length, 12);
  assert.equal(episode.targetDurationSeconds, 65);
});

test('budget guard allows many scenes for long-form but still caps paid motion', async () => {
  const budget = await loadBudget();
  const base = EpisodeSchema.parse(episodeScriptTemplate());
  const scenes = Array.from({ length: 12 }, (_, index) => ({
    ...base.scenes[0]!,
    id: index + 1,
    startSecond: 5 + index * 5,
    durationSeconds: 5,
    narrationHi: `भाग ${index + 1}`,
    renderMode: 'AI_VIDEO' as const,
    importance: index === 11 ? 10 : 5,
    appearingLords: ['Lord Hanuman']
  }));
  const draft = {
    ...base,
    id: 'long-form-budget-test',
    spokenHook: 'क्या आपने सुना कि यह कथा कई पीढ़ियों तक चली?',
    spokenHookDurationSeconds: 5,
    hookDelivery: 'warm' as const,
    targetDurationSeconds: 65,
    scenes
  };
  assert.equal(isLongFormEpisode(draft, budget), true);
  const routed = routeWithinBudget(draft, budget);
  const report = assertBudgetPolicy(routed, budget);
  assert.ok(report.sceneCount > budget.maxScenes);
  assert.ok(report.paidMotionScenes <= budget.maxPaidMotionScenes);
  assert.ok(report.paidMotionSeconds <= budget.maxPaidMotionSeconds);
});
