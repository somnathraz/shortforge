/**
 * Hand-authored / LLM sample template for tech-instagram pipeline.
 * Same EpisodeSchema as mythology — English text may live in *Hi fields.
 */
export function techEpisodeScriptTemplate(brandId = 'tech-instagram'): Record<string, unknown> {
  const hookSeconds = 5;
  const sceneSeconds = 5;
  const narrations = [
    'Cache-aside means your app talks to the cache first, then the database on a miss.',
    'On a miss you load from the DB, write into the cache, then return the value.',
    'Writes usually update the database first, then invalidate or refresh the cache key.',
    'Read-through is different: the cache library itself loads from the DB for you.',
    'Use cache-aside when you want full control; use read-through when the cache client owns loading.',
    'The interview line: who owns the miss path — your app, or the cache layer?',
    'Remember: stale data after writes is the classic cache-aside bug.'
  ];

  return {
    id: 'cache-aside-vs-read-through',
    brandId,
    storyKind: 'TECH_EDUCATION',
    topic: 'Cache aside vs read-through',
    titleHi: 'Cache aside vs read-through',
    titleEn: 'Cache Aside vs Read-Through',
    publishingTitles: {
      en: {
        shared: 'Cache Aside vs Read-Through in 45s',
        instagram: 'Who owns the cache miss — your app or the cache?'
      }
    },
    hookHi: 'Cache aside and read-through look similar — until the miss path.',
    spokenHook: 'Stop mixing these up: cache-aside and read-through are not the same miss path.',
    spokenHookDurationSeconds: hookSeconds,
    hookDelivery: 'confident',
    featuredLords: [
      {
        nameEn: 'App Service',
        nameHi: 'App Service',
        importance: 'primary',
        visualIdentity:
          'Clean flat diagram box labeled App, dark IDE aesthetic, rounded rectangle, subtle blue accent, no people faces',
        doNotConfuseWith: 'a database cylinder or a cache hexagon'
      },
      {
        nameEn: 'Cache',
        nameHi: 'Cache',
        importance: 'supporting',
        visualIdentity:
          'Flat diagram hexagon or lightning box labeled Cache, teal accent, minimal tech illustration',
        doNotConfuseWith: 'a database cylinder'
      },
      {
        nameEn: 'Database',
        nameHi: 'Database',
        importance: 'supporting',
        visualIdentity:
          'Classic cylinder database icon labeled DB, muted gray-blue, clean systems-design style',
        doNotConfuseWith: 'a cache hexagon or app rectangle'
      }
    ],
    targetDurationSeconds: hookSeconds + narrations.length * sceneSeconds,
    audience: 'TEENS_ADULTS',
    fictionDisclosureRequired: false,
    sourceReview: {
      status: 'NEEDS_REVIEW',
      claimsToVerify: [
        'In cache-aside the application owns the miss path (read DB then populate cache).',
        'In read-through the cache layer loads from the database on miss.'
      ],
      notes: ['Verify wording against your preferred systems-design source before publish.']
    },
    scenes: narrations.map((narrationHi, index) => ({
      id: index + 1,
      startSecond: hookSeconds + index * sceneSeconds,
      durationSeconds: sceneSeconds,
      narrationHi,
      visualPrompt:
        index === 0
          ? 'App Service, Cache, and Database as clean unlabeled diagram shapes with a miss-path arrow from App→Cache→DB; leave empty bands for Remotion labels/code; dark editorial tech, 9:16, no heritage frame'
          : `Clean systems-design diagram beat ${index + 1}: App/Cache/DB shapes and one highlighted arrow; structure only — no baked-in code or long labels (Remotion overlays); no mythology, no heritage frame`,
      videoPrompt:
        'Subtle Ken Burns over the diagram: slow push on the active arrow. Soft glow on the highlighted path. Preserve shapes; do not invent readable code text. Camera slow push in.',
      videoNegativePrompt:
        'warped text, unreadable labels, morphing boxes, extra limbs, faces, deities, heritage borders, EpicAstra wordmark, cluttered UI, corrupted code glyphs',
      camera: index % 2 ? 'slow pan' : 'slow push in',
      importance: index === 5 || index === 6 ? 9 : 6,
      renderMode: 'STILL',
      soundCue: 'soft tech click',
      appearingLords:
        index <= 2 ? ['App Service', 'Cache', 'Database'] : ['App Service', 'Cache', 'Database']
    })),
    ending: {
      payoffHi: 'Cache-aside: your app owns the miss. Read-through: the cache does.',
      nextEpisodeTeaseHi: 'Next: write-through vs write-behind — when writes go wrong.'
    },
    metadata: {
      descriptionHi:
        'Cache-aside vs read-through in one Reel — who owns the miss path and why interviewers care.',
      keywords: ['cache aside', 'read through', 'system design', 'caching', 'interview'],
      thumbnailTextHi: 'Who owns the cache miss?'
    }
  };
}

