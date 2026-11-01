import assert from 'node:assert/strict';
import test from 'node:test';
import { EpisodeSchema } from '../src/schema/episode.js';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import {
  buildElevenLabsTtsScript,
  buildHindiTtsScript,
  resolveSceneElevenLabsText,
  resolveSceneSpokenText
} from '../src/lib/ttsScript.js';
import {
  applyVoiceDirectionPauses,
  resolveElevenLabsSpeakText,
  stripElevenLabsAudioTags,
  voiceDirectionToV4Settings
} from '../src/schema/voiceDirection.js';

test('ElevenLabs v4 tagged text keeps tags while captions stay plain', () => {
  const direction = {
    emotion: 'compassionate',
    delivery: 'calm, firm, deliberate',
    intensity: 0.65,
    pauseBeforeMs: 400,
    pauseAfterMs: 600
  };
  const plain = 'राम ने कहा—विभीषण! मृत्यु के साथ ही वैर भी समाप्त हो जाता है।';
  const tagged =
    '[calmly] राम ने कहा—विभीषण! [firmly] मृत्यु के साथ ही वैर भी समाप्त हो जाता है।';
  const speak = resolveElevenLabsSpeakText({
    plainText: plain,
    elevenLabsText: tagged,
    voiceDirection: direction
  });
  assert.match(speak, /\[calmly\]/);
  assert.match(speak, /\[firmly\]/);
  assert.match(speak, /^\.\.\. /);
  assert.match(speak, / \.\.\.$/);
  assert.equal(stripElevenLabsAudioTags(tagged), plain);
  assert.equal(voiceDirectionToV4Settings(direction).similarity_boost, 0.82);
  assert.ok(voiceDirectionToV4Settings(direction).stability < 0.7);
});

test('sample episode JSON includes v4 voiceDirection + elevenLabsText on scene 4', () => {
  const episode = EpisodeSchema.parse(episodeScriptTemplate());
  const scene4 = episode.scenes.find((scene) => scene.id === 4);
  assert.ok(scene4);
  assert.equal(scene4!.voiceDirection?.emotion, 'solemn');
  assert.match(scene4!.elevenLabsText || '', /\[calmly\]/);
  assert.equal(resolveSceneSpokenText(scene4!), scene4!.narrationHi);
  assert.match(resolveSceneElevenLabsText(scene4!), /\[firmly\]/);

  const plainScript = buildHindiTtsScript(episode);
  const elScript = buildElevenLabsTtsScript(episode);
  assert.ok(!plainScript.includes('[calmly]'));
  assert.ok(elScript.includes('[calmly]'));
  assert.ok(elScript.includes('[firmly]'));
});

test('pause helper does not double-prefix ellipses', () => {
  const once = applyVoiceDirectionPauses('hello', {
    emotion: 'calm',
    delivery: 'calmly',
    pauseBeforeMs: 400,
    pauseAfterMs: 400
  });
  const twice = applyVoiceDirectionPauses(once, {
    emotion: 'calm',
    delivery: 'calmly',
    pauseBeforeMs: 400,
    pauseAfterMs: 400
  });
  assert.equal(once, twice);
});
