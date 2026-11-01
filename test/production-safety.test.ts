import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { assertUniqueEpisodeId } from '../src/lib/episodeIdentity.js';
import { mergePublishHistory } from '../src/pipeline/publish.js';
import { scriptClaimsReady } from '../src/ui-server/episodes.js';

describe('production safety', () => {
  it('rejects a duplicate episode id before shared assets can be overwritten', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mythology-identity-'));
    try {
      await writeFile(path.join(dir, 'existing.json'), JSON.stringify({ id: 'story-001' }));
      await assert.rejects(
        assertUniqueEpisodeId('story-001', dir),
        /already used by existing\.json/
      );
      await assert.doesNotReject(assertUniqueEpisodeId('story-002', dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('requires every non-fiction claim to be supported', () => {
    const episode = {
      storyKind: 'CANONICAL_MYTHOLOGY',
      sourceReview: {
        status: 'NEEDS_REVIEW',
        claimsToVerify: ['claim one', 'claim two'],
        notes: []
      }
    };
    assert.deepEqual(scriptClaimsReady(episode, { '0': 'supported', '1': 'unchecked' }), {
      ready: false,
      unresolved: 1
    });
    assert.deepEqual(scriptClaimsReady(episode, { '0': 'supported', '1': 'supported' }), {
      ready: true,
      unresolved: 0
    });
  });

  it('keeps earlier upload ids when a later platform run fails', () => {
    const history = mergePublishHistory(
      [{ platform: 'youtube', status: 'uploaded', id: 'video-one', url: 'https://youtu.be/one' }],
      [{ platform: 'instagram', status: 'failed', error: 'token expired' }]
    );
    assert.equal(history.length, 2);
    assert.equal(history[0]?.id, 'video-one');
    assert.equal(history[1]?.status, 'failed');
  });
});
