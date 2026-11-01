import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHookVisualPrompt,
  buildSceneImagePrompt,
  resolveHookVisualPrompt
} from '../src/lib/sceneImage.js';
import { resolveEpisodeVisualStyle } from '../src/visual/resolveVisualStyle.js';
import {
  buildTechEditorialImagePrompt,
  isTechEditorialEpisode
} from '../src/visual/tech-editorial-style.js';

test('tech episodes resolve TECH_EDITORIAL without heritage frameVariant', () => {
  const style = resolveEpisodeVisualStyle({
    brandId: 'tech-instagram',
    storyKind: 'TECH_EDUCATION'
  });
  assert.deepEqual(style, { brand: 'TECH_EDITORIAL' });
  assert.equal(isTechEditorialEpisode({ brandId: 'tech-instagram' }), true);
});

test('tech image prompt has no heritage frame language', () => {
  const prompt = buildSceneImagePrompt(
    'Array cells with a pointer path; leave empty label bands for overlays',
    {
      episode: {
        brandId: 'tech-instagram',
        storyKind: 'TECH_EDUCATION',
        featuredLords: [
          {
            nameEn: 'Input Size n',
            importance: 'primary',
            visualIdentity: 'rounded tech card for n',
            doNotConfuseWith: 'runtime seconds'
          }
        ]
      },
      scene: { id: 1, importance: 9, appearingLords: ['Input Size n'] },
      scenes: [{ id: 1, importance: 9 }],
      camera: 'slow push in',
      strictAppearingLords: true
    }
  );
  assert.match(prompt, /Tech Editorial/i);
  assert.match(prompt, /Remotion|overlays|exact labels/i);
  // Heritage may appear only in [NEGATIVE] avoid-list — never as a positive style instruction.
  const positive = prompt.split(/\[NEGATIVE\]/i)[0] || '';
  assert.doesNotMatch(positive, /THIN heritage frame|STRONG heritage frame|EpicAstra Heritage/i);
  assert.doesNotMatch(positive, /lotus|peacock/i);
  assert.match(prompt, /\[NEGATIVE\][\s\S]*heritage frame/i);
});

test('buildTechEditorialImagePrompt strips heritage bleed', () => {
  const prompt = buildTechEditorialImagePrompt({
    sceneDescription: 'Boxes and arrows. THIN heritage frame with lotus motifs. EpicAstra wordmark.'
  });
  const sceneAction = prompt.match(/\[SCENE ACTION\](.*?)\[/s)?.[1] || '';
  assert.doesNotMatch(sceneAction, /THIN heritage frame/i);
  assert.doesNotMatch(sceneAction, /lotus motifs/i);
  assert.doesNotMatch(sceneAction, /EpicAstra wordmark/i);
});

test('tech hook visual prompt is diagram cold open, not mythology faces', () => {
  const episode = {
    brandId: 'tech-instagram',
    storyKind: 'TECH_EDUCATION',
    spokenHook: 'What does Big O actually tell us?',
    featuredLords: [
      {
        nameEn: 'Input Size n',
        importance: 'primary' as const,
        visualIdentity: 'rounded tech card for n',
        doNotConfuseWith: 'runtime seconds'
      }
    ]
  };
  const prompt = buildHookVisualPrompt(episode);
  assert.match(prompt, /tech education Short/i);
  assert.match(prompt, /Input Size n/);
  assert.match(prompt, /Remotion|overlays/i);
  assert.doesNotMatch(prompt, /mythology Short|facial emotion|warm cinematic light|readable faces/i);

  const overrideBleed = resolveHookVisualPrompt({
    ...episode,
    hookVisualPrompt:
      'SPOKEN HOOK opening still for a vertical mythology Short. strong facial emotion. warm cinematic light.'
  });
  assert.match(overrideBleed, /tech education Short/i);
  assert.doesNotMatch(overrideBleed, /mythology Short|facial emotion/i);
});
