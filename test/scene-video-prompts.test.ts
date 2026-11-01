import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { episodeScriptTemplate } from '../src/lib/episodeScriptTemplate.js';
import { importEpisodeJson } from '../src/pipeline/importEpisode.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { mockEpisode } from '../src/providers/mock.js';

describe('scene videoPrompt fields', () => {
  it('imports old JSON without videoPrompt / videoNegativePrompt', async () => {
    const oldStyle = mockEpisode('Why Hanuman forgot his powers') as {
      scenes: Array<Record<string, unknown>>;
    };
    for (const scene of oldStyle.scenes) {
      delete scene.videoPrompt;
      delete scene.videoNegativePrompt;
    }
    const result = await importEpisodeJson(oldStyle, { dryRun: true });
    assert.ok(result.episode.scenes.every((scene) => scene.visualPrompt));
    assert.ok(
      result.episode.scenes.every(
        (scene) => scene.videoPrompt === undefined && scene.videoNegativePrompt === undefined
      )
    );
  });

  it('imports new JSON that includes videoPrompt fields on AI_VIDEO scenes', async () => {
    const result = await importEpisodeJson(episodeScriptTemplate(), { dryRun: true });
    const videoScenes = result.episode.scenes.filter((scene) => scene.renderMode === 'AI_VIDEO');
    assert.ok(videoScenes.length >= 1);
    for (const scene of videoScenes) {
      assert.ok(scene.videoPrompt && scene.videoPrompt.length > 10);
      assert.ok(scene.videoNegativePrompt && scene.videoNegativePrompt.length > 10);
      assert.notEqual(scene.videoPrompt, scene.visualPrompt);
    }
  });

  it('accepts a STILL scene without videoPrompt', () => {
    const raw = episodeScriptTemplate() as {
      scenes: Array<Record<string, unknown>>;
    };
    const still = raw.scenes.find((scene) => scene.renderMode === 'STILL');
    assert.ok(still);
    delete still.videoPrompt;
    delete still.videoNegativePrompt;
    const episode = EpisodeSchema.parse(raw);
    const parsed = episode.scenes.find((scene) => scene.id === still.id);
    assert.equal(parsed?.renderMode, 'STILL');
    assert.equal(parsed?.videoPrompt, undefined);
    assert.equal(parsed?.videoNegativePrompt, undefined);
  });

  it('accepts an AI_VIDEO scene with videoPrompt', () => {
    const raw = episodeScriptTemplate() as {
      scenes: Array<Record<string, unknown>>;
    };
    const ai = raw.scenes.find((scene) => scene.renderMode === 'AI_VIDEO');
    assert.ok(ai);
    ai.videoPrompt =
      'Kaundinya pulls the sacred red thread away and throws it toward the fire. Sushila reacts with shock. The thread moves naturally through the air and falls into the flames. Fire flares slightly. Clothing and hair move naturally. Camera slowly follows the thread. Preserve faces, clothing and character identity.';
    ai.videoNegativePrompt =
      'facial deformation, extra fingers, extra limbs, warped hands, changing identity, morphing faces, changing clothes, frame flicker, floating objects, unnatural body movement';
    const episode = EpisodeSchema.parse(raw);
    const parsed = episode.scenes.find((scene) => scene.id === ai.id);
    assert.equal(parsed?.renderMode, 'AI_VIDEO');
    assert.match(parsed?.videoPrompt || '', /Preserve faces/);
    assert.match(parsed?.videoNegativePrompt || '', /facial deformation/);
  });
});
