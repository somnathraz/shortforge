import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSfxUsage, type ResolvedSfxCue } from '../src/audio/sfx-mixer.js';

test('summarizeSfxUsage counts skipped cues separately', () => {
  const resolved: ResolvedSfxCue[] = [
    { effect: 'fire', path: '/x/fire.wav', source: 'library', file: 'nature/fire.wav' },
    {
      effect: 'riser',
      path: '',
      source: 'skipped',
      file: '(missing — upload custom/riser.wav)'
    },
    { effect: 'divine-chime', path: '/x/c.wav', source: 'custom', file: 'custom/divine-chime.wav' }
  ];
  const usage = summarizeSfxUsage(resolved);
  assert.equal(usage.local, 2);
  assert.equal(usage.elevenlabs, 0);
  assert.equal(usage.skipped, 1);
  assert.equal(usage.cues.filter((c) => c.source === 'skipped').length, 1);
});
