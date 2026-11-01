import assert from 'node:assert/strict';
import test from 'node:test';
import { pickMotion, zoompanFilter } from '../src/lib/stillMotion.js';

test('framing descriptions use approved glide rather than accidental movement', () => {
  for (const camera of ['wide low-angle shot', 'medium-close portrait', 'close-up, upper left subject', 'eye-level two-shot']) {
    assert.equal(pickMotion(camera, 3), 'glide');
  }
  assert.equal(pickMotion('wide shot, pan left'), 'pan_left');
  assert.equal(pickMotion('slow push-in'), 'zoom_in');
  assert.equal(pickMotion('slow pull back'), 'zoom_out');
  assert.equal(pickMotion('tilt up'), 'rise');
});

test('pan uses available crop travel and duration-normalized easing', () => {
  const filter = zoompanFilter(8, 30, 1080, 1920, 'pan_right', 'medium');
  assert.match(filter, /iw-iw\/zoom/);
  assert.match(filter, /min\(on,239\)\/239/);
  assert.doesNotMatch(filter, /zoom\+|0\.22\*iw/);
  assert.doesNotMatch(zoompanFilter(1 / 30, 30, 1080, 1920, 'glide', 'low'), /\/0\)/);
});
