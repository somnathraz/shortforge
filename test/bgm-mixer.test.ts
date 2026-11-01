import assert from 'node:assert/strict';
import test from 'node:test';
import { bgmAtempo, bgmVolumeForMood, buildBgmFilter, planBgmFit } from '../src/audio/bgm-mixer.js';
import { effectiveSfxMixVolume } from '../src/audio/sfx-mixer.js';

test('short BGM plans a loop to cover the voice', () => {
  const fit = planBgmFit(60, 18);
  assert.equal(fit.loop, true);
  assert.equal(fit.voiceDurationSeconds, 60);
  assert.ok(fit.fadeOutStartSeconds < 60);
  assert.ok(fit.fadeOutSeconds > 0);
});

test('long BGM is trimmed — no loop', () => {
  const fit = planBgmFit(42, 120);
  assert.equal(fit.loop, false);
  assert.equal(fit.voiceDurationSeconds, 42);
  assert.ok(Math.abs(fit.fadeOutStartSeconds + fit.fadeOutSeconds - 42) < 0.001);
});

test('near-equal lengths do not loop for float noise', () => {
  assert.equal(planBgmFit(40, 39.95).loop, false);
  assert.equal(planBgmFit(40, 39.8).loop, true);
});

test('rejects invalid durations', () => {
  assert.throws(() => planBgmFit(0, 10), /Invalid voice/);
  assert.throws(() => planBgmFit(10, -1), /Invalid BGM/);
});

test('BGM defaults leave music well below narration without changing tempo', () => {
  assert.equal(bgmVolumeForMood('divine_mystery'), 0.5);
  assert.equal(bgmVolumeForMood('epic_battle'), 0.55);
  assert.equal(bgmVolumeForMood('emotional'), 0.45);
  assert.equal(bgmAtempo(), 1);
});

test('very quiet BGM settings and explicit mute are honored', () => {
  const previous = process.env.BGM_VOLUME;
  try {
    process.env.BGM_VOLUME = '0.1'; assert.equal(bgmVolumeForMood('emotional'), 0.1);
    process.env.BGM_VOLUME = '0'; assert.equal(bgmVolumeForMood('emotional'), 0);
  } finally { if (previous === undefined) delete process.env.BGM_VOLUME; else process.env.BGM_VOLUME = previous; }
});

test('loop filter applies tempo before trim so BGM covers full voice', () => {
  const fit = planBgmFit(50, 12);
  const filter = buildBgmFilter(0.22, fit, 1.12, { normalizeBgm: false, duckAgainstNarration: false });
  assert.match(filter, /aloop=loop=-1/);
  assert.match(filter, /volume=0\.2200/);
  assert.match(filter, /duration=first/);
  const aloop = filter.indexOf('aloop=');
  const atempo = filter.indexOf('atempo=1.120');
  const atrim = filter.indexOf('atrim=0:50');
  assert.ok(aloop >= 0 && atempo > aloop && atrim > atempo, 'order: aloop → atempo → atrim');
});

test('default tempo omits atempo; loudnorm and duck when enabled', () => {
  const fit = planBgmFit(40, 120);
  const filter = buildBgmFilter(0.7, fit, 1.0, { normalizeBgm: true, duckAgainstNarration: true });
  assert.doesNotMatch(filter, /atempo=/);
  assert.match(filter, /loudnorm=I=-30/);
  assert.match(filter, /sidechaincompress=threshold=0\.035:ratio=4/);
  assert.match(filter, /level=0/);
  assert.match(filter, /\[2:a\]/);
  assert.match(filter, /volume=0\.7000/);
});

test('SFX mix gain stays accent-level under narration', () => {
  const oneShot = effectiveSfxMixVolume(0.5, 'divine-chime');
  assert.ok(oneShot <= 0.24);
  assert.ok(oneShot < 0.5); // never as loud as raw plan volume after soft gain
  const ambience = effectiveSfxMixVolume(0.5, 'wind');
  assert.ok(ambience <= 0.16);
  assert.equal(effectiveSfxMixVolume(0), 0);
});