export const TECH_EPISODE_SCRIPT_FIELD_GUIDE = [
  {
    field: 'brandId',
    required: true,
    note: 'Must be this tech pipeline\'s id (e.g. "tech-instagram").'
  },
  {
    field: 'storyKind',
    required: true,
    note: 'Must be TECH_EDUCATION.'
  },
  {
    field: 'id',
    required: true,
    note: 'Stable kebab-case slug from the concept (e.g. cache-aside-vs-read-through).'
  },
  {
    field: 'topic / titleHi / titleEn / hookHi',
    required: true,
    note: 'English OK in *Hi fields. Titles are packaging only — never spoken by TTS.'
  },
  {
    field: 'spokenHook + spokenHookDurationSeconds + hookDelivery',
    required: true,
    note: 'First words the viewer hears. Must not copy titles. Duration ≤10s.'
  },
  {
    field: 'featuredLords',
    required: true,
    note: 'Diagram/UI subjects (App, Cache, DB, Host). visualIdentity = iconography lock, not deities.'
  },
  {
    field: 'scenes',
    required: true,
    note: '5–7 scenes. narrationHi = spoken English (or Hinglish). visualPrompt = diagram structure only (shapes/arrows/regions); exact labels/code preferably via Remotion, not AI-baked text.'
  },
  {
    field: 'sourceReview.claimsToVerify',
    required: true,
    note: 'Accuracy claims (definitions, version facts). Human marks Supported before script approve.'
  },
  {
    field: 'renderMode',
    required: true,
    note: 'Prefer STILL for tech diagrams; AI_VIDEO sparingly.'
  }
] as const;

/** Ready-to-paste tech brief for external LLMs. */
export function buildTechEpisodeScriptLlmPrompt(topicPlaceholder = '{{TOPIC}}', brandId = 'tech-instagram'): string {
  const templateJson = JSON.stringify(techEpisodeScriptTemplate(), null, 2);
  const guide = TECH_EPISODE_SCRIPT_FIELD_GUIDE.map(
    (item) => `- ${item.field}${item.required ? ' (required)' : ''}: ${item.note}`
  ).join('\n');

  return `Paste this whole message into ChatGPT / Claude / any LLM.

You write Tech Reels (Instagram) education shorts for brand tech-instagram. Reply with STRICT JSON only — no markdown fences, no commentary.

TOPIC
${topicPlaceholder}

OUTPUT RULES
- Return one JSON object with the SAME keys and types as the SAMPLE JSON below.
- brandId must be "${brandId}". storyKind must be TECH_EDUCATION.
- Language: English (Hinglish only if the topic explicitly asks). English text may live in titleHi / narrationHi / payoffHi fields.
- One concept only. No multi-topic dumps.
- titleHi / titleEn / hookHi are packaging only — NEVER spoken by TTS.
- spokenHook is the FIRST audio; must not copy the titles.
- Scene 1 narration continues AFTER the spokenHook (do not repeat the hook).
- featuredLords = diagram/UI subjects (boxes, icons, host avatar) — NOT deities. No EpicAstra / heritage frames / mythology.
- scenes[].appearingLords must use exact featuredLords.nameEn values.
- Prefer techVisual { visualType, visualData, animationSteps } for teaching diagrams (ARRAY_LOOKUP, ARRAY_TRAVERSAL, NESTED_LOOP_GRID, HALVING, GROWTH_BARS, TIME_VS_SPACE, COMPLEXITY_LADDER). Exact numbers/labels MUST live in techVisual — never trust AI images for O-notation, indexes, or code.
- visualPrompt: short fallback description only when techVisual is absent. No deities, no heritage frame/wordmark.
- Timeline: targetDurationSeconds === spokenHookDurationSeconds + sum(scenes[].durationSeconds)
- 5–7 scenes; each durationSeconds ≤ 12; spokenHookDurationSeconds ≤ 10; total picture plan 50–60 seconds (tech education). Keep narration speakable (~2–3 words/sec); final Short retimes to real TTS length.
- Prefer STILL + techVisual; AI_VIDEO sparingly; AI stills only for hook atmosphere / thumbnails.
- sourceReview.status = NEEDS_REVIEW; fictionDisclosureRequired = false; ≥1 claimsToVerify (accuracy).
- Do NOT invent API names, version numbers, or fake benchmarks — teach the pattern generically if unsure.

FIELD GUIDE
${guide}

SAMPLE JSON (copy this shape — fill/replace every value for the topic)
${templateJson}
`;
}
