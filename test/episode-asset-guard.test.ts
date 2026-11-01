import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAssetBelongsToEpisode,
  assertExternalVideoPath,
  assetBelongsToEpisode
} from '../src/lib/episodeAssetGuard.js';

test('episode-tagged flat audio/video paths belong', () => {
  assert.equal(assetBelongsToEpisode('audio/my-episode-002-final-mix.wav', 'my-episode-002'), true);
  assert.equal(assetBelongsToEpisode('final/my-episode-002-external-mux-x.mp4', 'my-episode-002'), true);
  assert.equal(assetBelongsToEpisode('audio/other-episode-final-mix.wav', 'my-episode-002'), false);
});

test('dir-scoped external uploads belong only to that episode', () => {
  assert.equal(
    assetBelongsToEpisode('external/my-episode-002/source-1.mp4', 'my-episode-002'),
    true
  );
  assert.equal(
    assetBelongsToEpisode('external/other-id/source-1.mp4', 'my-episode-002'),
    false
  );
  assert.doesNotThrow(() =>
    assertExternalVideoPath('external/my-episode-002/source-1.mp4', 'my-episode-002')
  );
  assert.throws(
    () => assertExternalVideoPath('video/my-episode-002-foo.mp4', 'my-episode-002'),
    /must be under external/
  );
  assert.throws(
    () => assertAssetBelongsToEpisode('audio/someone-else.mp3', 'my-episode-002', 'Audio'),
    /cross-episode/
  );
});
