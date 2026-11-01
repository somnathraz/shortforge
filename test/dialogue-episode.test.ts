import assert from 'node:assert/strict';
import test from 'node:test';
import { EpisodeSchema } from '../src/schema/episode.js';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import {
  dialogueLinesToNarrationHi,
  normalizeDialogueEpisodeForProduction,
  stripDialogueSpeakerPrefix
} from '../src/lib/dialogueEpisode.js';
import {
  buildDialogueTurns,
  mergeConsecutiveTurns,
  resolveDialogueVoiceIds
} from '../src/lib/dialogueTts.js';
import { importEpisodeJson } from '../src/pipeline/importEpisode.js';

test('stripDialogueSpeakerPrefix removes A:/B: labels', () => {
  assert.equal(stripDialogueSpeakerPrefix('A: नमस्ते'), 'नमस्ते');
  assert.equal(stripDialogueSpeakerPrefix('B: [curious] क्या?'), '[curious] क्या?');
});

test('sample template keeps SINGLE_NARRATOR and optional dialogue packaging', () => {
  const episode = EpisodeSchema.parse(episodeScriptTemplate());
  assert.equal(episode.format, 'SINGLE_NARRATOR');
  assert.ok(episode.voices?.A?.voiceId);
  const withDialogue = episode.scenes.find((scene) => scene.dialogueLines?.length);
  assert.ok(withDialogue);
});

test('normalizeDialogueEpisodeForProduction fills captions without speaker labels', () => {
  const normalized = normalizeDialogueEpisodeForProduction({
    spokenHook: 'B: सोचिए? A: राख में।',
    hookDialogueLines: [
      { speaker: 'B', text: '[curious] सोचिए?' },
      { speaker: 'A', text: 'राख में।' }
    ],
    scenes: [
      {
        id: 1,
        dialogueLines: [
          { speaker: 'A', text: '[calmly] राजा सगर ने यज्ञ शुरू किया।' },
          { speaker: 'B', text: 'फिर?' }
        ],
        narrationHi: 'A: राजा सगर ने यज्ञ शुरू किया। B: फिर?'
      }
    ],
    ending: {
      payoffHi: 'A: संकल्प पूरा हुआ। B: हर हर गंगे।',
      nextEpisodeTeaseHi: 'B: अगली कथा? A: बाद में।'
    }
  });
  assert.equal(normalized.format, 'TWO_SPEAKER_DIALOGUE');
  assert.ok(!/^B:/.test(String(normalized.spokenHook)));
  assert.equal(
    normalized.scenes?.[0]?.narrationHi,
    dialogueLinesToNarrationHi([
      { speaker: 'A', text: '[calmly] राजा सगर ने यज्ञ शुरू किया।' },
      { speaker: 'B', text: 'फिर?' }
    ])
  );
  assert.match(String(normalized.scenes?.[0]?.elevenLabsText), /\[calmly\]/);
  assert.ok((normalized.scenes?.[0]?.voiceSegments as unknown[])?.length === 2);
});

test('import accepts TWO_SPEAKER_DIALOGUE sample overlay without breaking short template', async () => {
  const base = episodeScriptTemplate() as Record<string, unknown>;
  const result = await importEpisodeJson(
    {
      ...base,
      id: 'dialogue-format-smoke',
      format: 'TWO_SPEAKER_DIALOGUE',
      hookDialogueLines: [
        { speaker: 'B', text: '[curious] शक्ति क्यों भूली?' },
        { speaker: 'A', text: 'ऋषियों ने याद दिलाने तक।' }
      ],
      spokenHook: 'B: शक्ति क्यों भूली? A: ऋषियों ने याद दिलाने तक।',
      elevenLabsDialogueRequest: {
        note: 'test',
        inputs: [
          { speaker: 'B', text: '[curious] शक्ति क्यों भूली?' },
          { speaker: 'A', text: 'ऋषियों ने याद दिलाने तक।' }
        ]
      }
    },
    { dryRun: true }
  );
  assert.equal(result.episode.format, 'TWO_SPEAKER_DIALOGUE');
  assert.ok(!String(result.episode.spokenHook).includes('B:'));
});

test('buildDialogueTurns merges consecutive same-speaker lines', () => {
  const turns = mergeConsecutiveTurns([
    { speaker: 'B', text: 'सोचिए?' },
    { speaker: 'A', text: 'राख में।' },
    { speaker: 'A', text: 'राजा सगर।' },
    { speaker: 'B', text: 'फिर?' }
  ]);
  assert.deepEqual(turns, [
    { speaker: 'B', text: 'सोचिए?' },
    { speaker: 'A', text: 'राख में। राजा सगर।' },
    { speaker: 'B', text: 'फिर?' }
  ]);
});

test('buildDialogueTurns prefers elevenLabsDialogueRequest order', () => {
  const episode = EpisodeSchema.parse({
    ...episodeScriptTemplate(),
    id: 'dialogue-turns-smoke',
    format: 'TWO_SPEAKER_DIALOGUE',
    voices: {
      A: { role: 'storyteller', voiceId: 'voice-a-id' },
      B: { role: 'listener', voiceId: 'voice-b-id' }
    },
    elevenLabsDialogueRequest: {
      note: 'test',
      inputs: [
        { speaker: 'B', text: 'B: [curious] सोचिए?' },
        { speaker: 'A', text: 'A: राख में।' },
        { speaker: 'A', text: 'राजा सगर।' }
      ]
    }
  });
  const turns = buildDialogueTurns(episode);
  assert.deepEqual(turns, [
    { speaker: 'B', text: '[curious] सोचिए?' },
    { speaker: 'A', text: 'राख में। राजा सगर।' }
  ]);
  const voices = resolveDialogueVoiceIds(episode);
  assert.equal(voices.voiceA, 'voice-a-id');
  assert.equal(voices.voiceB, 'voice-b-id');
});
