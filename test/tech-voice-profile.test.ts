import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECH_DEFAULT_VOICE_PROFILE,
  TECH_ENGLISH_INDIA,
  resolveTechVoiceProfile,
  techElevenLabsVoiceId
} from '../src/lib/techVoiceProfile.js';

test('tech channel default is TECH_ENGLISH_INDIA (Rahul Bharadwaj)', () => {
  assert.equal(TECH_DEFAULT_VOICE_PROFILE, 'TECH_ENGLISH_INDIA');
  assert.equal(TECH_ENGLISH_INDIA.elevenLabs.voiceId, 'u7bRcYbD7visSINTyAT8');
  assert.equal(TECH_ENGLISH_INDIA.elevenLabs.modelId, 'eleven_v4');
  assert.equal(TECH_ENGLISH_INDIA.elevenLabs.languageCode, 'en');
  assert.deepEqual(TECH_ENGLISH_INDIA.elevenLabs.voiceSettings, {
    stability: 0.55,
    similarity_boost: 0.82
  });
});

test('resolveTechVoiceProfile ignores arbitrary ElevenLabs ids and locks to Indian English', () => {
  assert.equal(resolveTechVoiceProfile(undefined).id, 'TECH_ENGLISH_INDIA');
  assert.equal(resolveTechVoiceProfile('en-US-GuyNeural').id, 'TECH_ENGLISH_INDIA');
  assert.equal(resolveTechVoiceProfile('u7bRcYbD7visSINTyAT8').id, 'TECH_ENGLISH_INDIA');
  assert.equal(resolveTechVoiceProfile('TECH_HINDI').id, 'TECH_HINDI');
  assert.equal(resolveTechVoiceProfile('hi-IN-MadhurNeural').id, 'TECH_HINDI');
  assert.equal(techElevenLabsVoiceId(TECH_ENGLISH_INDIA), 'u7bRcYbD7visSINTyAT8');
  assert.equal(techElevenLabsVoiceId(TECH_ENGLISH_INDIA, 'nwj0s2LU9bDWRKND5yzA'), 'nwj0s2LU9bDWRKND5yzA');
  assert.equal(techElevenLabsVoiceId(TECH_ENGLISH_INDIA, 'mSYK1wXyDo9la60dBOyK'), 'u7bRcYbD7visSINTyAT8');
});
