import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSceneImagePrompt,
  characterLockFromFeaturedLords
} from '../src/lib/sceneImage.js';
import { validateImagePrompt } from '../src/lib/validateImagePrompt.js';
import {
  buildEpicAstraImagePrompt,
  inferHeritageVariant,
  resolveHeritageFrameWeight,
  visualStyleForEpisode
} from '../src/visual/epicastra-style.js';

test('CINEMATIC_GLOSS keeps EpicAstra top-border wordmark, no architecture or pixel placement', () => {
  const prompt = buildEpicAstraImagePrompt({
    sceneDescription: 'Young Krishna with calves in a moonlit gaushala courtyard',
    camera: 'slow push-in medium shot',
    variant: 'HERITAGE_CLASSIC',
    frameWeight: 'thin',
    look: 'CINEMATIC_GLOSS'
  });
  assert.match(prompt, /\[STYLE\]/);
  assert.match(prompt, /\[SCENE ACTION\]/);
  assert.match(prompt, /\[CAMERA\]/);
  assert.match(prompt, /\[CONSISTENCY\]/);
  assert.match(prompt, /\[NEGATIVE\]/);
  assert.match(prompt, /Cinematic Gloss|Heritage Classic/);
  assert.match(prompt, /THIN heritage frame/);
  assert.match(prompt, /Young Krishna/);
  assert.match(prompt, /CHANNEL WORDMARK ONLY/);
  assert.match(prompt, /EpicAstra/);
  assert.match(prompt, /jewelry filigree|glossy modern mythological/i);
  assert.doesNotMatch(prompt, /5 to 10 pixels|sacred Indian architecture/i);
  assert.match(prompt, /Avoid:.*text inside the central story scene/i);
});

test('CINEMATIC_DEVOTIONAL_3D is borderless feature-animation look with 3D negatives', () => {
  const prompt = buildEpicAstraImagePrompt({
    sceneDescription: 'Maa Ganga appears above sacred waters',
    look: 'CINEMATIC_DEVOTIONAL_3D'
  });
  assert.match(prompt, /Devotional 3D|animated feature film/i);
  assert.match(prompt, /subsurface scattering|sculpted human faces/i);
  assert.match(prompt, /borderless|post/i);
  assert.match(prompt, /Avoid:.*flat digital painting/i);
  assert.doesNotMatch(prompt, /CHANNEL WORDMARK ONLY/);
  assert.doesNotMatch(prompt, /jewelry filigree|digital painting for myth reels/i);
});

test('HERITAGE_PAINTERLY look keeps older painterly style when opted in', () => {
  const prompt = buildEpicAstraImagePrompt({
    sceneDescription: 'Hanuman leaps across the ocean',
    look: 'HERITAGE_PAINTERLY',
    frameWeight: 'thin'
  });
  assert.match(prompt, /Pattachitra|painterly realism/i);
  assert.match(prompt, /EpicAstra/);
  assert.doesNotMatch(prompt, /Cinematic Gloss/);
});

test('thin border locked for all importance levels by default', () => {
  const scenes = [
    { id: 1, importance: 8 },
    { id: 2, importance: 5 },
    { id: 3, importance: 5 },
    { id: 4, importance: 9 },
    { id: 5, importance: 4 },
    { id: 6, importance: 7 }
  ];
  for (const scene of scenes) {
    assert.equal(resolveHeritageFrameWeight(scene, scenes), 'thin');
  }
});

test('episode variant stays light for childhood; war stays classic unless rakshasa', () => {
  assert.equal(
    inferHeritageVariant({ topic: 'Krishna childhood naamkaran in the gaushala' }),
    'HERITAGE_LIGHT'
  );
  assert.equal(
    inferHeritageVariant({ topic: 'The curse that started the Mahabharata war' }),
    'HERITAGE_CLASSIC'
  );
  assert.equal(inferHeritageVariant({ topic: 'Why the shankh is blown in temples' }), 'HERITAGE_CLASSIC');
  assert.equal(
    inferHeritageVariant({
      topic: 'anything',
      visualStyle: { frameVariant: 'HERITAGE_DRAMATIC' }
    }),
    'HERITAGE_DRAMATIC'
  );
});

