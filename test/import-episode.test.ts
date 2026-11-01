import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import { formatImportIssues, importEpisodeJson } from '../src/pipeline/importEpisode.js';

describe('importEpisodeJson', () => {
  it('validates the shared template dry-run', async () => {
    const result = await importEpisodeJson(episodeScriptTemplate(), { dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.file, undefined);
    assert.ok(result.episode.spokenHook);
    assert.ok((result.episode.featuredLords || []).length >= 1);
  });

  it('writes a valid file under a temp episodes dir', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mf-import-'));
    try {
      const result = await importEpisodeJson(episodeScriptTemplate(), {
        episodesDirectory: dir
      });
      assert.equal(result.dryRun, false);
      assert.ok(result.file);
      const raw = await readFile(path.join(dir, result.file!), 'utf8');
      const parsed = JSON.parse(raw) as { id: string; spokenHook: string };
      assert.equal(parsed.id, 'hanuman-forgot-powers');
      assert.ok(parsed.spokenHook.includes('हनुमान'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('auto-versions duplicate ids into a new draft instead of failing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mf-import-dup-'));
    try {
      const first = await importEpisodeJson(episodeScriptTemplate(), { episodesDirectory: dir });
      assert.equal(first.episode.id, 'hanuman-forgot-powers');
      const second = await importEpisodeJson(episodeScriptTemplate(), { episodesDirectory: dir });
      assert.equal(second.episode.id, 'hanuman-forgot-powers-v2');
      assert.equal(second.idRenamedFrom, 'hanuman-forgot-powers');
      assert.ok(second.file);
      assert.notEqual(first.file, second.file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rewrites placeholder my-episode ids from the title', async () => {
    const raw = {
      ...episodeScriptTemplate(),
      id: 'my-episode-009',
      titleEn: 'Why Bhishma Lowered His Bow',
      topic: 'The warrior Bhishma refused to fight'
    };
    const result = await importEpisodeJson(raw, { dryRun: true });
    assert.equal(result.episode.id, 'why-bhishma-lowered-his-bow');
  });

  it('rejects missing spokenHook via editorial gate', async () => {
    const bad = episodeScriptTemplate() as Record<string, unknown>;
    delete bad.spokenHook;
    delete bad.spokenHookDurationSeconds;
    delete bad.hookDelivery;
    // Timeline still assumes hook — schema may fail first; either way import must fail.
    await assert.rejects(() => importEpisodeJson(bad, { dryRun: true }));
  });

  it('formatImportIssues maps Zod paths', async () => {
    try {
      await importEpisodeJson({ id: 'x' }, { dryRun: true });
      assert.fail('expected throw');
    } catch (error) {
      const issues = formatImportIssues(error);
      assert.ok(issues.length >= 1);
      assert.ok(issues.every((row) => row.path && row.message));
    }
  });
});
