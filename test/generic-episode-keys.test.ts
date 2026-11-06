import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyGenericEpisodeKeys, toGenericEpisodeKeys, toGenericEpisodeText } from '../src/lib/episodeAliases.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { buildScriptBundle } from '../src/lib/episodeScriptTemplate.js';

test('generic keys map to stored keys and back', () => {
  const generic = {
    title: 'T',
    titleEnglish: 'TE',
    characters: [{ name: 'A', nameLocal: 'ए' }],
    scenes: [{ narration: 'n', appearingCharacters: ['A'], voiceSegments: [{ text: 'x' }] }],
    ending: { payoff: 'p', nextEpisodeTease: 't' },
    metadata: { description: 'd', thumbnailText: 'th' }
  };
  const stored = applyGenericEpisodeKeys(generic) as any;
  assert.equal(stored.titleHi, 'T');
  assert.equal(stored.featuredLords[0].nameEn, 'A');
  assert.equal(stored.scenes[0].narrationHi, 'n');
  assert.equal(stored.scenes[0].voiceSegments[0].textHi, 'x');
  assert.equal(stored.ending.payoffHi, 'p');
  assert.deepEqual(toGenericEpisodeKeys(stored), generic);
});

test('stored (legacy) keys are untouched and win over generic duplicates', () => {
  const legacy = { titleHi: 'old', title: 'new', scenes: [{ narrationHi: 'a' }] };
  const out = applyGenericEpisodeKeys(legacy) as any;
  assert.equal(out.titleHi, 'old');
  assert.equal(out.scenes[0].narrationHi, 'a');
});

test('story script template validates through the alias layer', () => {
  const bundle = buildScriptBundle('epicastra');
  assert.ok(!JSON.stringify(bundle.template).includes('narrationHi'));
  assert.ok(!bundle.llmPrompt.includes('featuredLords'));
  assert.ok(toGenericEpisodeText('featuredLords.nameEn').includes('characters.name'));
  EpisodeSchema.parse(applyGenericEpisodeKeys({ ...bundle.template }));
});

test('aliasing adds no undefined keys and leaves stored episodes structurally identical', () => {
  const stored = { titleHi: 't', scenes: [{ narrationHi: 'n' }], ending: { payoffHi: 'p' } };
  const out = applyGenericEpisodeKeys(stored) as any;
  assert.deepEqual(out, stored);
  assert.ok(!('featuredLords' in out));
  assert.ok(!('voiceSegments' in out.scenes[0]));
});

test('import errors name generic fields', async () => {
  const { formatImportIssues } = await import('../src/pipeline/importEpisode.js');
  const bad = { ...(buildScriptBundle('epicastra').template as any) };
  bad.scenes = [{ ...bad.scenes[0], narration: '' }, ...bad.scenes.slice(1)];
  try {
    EpisodeSchema.parse(applyGenericEpisodeKeys(bad));
    assert.fail('expected a validation error');
  } catch (error) {
    const paths = formatImportIssues(error).map((i) => i.path).join(' ');
    assert.match(paths, /scenes\.0\.narration\b/);
    assert.doesNotMatch(paths, /narrationHi/);
  }
});
