import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveSceneImageReferences } from '../src/lib/imageReferences.js';
import { buildSceneImagePrompt, buildSceneImagePromptAsync } from '../src/lib/sceneImage.js';

test('a continuity-only reference retains its role when style and character are absent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'myth-refs-'));
  const keys = ['IMAGES_DIR', 'CHARACTERS_DIR', 'EPICASTRA_STYLE_REFERENCE_IMAGE', 'EPICASTRA_MASTER_STYLE_IMAGE', 'EPICASTRA_CHARACTER_REFERENCE_IMAGE'];
  const saved = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    process.env.IMAGES_DIR = root;
    process.env.CHARACTERS_DIR = path.join(root, 'characters');
    await mkdir(path.join(root, 'episode'));
    await writeFile(path.join(root, 'episode', 'scene-1.png'), 'test');
    const refs = await resolveSceneImageReferences({ visualPrompt: 'A river', episodeId: 'episode', sceneId: 2 });
    assert.deepEqual(refs.referenceImageRoles, ['SCENE CONTINUITY REFERENCE']);
    assert.equal(refs.referenceImagePaths.length, 1);
    await mkdir(path.join(root, '_style'));
    await writeFile(path.join(root, '_style', 'master-style.jpg'), 'test');
    await writeFile(path.join(root, '_style', 'detail-style.png'), 'test');
    const withStyle = await resolveSceneImageReferences({ visualPrompt: 'A river', episodeId: 'episode', sceneId: 2 });
    assert.deepEqual(withStyle.referenceImageRoles, ['MASTER STYLE REFERENCE', 'MASTER STYLE REFERENCE', 'SCENE CONTINUITY REFERENCE']);
  } finally {
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
    await rm(root, { recursive: true, force: true });
  }
});

test('script identity is injected once and async provider prompt matches preview', async () => {
  const options = {
    episode: { featuredLords: [{ nameEn: 'Vishnu', importance: 'primary', visualIdentity: 'blue-skinned deity with exactly four arms', doNotConfuseWith: 'Brahma' }] },
    scene: { id: 1, importance: 8, appearingLords: ['Vishnu'] }
  };
  const prompt = buildSceneImagePrompt('Vishnu holds a conch', options);
  assert.equal(prompt.split('blue-skinned deity with exactly four arms').length - 1, 1);
  assert.equal(await buildSceneImagePromptAsync('Vishnu holds a conch', options), prompt);
  assert.match(prompt, /intentional divine anatomy is not an anatomical error/);
  assert.match(prompt, /rich radiant gold/);
});