test('buildSceneImagePrompt wires heritage style for providers', () => {
  const prompt = buildSceneImagePrompt('Hanuman leaps across the ocean toward Lanka', {
    camera: 'wide heroic angle',
    frameVariant: 'HERITAGE_DRAMATIC',
    frameWeight: 'thin',
    look: 'CINEMATIC_GLOSS',
    scene: { id: 2, importance: 5 },
    scenes: [
      { id: 1, importance: 8 },
      { id: 2, importance: 5 },
      { id: 3, importance: 7 }
    ]
  });
  assert.match(prompt, /\[STYLE\]/);
  assert.match(prompt, /\[SCENE ACTION\]/);
  assert.match(prompt, /EpicAstra Heritage Classic|Heritage Dramatic|Cinematic Gloss/);
  assert.match(prompt, /THIN/);
  assert.match(prompt, /Hanuman/);
  assert.match(prompt, /monkey tail/);
  assert.match(prompt, /maintain the same character faces/);
});

test('appearingLords empty means no character lock — no primary dump', () => {
  const episode = {
    featuredLords: [
      {
        nameEn: 'Bhishma',
        importance: 'primary' as const,
        visualIdentity: 'Elderly warrior with white beard and golden armor over twenty chars',
        doNotConfuseWith: 'a young warrior'
      },
      {
        nameEn: 'Shikhandi',
        importance: 'primary' as const,
        visualIdentity: 'Adult warrior with androgynous features and bronze armor details',
        doNotConfuseWith: 'Arjuna'
      }
    ]
  };
  const lock = characterLockFromFeaturedLords(
    'Amba in penance in a forest hermitage',
    episode,
    { appearingLords: [] },
    { strictAppearingLords: true }
  );
  assert.equal(lock, '');
});

test('character state variants select the right identity', () => {
  const episode = {
    featuredLords: [
      {
        nameEn: 'Amba',
        importance: 'primary' as const,
        visualIdentity: 'Royal princess Amba in deep red lehenga with gold ornaments long enough',
        doNotConfuseWith: 'a generic maiden',
        states: {
          PENANCE:
            'SAME FACE as royal Amba, white and saffron penance cloth, fierce eyes, no jewellery'
        }
      }
    ]
  };
  const lock = characterLockFromFeaturedLords(
    'Amba performs tapas',
    episode,
    { appearingLords: ['Amba'], characterStates: { Amba: 'PENANCE' } },
    { strictAppearingLords: true }
  );
  assert.match(lock, /state:PENANCE/);
  assert.match(lock, /penance cloth/);
  assert.doesNotMatch(lock, /deep red lehenga/);
});

test('Jagannath scenes lock wooden murti from featuredLords script field', () => {
  const episode = {
    titleEn: 'Why Does Jagannath Hide From Devotees for 15 Days?',
    featuredLords: [
      {
        nameEn: 'Lord Jagannath',
        nameHi: 'भगवान जगन्नाथ',
        importance: 'primary' as const,
        visualIdentity:
          'Puri wooden daru murti with large round circular eyes and incomplete stump-like arms',
        doNotConfuseWith: 'Krishna with flute or four-armed Vishnu'
      }
    ]
  };
  const vague = buildSceneImagePrompt('temple servants anoint a sacred wooden deity in the chamber', {
    episode,
    scene: { id: 3, importance: 9, appearingLords: ['Lord Jagannath'] },
    strictAppearingLords: true
  });
  assert.match(vague, /Lord Jagannath/);
  assert.match(vague, /large round circular eyes/);
  assert.match(vague, /Do not confuse with: Krishna with flute/);
});

