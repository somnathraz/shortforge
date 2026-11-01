import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScheduleAt, toUnixSeconds } from '../src/lib/publishSchedule.js';

describe('parseScheduleAt', () => {
  const now = Date.parse('2026-09-07T12:00:00.000Z');

  it('accepts ISO at least 15 minutes ahead', () => {
    const date = parseScheduleAt('2026-09-07T12:20:00.000Z', now);
    assert.equal(date.toISOString(), '2026-09-07T12:20:00.000Z');
  });

  it('rejects times less than 15 minutes ahead', () => {
    assert.throws(
      () => parseScheduleAt('2026-09-07T12:10:00.000Z', now),
      /at least 15 minutes/
    );
  });

  it('rejects invalid datetime', () => {
    assert.throws(() => parseScheduleAt('not-a-date', now), /Invalid schedule time/);
  });

  it('rejects more than 6 months ahead', () => {
    assert.throws(
      () => parseScheduleAt('2027-04-01T12:00:00.000Z', now),
      /6 months/
    );
  });

  it('toUnixSeconds floors milliseconds', () => {
    const date = new Date('2026-09-07T12:20:00.500Z');
    assert.equal(toUnixSeconds(date), Math.floor(date.getTime() / 1000));
  });
});
