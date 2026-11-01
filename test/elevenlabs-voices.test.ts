import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseEnvElevenLabsVoices,
  parseEnvVoiceEntry
} from '../src/lib/elevenlabsVoices.ts';

test('parseEnvVoiceEntry accepts id, label:id, and label=id', () => {
  assert.deepEqual(parseEnvVoiceEntry('abc123'), { id: 'abc123', label: 'abc123' });
  assert.deepEqual(parseEnvVoiceEntry('Narrator:abc123'), {
    id: 'abc123',
    label: 'Narrator'
  });
  assert.deepEqual(parseEnvVoiceEntry('Hindi female=sRieWHKeAAU4rWvQs6uN'), {
    id: 'sRieWHKeAAU4rWvQs6uN',
    label: 'Hindi female'
  });
  assert.deepEqual(parseEnvVoiceEntry('"Warm, curious":mSYK1wXy'), {
    id: 'mSYK1wXy',
    label: 'Warm, curious'
  });
});

test('parseEnvElevenLabsVoices merges VOICES, VOICE_IDS, numbered, and default', () => {
  const voices = parseEnvElevenLabsVoices({
    ELEVENLABS_VOICE_ID: 'defaultId',
    ELEVENLABS_VOICE_IDS: 'idA,idB',
    ELEVENLABS_VOICES: 'Channel:mSYK1,Hindi female:sRieW',
    ELEVENLABS_VOICE_1_ID: 'num1',
    ELEVENLABS_VOICE_1_LABEL: 'Numbered one',
    ELEVENLABS_VOICE_2_ID: 'num2'
  });

  const byId = Object.fromEntries(voices.map((v) => [v.id, v]));
  assert.equal(byId.defaultId?.label, 'Default (.env)');
  assert.equal(byId.idA?.source, 'env');
  assert.equal(byId.mSYK1?.label, 'Channel');
  assert.equal(byId.sRieW?.label, 'Hindi female');
  assert.equal(byId.num1?.label, 'Numbered one');
  assert.equal(byId.num2?.label, 'Voice 2');
  assert.equal(voices.length, 7);
});
