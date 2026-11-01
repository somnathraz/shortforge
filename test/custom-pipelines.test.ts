import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const brandsModule = pathToFileURL(path.join(repo, 'src/lib/brands.ts')).href;

const BASE = {
  label: 'X', blurb: 'x', studioSubtitle: 'x', episodesDir: 'data/e', universeFile: 'data/u.json',
  scriptBrief: 't.txt', visualBrand: 'EPICASTRA_HERITAGE', defaultLanguage: 'en', publishProfiles: ['youtube'],
  s3Prefix: 'x/', ctaDefault: 'x', emptyListCopy: 'x', newEpisodeLabel: 'x', theme: 'heritage'
};

/** Runs brands.ts in a throwaway cwd (it reads config/brands from process.cwd() at import time). */
function inSandbox(files: Record<string, unknown>, expression: string, env: Record<string, string> = {}) {
  mkdirSync(path.join(repo, 'tmp'), { recursive: true });
  const dir = mkdtempSync(path.join(repo, 'tmp', 'pipelines-'));
  try {
    mkdirSync(path.join(dir, 'config/brands'), { recursive: true });
    for (const [name, value] of Object.entries(files)) {
      writeFileSync(path.join(dir, 'config/brands', name), JSON.stringify(value));
    }
    const code = `const b = await import(${JSON.stringify(brandsModule)}); console.log(JSON.stringify(${expression}));`;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DEFAULT_BRAND: '', ...env }
    });
    return JSON.parse(out.trim().split('\n').pop()!);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('pipelines are discovered from config/brands/*.json; _files are ignored', () => {
  const result = inSandbox(
    {
      'my-story.json': { ...BASE, id: 'my-story', kind: 'story' },
      'my-tech.json': { ...BASE, id: 'my-tech', kind: 'tech', theme: 'tech' },
      '_template.json': { id: 'not-loaded' }
    },
    '{ ids: b.BRAND_IDS, def: b.DEFAULT_BRAND_ID, tech: [b.isTechBrand("my-tech"), b.isTechBrand("my-story"), b.isTechBrand("nope")], resolved: b.resolveBrandId("MY-TECH"), fallback: b.resolveBrandId("zzz") }'
  );
  assert.deepEqual(result.ids, ['my-story', 'my-tech']);
  assert.equal(result.def, 'my-story');
  assert.deepEqual(result.tech, [true, false, false]);
  assert.equal(result.resolved, 'my-tech');
  assert.equal(result.fallback, 'my-story');
});

test('DEFAULT_BRAND picks the default pipeline when it exists', () => {
  const files = {
    'a-one.json': { ...BASE, id: 'a-one' },
    'b-two.json': { ...BASE, id: 'b-two' }
  };
  assert.equal(inSandbox(files, 'b.DEFAULT_BRAND_ID', { DEFAULT_BRAND: 'b-two' }), 'b-two');
  assert.equal(inSandbox(files, 'b.DEFAULT_BRAND_ID', { DEFAULT_BRAND: 'missing' }), 'a-one');
});

test('kind defaults to story, and invalid configs fail loudly', () => {
  assert.equal(inSandbox({ 'a-one.json': { ...BASE, id: 'a-one' } }, 'b.brandKind("a-one")'), 'story');
  const run = (files: Record<string, unknown>) => () => inSandbox(files, 'b.BRAND_IDS');
  assert.throws(run({ 'a-one.json': { ...BASE, id: 'a-one', kind: 'podcast' } }), /kind must be one of/);
  assert.throws(run({ 'a-one.json': { ...BASE, id: 'other' } }), /id mismatch/);
  assert.throws(run({ 'a-one.json': { ...BASE, id: 'a-one', ctaDefault: '' } }), /missing: ctaDefault/);
  assert.throws(run({ 'Bad Name.json': { ...BASE, id: 'Bad Name' } }), /pipeline id must match/);
});

test('script bundles use the pipeline id and kind of a custom pipeline', async () => {
  const { buildScriptBundle } = await import('../src/lib/episodeScriptTemplate.js');
  const story = buildScriptBundle('tomorrow-channel');
  assert.equal(story.brandId, 'tomorrow-channel');
  assert.equal((story.template as { brandId?: string }).brandId, 'tomorrow-channel');
});