test('validateImagePrompt rejects story titles but allows EpicAstra channel wordmark', () => {
  const withWordmark = validateImagePrompt({
    label: 'scene 2',
    visualPrompt: 'Amba in forest penance',
    appearingLords: ['Amba'],
    featuredLords: [
      {
        nameEn: 'Amba',
        visualIdentity: 'Princess Amba with long dark hair and royal ornaments enough chars'
      },
      {
        nameEn: 'Bhishma',
        visualIdentity: 'Elderly warrior Bhishma with white beard and golden armor enough'
      }
    ],
    finalPrompt:
      '[STYLE] CHANNEL WORDMARK ONLY paint the single English word EpicAstra in the top border. [CHARACTER LOCK] Amba: princess. | Bhishma: elderly warrior. [SCENE ACTION] Amba in forest penance.'
  });
  assert.ok(withWordmark.some((issue) => issue.code === 'irrelevant_character_lock'));
  assert.equal(
    withWordmark.some((issue) => issue.code === 'missing_epicastra_wordmark'),
    false
  );

  const withTitle = validateImagePrompt({
    label: 'scene 2',
    visualPrompt: 'Amba in forest penance',
    appearingLords: ['Amba'],
    featuredLords: [
      {
        nameEn: 'Amba',
        visualIdentity: 'Princess Amba with long dark hair and royal ornaments enough chars'
      }
    ],
    finalPrompt:
      '[STYLE] CHANNEL WORDMARK ONLY EpicAstra. write the title on screen. [CHARACTER LOCK] Amba: princess. [SCENE ACTION] Amba in forest penance.'
  });
  assert.ok(withTitle.some((issue) => issue.code === 'brand_text'));
});

test('validateImagePrompt rejects childhood + adult warrior lock', () => {
  const issues = validateImagePrompt({
    label: 'scene 3',
    visualPrompt: 'Young girl childhood portrait in palace',
    appearingLords: ['Shikhandini'],
    featuredLords: [
      {
        nameEn: 'Shikhandini',
        visualIdentity: 'child princess'
      }
    ],
    finalPrompt:
      '[STYLE] EpicAstra. [CHARACTER LOCK] Shikhandini: adult warrior in battle armor. [SCENE ACTION] Young girl childhood portrait in palace.'
  });
  assert.ok(issues.some((issue) => issue.code === 'age_state_mismatch'));
});

test('validateImagePrompt skips EpicAstra wordmark for TECH_EDITORIAL', () => {
  const ok = validateImagePrompt({
    label: 'hook',
    brand: 'TECH_EDITORIAL',
    visualPrompt: 'Array boxes with empty label regions',
    finalPrompt:
      '[STYLE] Tech Editorial vertical 9:16. No heritage frame. No channel wordmark. [SCENE ACTION] Array boxes with empty label regions. [NEGATIVE] Avoid: EpicAstra wordmark'
  });
  assert.equal(ok.some((issue) => issue.code === 'missing_epicastra_wordmark'), false);
  assert.equal(ok.some((issue) => issue.code === 'unexpected_epicastra_wordmark'), false);

  const bleed = validateImagePrompt({
    label: 'hook',
    brand: 'TECH_EDITORIAL',
    visualPrompt: 'Array boxes',
    finalPrompt:
      '[STYLE] CHANNEL WORDMARK ONLY paint EpicAstra in the top border. [SCENE ACTION] Array boxes.'
  });
  assert.ok(bleed.some((issue) => issue.code === 'unexpected_epicastra_wordmark'));
});

test('visualStyleForEpisode pins brand + variant + cinematic 3D look by default', () => {
  assert.deepEqual(visualStyleForEpisode({ topic: 'A serene temple fact' }), {
    brand: 'EPICASTRA_HERITAGE',
    frameVariant: 'HERITAGE_CLASSIC',
    look: 'CINEMATIC_DEVOTIONAL_3D',
    borderStrategy: 'POST_PROCESS'
  });
});

test('visualStyleForEpisode keeps gloss when episode pins it', () => {
  assert.deepEqual(
    visualStyleForEpisode({
      topic: 'A serene temple fact',
      visualStyle: { look: 'CINEMATIC_GLOSS' }
    }),
    {
      brand: 'EPICASTRA_HERITAGE',
      frameVariant: 'HERITAGE_CLASSIC',
      look: 'CINEMATIC_GLOSS',
      borderStrategy: 'IN_MODEL'
    }
  );
});
