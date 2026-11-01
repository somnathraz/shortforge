import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NARRATION_STYLE,
  resolveNarrationStyle
} from '../src/schema/narrationStyle.js';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { buildEpisodeScriptLlmPrompt } from '../src/lib/episodeScriptTemplate.js';

test('default narration style is warm conversational kathavachak', () => {
  assert.deepEqual(DEFAULT_NARRATION_STYLE, {
    mood: 'tender',
    intensity: 'low',
    pace: 'medium',
    emotion: 'devotional'
  });
  assert.deepEqual(resolveNarrationStyle(undefined), DEFAULT_NARRATION_STYLE);
});

test('sample episode template uses kathavachak narrationStyle and sparse voice tags', () => {
  const episode = EpisodeSchema.parse(episodeScriptTemplate());
  assert.deepEqual(episode.narrationStyle, DEFAULT_NARRATION_STYLE);
  assert.equal(episode.hookDelivery, 'warm');
  const taggedScenes = episode.scenes.filter((scene) => scene.elevenLabsText);
  assert.ok(taggedScenes.length >= 1 && taggedScenes.length <= 3);
  for (const scene of episode.scenes) {
    assert.ok(!/\[[^\]]+\]/.test(scene.narrationHi), 'narrationHi must stay tag-free');
  }
});

test('EpicAstra LLM brief asks for story-first kathavachak narration', () => {
  const prompt = buildEpisodeScriptLlmPrompt('Ganga descends');
  assert.match(prompt, /STORY-FIRST/i);
  assert.match(prompt, /Kathavachak/i);
  assert.match(prompt, /Do NOT force 12–18/i);
  assert.doesNotMatch(prompt, /Keep every narrationHi short enough to speak inside its durationSeconds/);
});
