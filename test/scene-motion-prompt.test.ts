import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sceneMotionNegativePrompt,
  sceneMotionPrompt
} from '../src/lib/sceneMotionPrompt.js';
import type { Scene } from '../src/schema/episode.js';

const base: Scene = {
  id: 1,
  startSecond: 0,
  durationSeconds: 5,
  narrationHi: 'x',
  visualPrompt: 'Sage beside a sacred fire, still composition',
  camera: 'slow push in',
  importance: 8,
  renderMode: 'AI_VIDEO',
  soundCue: 'fire'
};

test('sceneMotionPrompt prefers videoPrompt over visualPrompt', () => {
  const withVideo: Scene = {
    ...base,
    videoPrompt: 'Sage throws the thread into the fire. Camera follows. Preserve identity.'
  };
  assert.equal(sceneMotionPrompt(withVideo), withVideo.videoPrompt);
  assert.match(sceneMotionPrompt(base), /Sage beside a sacred fire/);
  assert.match(sceneMotionPrompt(base), /Camera: slow push in/);
});

test('sceneMotionNegativePrompt uses scene field then default', () => {
  const withNeg: Scene = {
    ...base,
    videoNegativePrompt: 'extra fingers, morphing faces'
  };
  assert.equal(sceneMotionNegativePrompt(withNeg), 'extra fingers, morphing faces');
  assert.match(sceneMotionNegativePrompt(base), /facial deformation|extra limbs|deformed/i);
});
