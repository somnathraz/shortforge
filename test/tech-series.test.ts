import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TechSeriesSchema,
  blankSeries,
  addSeriesDay,
  seriesPromptTopic,
  loadTechSeries
} from '../src/lib/techSeries.js';

test('sample DSA series validates with day titles', async () => {
  const series = TechSeriesSchema.parse(JSON.parse(await readFile('data/tech-series/dsa-from-zero.json', 'utf8')));
  assert.equal(series.id, 'dsa-from-zero');
  assert.ok(series.days.length >= 3);
  assert.equal(series.days.find((d) => d.day === 3)?.templateId, 'window.array');
});

test('blank series starts with Day 1 and Day 2 stubs', () => {
  const series = blankSeries('sys-basics', 'System Design Basics');
  assert.deepEqual(
    series.days.map((d) => d.day),
    [1, 2]
  );
  const withThird = addSeriesDay(series, 'Caching');
  assert.equal(withThird.days.at(-1)?.day, 3);
  assert.equal(withThird.days.at(-1)?.title, 'Caching');
  assert.match(seriesPromptTopic(series, series.days[0]!), /Day 1 of "System Design Basics"/);
});

test('loadTechSeries reads on-disk plan', async () => {
  const series = await loadTechSeries('dsa-from-zero');
  assert.equal(series.title, 'DSA from Zero');
});
