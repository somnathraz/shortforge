import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStillEffects, stillFilterArgs } from '../src/lib/stillEffects.js';

test('effects default off and reject invalid modes', () => {
  assert.equal(parseStillEffects(), 'off');
  assert.throws(() => parseStillEffects('unknown'));
  assert.deepEqual(stillFilterArgs('null', 180, 320, 30, 1, 'off'), ['-vf', 'null']);
});
test('water displacement is opt-in; atmosphere preserves the original geometry', () => {
  const atmosphere = stillFilterArgs('null', 180, 320, 30, 1, 'atmosphere').join(' ');
  const water = stillFilterArgs('null', 180, 320, 30, 1, 'water').join(' ');
  assert.doesNotMatch(atmosphere, /displace/);
  assert.match(atmosphere, /\[particles\]/);
  assert.match(water, /displace/);
  assert.match(water, /Y\/H-0.87/);
  assert.match(water, /-map \[effects\]/);
});
