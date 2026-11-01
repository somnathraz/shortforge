import test from 'node:test';
import assert from 'node:assert/strict';
import { EpisodeSchema } from '../src/schema/episode.js';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import { publishingTitle } from '../src/lib/publishingTitles.js';
import { seedPackagingCopy } from '../src/pipeline/packageEpisode.js';
import { packageEpisode } from '../src/pipeline/packageEpisode.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('JSON title priority: platform, shared, correct language legacy title', () => {
  const episode = EpisodeSchema.parse(episodeScriptTemplate());
  assert.equal(publishingTitle(episode, 'en', 'youtube'), episode.publishingTitles?.en?.youtube);
  assert.equal(publishingTitle(episode, 'en', 'youtube', true), episode.publishingTitles?.en?.shared);
  const shared = { ...episode, publishingTitles: { en: { shared: 'One shared title' } } };
  for (const platform of ['youtube', 'instagram', 'facebook'] as const) assert.equal(publishingTitle(shared, 'en', platform), 'One shared title');
  const { publishingTitles: _, ...legacy } = episode;
  assert.equal(publishingTitle(legacy, 'hi', 'youtube'), episode.titleHi);
  assert.equal(publishingTitle(legacy, 'en', 'youtube'), episode.titleEn);
  assert.equal(seedPackagingCopy(episode, 'en').platforms[0]?.title, episode.publishingTitles?.en?.youtube);
  assert.equal(seedPackagingCopy(legacy, 'hi').platforms[0]?.title, episode.titleHi);
});

test('schema keeps custom titles, accepts old JSON and rejects unusable titles', () => {
  const sample = episodeScriptTemplate();
  assert.ok(EpisodeSchema.parse(sample).publishingTitles);
  for (const shared of ['', 'ab', 'x'.repeat(101)]) {
    assert.equal(EpisodeSchema.safeParse({ ...sample, publishingTitles: { en: { shared } } }).success, false);
  }
});

test('saved title changes preserve descriptions, other platforms and language; text downloads agree', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mythos-titles-'));
  const original = process.cwd();
  const oldPackagingDir = process.env.PACKAGING_DIR;
  process.chdir(dir);
  delete process.env.PACKAGING_DIR;
  try {
    const { applyJsonTitles, loadPackaging } = await import('../src/ui-server/packaging.js');
    const episode = EpisodeSchema.parse(episodeScriptTemplate());
    for (const language of ['hi', 'en'] as const) await packageEpisode({ episode, language, copyProvider: 'seed', skipCovers: true });
    const hiPath = path.join(dir, 'output/packaging', episode.id, 'packaging.hi.json');
    const hiBefore = await readFile(hiPath, 'utf8');
    const before = (await loadPackaging(episode.id, 'en'))!;
    const custom = { ...episode, publishingTitles: { en: { shared: 'One title everywhere', youtube: 'A YouTube specific title' } } };
    const single = await applyJsonTitles(custom, 'en', 'youtube', false);
    assert.equal(single.platforms[0]?.title, 'A YouTube specific title');
    assert.equal(single.platforms[1]?.title, before.platforms[1]?.title);
    const all = await applyJsonTitles(custom, 'en', 'all', true);
    for (const [index, pack] of all.platforms.entries()) {
      assert.equal(pack.title, 'One title everywhere');
      assert.equal(pack.description, before.platforms[index]?.description);
      assert.match(await readFile(path.join(dir, 'output/packaging', episode.id, `${pack.platform}.en.txt`), 'utf8'), /^TITLE: One title everywhere/);
    }
    assert.equal(await readFile(hiPath, 'utf8'), hiBefore);
  } finally {
    process.chdir(original);
    if (oldPackagingDir === undefined) delete process.env.PACKAGING_DIR; else process.env.PACKAGING_DIR = oldPackagingDir;
    await rm(dir, { recursive: true, force: true });
  }
});
