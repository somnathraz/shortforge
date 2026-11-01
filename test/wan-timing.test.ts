import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWanPlan,
  planWanClipFromNarration,
  snapDim,
  snapWanFrames
} from '../src/lib/wanTiming.js';

test('snapWanFrames stays on 4n+1', () => {
  assert.equal(snapWanFrames(84, 129), 81);
  assert.equal(snapWanFrames(97, 129), 97);
  assert.equal(snapWanFrames(200, 129), 129);
  assert.equal(snapWanFrames(1, 129), 5);
});

test('snapDim rounds to multiples of 16', () => {
  assert.equal(snapDim(704), 704);
  assert.equal(snapDim(700), 704);
  assert.equal(snapDim(50), 64);
});

test('planWanClipFromNarration matches Comfy floor(duration*fps+1) on 4n+1', () => {
  const plan = planWanClipFromNarration(6, { fps: 16, width: 704, height: 1280, maxFrames: 129 });
  assert.equal(plan.frames, 97);
  assert.equal(plan.durationSeconds, (97 - 1) / 16);
  assert.equal(Math.floor(plan.durationSeconds * plan.fps + 1), plan.frames);
  assert.equal(plan.width, 704);
  assert.equal(plan.height, 1280);
  assert.equal(plan.clamped, false);
  assert.match(formatWanPlan(plan), /6\.00s · 97f @ 16fps · 704×1280/);
});

test('planWanClipFromNarration clamps long narration to max frames', () => {
  const plan = planWanClipFromNarration(20, { fps: 16, maxFrames: 81 });
  assert.equal(plan.frames, 81);
  assert.equal(plan.clamped, true);
  assert.equal(Math.floor(plan.durationSeconds * plan.fps + 1), 81);
});
