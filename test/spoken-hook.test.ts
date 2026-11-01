import assert from 'node:assert/strict';
import test from 'node:test';
import { mockEpisode } from '../src/providers/mock.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { buildHindiTtsScript, plannedVisualDurationSeconds } from '../src/lib/ttsScript.js';
import { buildNarrationTimeline } from '../src/audio/narration-timeline.js';

function episodeWithSpokenHook() {
  const base = mockEpisode('test') as {
    scenes: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  return EpisodeSchema.parse({
    ...base,
    spokenHook: 'क्या आप जानते हैं मंदिर के अंदर कौन इलाज करता है?',
    spokenHookDurationSeconds: 5,
    hookDelivery: 'curious',
    targetDurationSeconds: 45,
    scenes: base.scenes.slice(0, 5).map((scene, index) => ({
      ...scene,
      id: index + 1,
      startSecond: 5 + index * 8,
      durationSeconds: 8
    }))
  });
}

test('TTS script speaks hook then scenes then ending — never the title', () => {
  const episode = episodeWithSpokenHook();
  const script = buildHindiTtsScript(episode);
  assert.ok(
    script.startsWith(
      typeof episode.spokenHook === 'string' ? episode.spokenHook : episode.spokenHook!.textHi
    )
  );
  assert.ok(script.includes(episode.scenes[0]!.narrationHi));
  assert.ok(script.includes(episode.ending.payoffHi));
  assert.equal(script.includes(episode.titleHi), false);
  assert.equal(plannedVisualDurationSeconds(episode), 45);
});

test('narration timeline puts spokenHook at t=0 before scenes', async () => {
  const episode = episodeWithSpokenHook();
  const timeline = await buildNarrationTimeline(episode);
  assert.equal(timeline.scenes[0]?.kind, 'spokenHook');
  assert.equal(timeline.scenes[0]?.startSecond, 0);
  assert.equal(timeline.spokenHook?.durationSeconds, 5);
  assert.equal(timeline.scenes.find((s) => s.kind === 'scene' && s.id === 1)?.startSecond, 5);
});

test('visual slots include ending and cover full planned narration clock', async () => {
  const { visualSlotsFromTimeline } = await import('../src/providers/ffmpegRender.js');
  const episode = episodeWithSpokenHook();
  const timeline = await buildNarrationTimeline(episode);
  const slots = visualSlotsFromTimeline(timeline, episode);
  assert.ok(slots.some((slot) => slot.kind === 'spokenHook'));
  assert.ok(slots.some((slot) => slot.kind === 'ending'));
  const visualTotal = slots.reduce((sum, slot) => sum + slot.durationSeconds, 0);
  assert.equal(Math.round(visualTotal * 100) / 100, timeline.narrationDurationSeconds);
  // Ending payoff sits after the 45s picture plan, so visuals exceed targetDurationSeconds.
  assert.ok(visualTotal > plannedVisualDurationSeconds(episode));
});
