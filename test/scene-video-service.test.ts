import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  assertImageBelongsToScene,
  resolveSceneImageForVideo
} from '../src/pipeline/sceneVideo.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import { sceneVideoPath } from '../src/providers/videoGeneration.js';

describe('scene video image safety', () => {
  it('refuses scene-3 image for scene-4', () => {
    assert.throws(
      () => assertImageBelongsToScene(4, '/tmp/images/ep/scene-3.png', false),
      /belongs to scene 3/
    );
  });

  it('accepts matching scene-4 still', () => {
    assert.doesNotThrow(() =>
      assertImageBelongsToScene(4, '/tmp/images/ep/scene-4.png', false)
    );
  });

  it('resolves only the matching scene still from disk', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mf-scene-vid-'));
    const prevImages = process.env.IMAGES_DIR;
    process.env.IMAGES_DIR = path.join(root, 'images');
    try {
      const episode = EpisodeSchema.parse(episodeScriptTemplate());
      const dir = path.join(root, 'images', episode.id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'scene-3.png'), 'three');
      await writeFile(path.join(dir, 'scene-4.png'), 'four');
      const resolved = await resolveSceneImageForVideo({ episode, sceneId: 4 });
      assert.match(resolved.absolute, /scene-4\.png$/);
      assert.doesNotMatch(resolved.absolute, /scene-3/);
    } finally {
      if (prevImages === undefined) delete process.env.IMAGES_DIR;
      else process.env.IMAGES_DIR = prevImages;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stable output path is scene-N.mp4 under ai-video/<id>/', () => {
    assert.equal(
      sceneVideoPath('demo-ep', 4).replace(/\\/g, '/').endsWith('ai-video/demo-ep/scene-4.mp4'),
      true
    );
  });
});
