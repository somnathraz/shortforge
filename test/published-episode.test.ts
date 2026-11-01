import assert from 'node:assert/strict';
import test from 'node:test';
import { isProductionPublished } from '../src/lib/publishedEpisode.js';

test('published when uploaded result matches current final', () => {
  assert.equal(
    isProductionPublished({
      finalVideo: '/api/media/final/ep-1-final.mp4',
      publish: {
        lastAt: '2026-09-09T00:00:00.000Z',
        dryRun: false,
        results: [
          {
            platform: 'youtube',
            status: 'uploaded',
            videoPath: 'output/final/ep-1-final.mp4'
          }
        ]
      }
    }),
    true
  );
});

test('not published when only failed results or wrong video', () => {
  assert.equal(
    isProductionPublished({
      finalVideo: '/api/media/final/ep-1-final.mp4',
      publish: {
        lastAt: '2026-09-09T00:00:00.000Z',
        dryRun: false,
        results: [
          {
            platform: 'youtube',
            status: 'uploaded',
            error: 'boom',
            videoPath: 'output/final/ep-1-final.mp4'
          }
        ]
      }
    }),
    false
  );
  assert.equal(
    isProductionPublished({
      finalVideo: '/api/media/final/ep-1-final.mp4',
      publish: {
        lastAt: '2026-09-09T00:00:00.000Z',
        dryRun: false,
        results: [
          {
            platform: 'youtube',
            status: 'uploaded',
            videoPath: 'output/final/other-final.mp4'
          }
        ]
      }
    }),
    false
  );
});
