import { MYTHOLOGY_VISUAL_INSTRUCTIONS, MYTHOLOGY_VISUAL_BRIEF } from './mythologyVisualBrief.js';
import { buildTechReelScriptBundle } from './techReelScript.js';
import { isTechBrand } from './brands.js';
/**
 * Canonical hand-authored script template for EpicAstra / mythology-factory.
 * Copy this JSON, fill your story, then import via UI or POST /api/episodes/import.
 *
 * Story-first: write one connected Hindi katha, then split at natural speech beats.
 * Timeline rule (picture plan — TTS retimes visuals to real audio):
 *   targetDurationSeconds === spokenHookDurationSeconds + sum(scenes[].durationSeconds)
 *   scene[0].startSecond === spokenHookDurationSeconds
 *   each next scene starts where the previous ends
 *   each scene durationSeconds ≤ 8; spokenHookDurationSeconds ≤ 10
 *   5–7 scenes; total picture plan 25–45s (aim ≤40 so ending payoff still fits under ~45s final)
 */
import {
  techEpisodeScriptTemplate,
  TECH_EPISODE_SCRIPT_FIELD_GUIDE,
  buildTechEpisodeScriptLlmPrompt
} from './techEpisodeScript.js';

export function episodeScriptTemplate(): Record<string, unknown> {
  const hookSeconds = 5;
  const sceneSeconds = 5;
  // Connected kathavachak lines — each beat continues the previous thought.
  const narrations = [
    'असल में ये वही हनुमान थे, जिनके अंदर अपार शक्ति थी—पर वे खुद उसे भूल चुके थे।',
    'क्यों? क्योंकि बचपन में हनुमान सूर्य को पका हुआ फल समझ बैठे थे।',
    'अब समस्या ये थी—उनकी शरारतों से तपस्वी ऋषियों की साधना बार-बार टूटने लगी।',
    'तब ऋषियों ने कहा—शक्ति तब तक भूली रहेगी, जब तक कोई याद न दिलाए।',
    'वर्षों बाद समुद्र किनारे वानर सेना निराश खड़ी थी—और हनुमान भी उसी उलझन में थे।',
    'लेकिन तभी जाम्बवान ने धीरे से उन्हें याद दिलाया—वे कौन हैं।',
    'और यहाँ से कहानी बदल गई—स्मृति लौटी, रूप विराट हुआ। शक्ति जगाने को सही आवाज़ चाहिए।'
  ];

  return {
    _instructions: MYTHOLOGY_VISUAL_INSTRUCTIONS,
    id: 'hanuman-forgot-powers',
    format: 'SINGLE_NARRATOR',
    storyKind: 'CANONICAL_MYTHOLOGY',
    topic: 'Why Hanuman forgot his powers',
    titleHi: 'हनुमान अपनी शक्ति क्यों भूल गए?',
    titleEn: 'Why Hanuman Forgot His Powers',
    publishingTitles: {
      hi: { shared: 'हनुमान अपनी शक्ति क्यों भूल गए?', youtube: 'हनुमान को उनकी शक्ति किसने याद दिलाई?', instagram: 'शक्ति थी, फिर भी हनुमान क्यों भूल गए?', facebook: 'हनुमान अपनी शक्ति क्यों भूल गए?' },
      en: { shared: 'Why Did Hanuman Forget His Powers?', youtube: 'Who Reminded Hanuman of His Powers?', instagram: 'Hanuman Had the Power. Why Couldn’t He Remember?', facebook: 'Why Did Hanuman Forget His Powers?' }
    },
    hookHi: 'जिस शक्ति से पर्वत हिल सकते थे, हनुमान उसी शक्ति को भूल कैसे गए?',
    spokenHook:
      'जिस शक्ति से पर्वत हिलते थे, हनुमान उसे भूल कैसे गए—और किसने उन्हें फिर जगाया?',
    spokenHookStartSecond: 0,
    spokenHookDurationSeconds: hookSeconds,
    hookDelivery: 'warm',
    hookVisualPrompt: 'Lord Hanuman as an adult sits beside a weathered rock on the ocean shore, his face filling the upper centre of a medium-close composition viewed slightly from below. He looks down at his open right palm with quiet doubt, while his left hand rests on his saffron silk knee cloth. His simian face, single curved tail and engraved gold armlets remain distinct. A blurred immense ocean beyond his shoulder hints at the impossible crossing. Warm dawn light catches his eyes and the gold embroidery; cool sea reflections separate his silhouette. No other principal character is visible.',
    hookAppearingLords: ['Lord Hanuman'],
    hookCharacterStates: { 'Lord Hanuman': 'ADULT' },
    narrationStyle: {
      mood: 'tender',
      intensity: 'low',
      pace: 'medium',
      emotion: 'devotional'
    },
    visualStyle: {
      brand: 'EPICASTRA_HERITAGE',
      frameVariant: 'HERITAGE_CLASSIC',
      look: 'CINEMATIC_DEVOTIONAL_3D',
      borderStrategy: 'NONE',
      lockThinBorder: true
    },
    voices: {
      A: {
        role: 'storyteller (kathavachak)',
        voiceId: 'BOgdqGR6ce0nZQSMHrV8',
        note: 'Optional dual-voice export: storyteller. Single-pass TTS uses NARRATOR / env voice.'
      },
      B: {
        role: 'listener (reacts)',
        voiceId: 'mSYK1wXyDo9la60dBOyK',
        note: 'Optional dual-voice export: listener. Omit B for SINGLE_NARRATOR episodes.'
      }
    },
    featuredLords: [
      {
        nameEn: 'Lord Hanuman',
        nameHi: 'भगवान हनुमान',
        importance: 'primary',
        visualIdentity:
          'Divine vanara Lord Hanuman with monkey face, clear simian features, visible monkey tail, orange-saffron dhoti, golden ornaments, heroic calm expression',
        states: {
          CHILD: 'Child Lord Hanuman, small juvenile vanara with rounded simian face, warm tawny fur, bright brown eyes, two arms, two legs and one long monkey tail, simple saffron dhoti and small gold bracelets, curious childlike expression, no adult muscular physique',
          ADULT: 'Adult Lord Hanuman, strong divine vanara with mature simian face, warm tawny fur, brown eyes, two arms, two legs and one long monkey tail, saffron silk dhoti with gold embroidery, engraved gold armlets and necklace'
        },
        doNotConfuseWith: 'a human warrior without simian features, or a generic blue Hindu god'
      },
      {
        nameEn: 'Jambavan',
        nameHi: 'जाम्बवान',
        importance: 'supporting',
        visualIdentity: 'Wise bear-king elder Jambavan, dignified aged bear form, not a human child',
        doNotConfuseWith: 'a human boy or a generic forest animal mascot'
      }
    ],
    targetDurationSeconds: hookSeconds + narrations.length * sceneSeconds,
    audience: 'GENERAL_FAMILY',
    fictionDisclosureRequired: false,
    sourceReview: {
      status: 'NEEDS_REVIEW',
      claimsToVerify: [
        'बाल हनुमान ने सूर्य को फल समझा।',
        'ऋषियों के शाप से हनुमान अपनी शक्ति भूल गए।'
      ],
      notes: ['Replace claims with your sources before publish.']
    },
    scenes: narrations.map((narrationHi, index) => {
      const renderMode = index === 0 || index === 6 ? 'AI_VIDEO' : 'STILL';
      const videoPrompts = [
        'Hanuman stands still then slowly lifts his gaze with quiet uncertainty. Cloth and ornaments shift naturally. Soft ambient dust moves in the light. Camera slowly pushes in. Preserve face, simian features, costume and character identity.',
        'Young Hanuman reaches toward the glowing sun as if picking fruit. Arms stretch upward, face curious. Warm light flares on his features. Cloth and tail move lightly. Camera slow tilt up. Preserve face, simian features, costume and character identity.',
        'Hanuman playfully leaps between trees while distant sages meditate. Leaves rustle, cloth flutters, his tail arcs naturally. Camera slow pan across the grove. Preserve face, simian features, costume and character identity.',
        'Sages raise a hand in solemn warning while Hanuman lowers his gaze. Subtle facial reaction, robes settle, incense smoke drifts. Camera slow push in. Preserve face, simian features, costume and character identity.',
        'Hanuman stands among a discouraged vanara army on the shore. Ocean breeze moves hair and cloth; waves lap softly. Camera slow lateral move. Preserve face, simian features, costume and character identity.',
        'Jambavan steps closer and speaks while Hanuman’s expression shifts from doubt to recognition. Subtle gesture and breath. Cloth moves in the sea wind. Camera slow push toward both faces. Preserve both characters’ faces, clothing and identity.',
        'Hanuman’s body expands into a towering form as confidence returns. Hair, cloth and ornaments move with the surge of power. Surrounding air and dust react to the scale change. Camera slowly pulls back to reveal the growing figure. Preserve face, simian features, costume and character identity.'
      ];
      const scene: Record<string, unknown> = {
        id: index + 1,
        startSecond: hookSeconds + index * sceneSeconds,
        durationSeconds: sceneSeconds,
        narrationHi,
        visualPrompt: [
          "Adult Lord Hanuman stands at the edge of a coastal grove, looking toward the distant sea with uncertainty. His right hand rests against a tree trunk and his left hangs relaxed beside his saffron dhoti; his curved tail remains visible against the sand. Place him on the left, with exposed roots in the foreground and a gap between trees revealing the immense ocean at right. Dawn sunlight illuminates his simian face and engraved armlets, while cool shade gives the grove depth. The distant horizon remains empty, making the scale of the crossing feel daunting.",
          "Child Lord Hanuman reaches his right hand toward the distant sun, mistaking it for fruit, while suspended above a mountain ridge. His left arm extends sideways for balance, and his single tail curves behind him without crossing his face. Place his small juvenile figure lower left and the sun upper right, separated by a broad sky; do not place a second fruit in his hand. His simple saffron dhoti and small bracelets catch warm sunrise light. Dark treetops below, pale mountain layers and a few illuminated clouds establish height and distance. His expression is innocent curiosity.",
          "Child Lord Hanuman balances on a low branch in an earthly forest hermitage, smiling mischievously as one foot disturbs a spray of leaves above seated elderly sages. Put the child at upper left, with his other foot firmly on the branch and one hand gripping it; his tail curls behind the trunk. Two sages in plain ochre robes occupy the lower-right midground beside woven mats and a small earthen water pot. Their interrupted meditation is visible in their lifted gazes. Sunlit leaves frame the foreground; simple huts recede through green shade. Keep the child small and the scene readable.",
          "Child Lord Hanuman stands on the left of the same forest clearing, shoulders lowered and eyes downcast, listening to an elderly sage at right. The sage raises one open right palm in a solemn warning while his left hand rests on his knee; he is seated on a woven mat in plain ochre robes. The child holds both hands together near his waist, his small gold bracelets and simple saffron dhoti visible. A fallen leaf lies in the foreground, with a clay water pot beside the mat and quiet huts behind. Soft afternoon sunlight reveals remorse without frightening effects.",
          "Adult Lord Hanuman stands in the foreground on a rocky ocean shore, facing the vast empty horizon with a troubled expression. His hands hang loosely beside his embroidered saffron dhoti; one curved tail is visible behind his legs. Place him at right, with a small discouraged vanara group seated lower left, heads bowed rather than all facing the viewer. White surf breaks between dark rocks in the midground, and the sea recedes toward a hazy horizon. Warm late-afternoon light catches gold armlets while cooler reflected water keeps the shadows readable. No celestial palaces appear in this earthly setting.",
          "Jambavan, the elderly bear king, stands at right facing adult Lord Hanuman at left on the same rocky shore. Jambavan raises one open hand toward Hanuman in reassurance without covering either face; Hanuman meets his gaze with the first sign of recognition. Keep their contrasting bear and simian features distinct. Hanuman wears the same embroidered saffron silk and engraved armlets, and Jambavan retains his dignified aged bear appearance. A low rock anchors the foreground, quiet vanara silhouettes recede behind them, and ocean waves form the background. Warm low sunlight highlights their eyes, making the exchange intimate.",
          "Adult Lord Hanuman now stands in a towering heroic form on the shore, chest lifted and gaze directed across the ocean. Show a single completed pose rather than multiple growth stages: both feet planted on rock, arms held confidently beside his body, one tail curving away from his silhouette. His mature simian face, embroidered saffron silk and gold armlets match the preceding scene. Small vanaras at the bottom establish his immense scale without obscuring him. Foreground dust curls around the rocks, white surf spans the midground and the horizon recedes behind. Golden sunlight outlines his shoulders while his face stays readable."
][index]!,
        videoPrompt: videoPrompts[index]!,
        videoNegativePrompt:
          'facial deformation, extra fingers, extra limbs, warped hands, changing identity, morphing faces, changing clothes, frame flicker, floating objects, unnatural body movement',
        camera: ["medium-wide eye-level shot, Hanuman left and sea right, face sharp with layered grove depth", "wide low-angle shot, child lower left and distant sun upper right, clear diagonal separation", "wide eye-level view of the clearing, branch upper left and sages lower right, all faces unobstructed", "medium two-shot at child eye level, child left and seated sage right, open hand separated from faces", "wide three-quarter view from shore, Hanuman foreground right with ocean filling upper frame", "medium eye-level two-shot, Hanuman left and Jambavan right, both faces sharp, soft distant surf", "wide low-angle heroic shot, towering Hanuman centred, small vanaras at bottom for scale"][index]!,
        characterStates: { 'Lord Hanuman': index >= 1 && index <= 3 ? 'CHILD' : 'ADULT' },
        importance: index === 6 ? 10 : 6,
        renderMode,
        soundCue: index === 6 ? 'power surge' : 'cinematic ambience',
        appearingLords: index === 5 ? ['Lord Hanuman', 'Jambavan'] : ['Lord Hanuman']
      };
      // Sparse tags only at meaningful turns (scene 4 curse; scene 6 reminder).
      if (index === 3) {
        scene.voiceDirection = {
          emotion: 'solemn',
          delivery: 'calm, firm, deliberate',
          intensity: 0.55,
          pauseBeforeMs: 200,
          pauseAfterMs: 400
        };
        scene.elevenLabsText =
          '[calmly] तब ऋषियों ने कहा— [firmly] शक्ति तब तक भूली रहेगी, जब तक कोई याद न दिलाए।';
      }
      if (index === 5) {
        scene.voiceDirection = {
          emotion: 'warm',
          delivery: 'softly, curious',
          intensity: 0.45
        };
        scene.elevenLabsText =
          '[softly] लेकिन तभी जाम्बवान ने धीरे से उन्हें याद दिलाया— [curious] वे कौन हैं।';
        // Optional dialogue packaging (same beat). Import normalizes captions; TTS joins one pass today.
        scene.dialogueLines = [
          {
            speaker: 'A',
            text: '[softly] लेकिन तभी जाम्बवान ने धीरे से उन्हें याद दिलाया—वे कौन हैं।'
          }
        ];
      }
      return scene;
    }),
    ending: {
      payoffHi: 'हनुमान ने महासागर लांघने को पहली विराट छलांग लगाई।',
      nextEpisodeTeaseHi: 'लेकिन लंका के रास्ते में तीन परीक्षाएँ उनका इंतज़ार कर रही थीं।'
    },
    metadata: {
      descriptionHi: 'जाम्बवान द्वारा हनुमान को उनकी भूली शक्ति याद दिलाने की प्रचलित कथा।',
      keywords: ['हनुमान', 'रामायण', 'जाम्बवान', 'पौराणिक कथा'],
      thumbnailTextHi: 'हनुमान शक्ति क्यों भूले?'
    }
  };
}

/** Short field guide to share with writers (not the full Zod schema). */
export const EPISODE_SCRIPT_FIELD_GUIDE = [
  {
    field: 'id',
    required: true,
    note: 'Stable kebab-case slug from the title (e.g. bhishma-lowered-bow). Used for asset folders. Never use my-episode-001.'
  },
  {
    field: 'storyKind',
    required: true,
    note: 'CANONICAL_MYTHOLOGY | LESSER_KNOWN_MYTHOLOGY | ORIGINAL_MYTH_FICTION'
  },
  {
    field: 'topic / titleHi / titleEn / hookHi',
    required: true,
    note: 'Titles + hookHi are packaging/thumbnail only — never spoken by TTS.'
  },
  {
    field: 'format',
    required: false,
    note: 'SINGLE_NARRATOR (default) or TWO_SPEAKER_DIALOGUE. Dialogue metadata is preserved; production TTS still joins one pass unless you export A/B voices manually.'
  },
  {
    field: 'spokenHook + spokenHookDurationSeconds + hookDelivery',
    required: true,
    note: 'First words the viewer hears. Must not copy titles. No "A:"/"B:" labels in spokenHook. Duration ≤10s. Prefer warm|curious (kathavachak). Delivery: curious|confident|urgent|warm|intriguing.'
  },
  {
    field: 'hookDialogueLines / voices / elevenLabsDialogueRequest',
    required: false,
    note: 'TWO_SPEAKER_DIALOGUE helpers. hookDialogueLines = structured hook turns. voices.A/B = ElevenLabs voice ids for later dual export. elevenLabsDialogueRequest.inputs = full ordered dialogue reference (not billed until you generate).'
  },
  {
    field: 'narrationStyle',
    required: false,
    note: 'Episode TTS tone. EpicAstra default = Conversational Cinematic Kathavachak: mood tender, intensity low, pace medium, emotion devotional. Avoid mysterious/high/trailer defaults.'
  },
  {
    field: 'visualStyle',
    required: false,
    note: 'Still-image brand. Default { brand: EPICASTRA_HERITAGE, frameVariant: HERITAGE_CLASSIC, look: CINEMATIC_DEVOTIONAL_3D, borderStrategy: NONE, lockThinBorder: true }. CINEMATIC_DEVOTIONAL_3D = premium cinematic 3D, full-bleed without a border; CINEMATIC_GLOSS = Instagram-gloss with in-model border; HERITAGE_PAINTERLY = older storybook look. Do not put style language in scene prompts.'
  },
  {
    field: 'scenes[].visualPrompt',
    required: true,
    note: 'Detailed English still-image direction: named subjects, exact pose, props, placement, material details, environment depth, lighting and emotion. Follow _instructions.visualPrompt; the pipeline supplies rendering style.'
  },
  {
    field: 'featuredLords',
    required: true,
    note: '1–16 lords. At least one primary. importance: primary|supporting|minor. visualIdentity ≥24 chars; doNotConfuseWith ≥8 chars. Drives image identity.'
  },
  {
    field: 'scenes (5–7)',
    required: true,
    note: 'Split a complete connected Hindi katha at natural speech beats (not independent captions). durationSeconds ≤12 picture-plan budget (shorts usually ≤8) — TTS retimes visuals. Scene 1 must not repeat spokenHook. appearingLords must match featuredLords.nameEn.'
  },
  {
    field: 'scenes[].voiceDirection + scenes[].elevenLabsText + scenes[].dialogueLines',
    required: false,
    note: 'ElevenLabs v4 tags sparsely. narrationHi = plain captions (no tags, no A:/B: labels). dialogueLines optional for A/B packaging; import fills narrationHi/elevenLabsText/voiceSegments. When voiceSegments exist, they are the speak source (joined in one TTS pass today).'
  },
  {
    field: 'scenes[].videoPrompt / videoNegativePrompt',
    required: false,
    note: 'Recommended on every scene. videoPrompt = motion after the still (not a copy of visualPrompt). videoNegativePrompt = artifacts to avoid. Generation is selective in the UI — only ticked scenes are sent to Wan.'
  },
  {
    field: 'targetDurationSeconds',
    required: true,
    note: 'Must equal hook duration + sum of scene durations (25–45). Prefer ≤40 so ending payoff still keeps the final video under ~45s.'
  },
  {
    field: 'sourceReview',
    required: true,
    note: 'Mythology: NEEDS_REVIEW + ≥1 claimsToVerify + fictionDisclosureRequired=false. Fiction: FICTION + disclosure=true.'
  },
  {
    field: 'ending.payoffHi',
    required: true,
    note: 'Spoken LAST, after the final scene: only a short devotional comment prompt + jaikara (≤10 words), e.g. और कमेंट में लिखिए — जय श्री राम! The story payoff belongs in the last story scene, then one share-ask scene. nextEpisodeTeaseHi is packaging only.'
  },
  {
    field: 'metadata',
    required: true,
    note: 'descriptionHi, 3–12 keywords, thumbnailTextHi ≤60 chars.'
  },
  {
    field: 'renderMode',
    required: true,
    note: 'STILL or AI_VIDEO. Keep paid AI_VIDEO within budget (typically ≤2 scenes / ≤10s).'
  }
] as const;

/** Ready-to-paste instructions for external LLMs (ChatGPT, Claude, etc.). */
export function buildEpisodeScriptLlmPrompt(
  topicPlaceholder = '{{TOPIC}}'
): string {
  const templateJson = JSON.stringify(episodeScriptTemplate(), null, 2);
  const guide = EPISODE_SCRIPT_FIELD_GUIDE.map(
    (item) => `- ${item.field}${item.required ? ' (required)' : ''}: ${item.note}`
  ).join('\n');

  return `Paste this whole message into ChatGPT / Claude / any LLM.

You write EpicAstra YouTube Short scripts as a warm Hindi kathavachak. Reply with STRICT JSON only — no markdown fences, no commentary, no explanation.

TOPIC
${topicPlaceholder}

STORY-FIRST (do this before filling JSON)
1) Write the complete flowing Hindi narration (spokenHook → story → ending.payoffHi) as ONE connected katha.
2) Split at natural speech boundaries into 5–7 scenes. Never cut mid-thought; each line must connect to the previous and next.
3) Then add visuals, lords, sparse voice tags, and timeline fields.
4) If the full myth is 2–3 minutes, write one self-contained Short slice with a cliffhanger — do not cram the entire epic.

NARRATION STYLE — Conversational Cinematic Kathavachak
- Warm, knowledgeable, personal, emotionally restrained. Prefer hookDelivery "warm" or "curious".
- Explain WHY characters act; use connective Hindi ("लेकिन तभी...", "अब समस्या ये थी...", "और यहाँ से कहानी बदल गई...").
- Emotion from the incident — not manufactured drama every sentence. Avoid trailer clichés ("रोंगटे खड़े हो जाएंगे", "ऐसा रहस्य जिसे कोई नहीं जानता").
- Set narrationStyle to { "mood": "tender", "intensity": "low", "pace": "medium", "emotion": "devotional" } unless the chapter truly needs another tone.
- Do NOT force 12–18 Hindi words per scene. Write natural spoken lines; durationSeconds is a picture-plan budget (production retimes to TTS).

OUTPUT RULES
- Return one JSON object with the SAME keys and types as the SAMPLE JSON below.
- Rewrite the sample for the TOPIC (new id, titles, spokenHook, scenes, lords, claims).
- titleHi / titleEn / hookHi are packaging only — NEVER spoken by TTS.
- publishingTitles is optional: hi/en each accept shared plus youtube, instagram and facebook overrides (3–100 characters each). Use shared alone for the same title everywhere. Titles must be grounded in the story and reviewed claims, never invent sensational facts. These titles are preserved in the Final delivery pack, never narrated.
- spokenHook is the FIRST audio the viewer hears; must not copy the titles.
- Scene 1 narration must continue AFTER the spokenHook (do not repeat the hook).
- featuredLords drives image generation: name lords clearly; visualIdentity must be concrete iconography.
- scenes[].appearingLords must use exact featuredLords.nameEn values.
- Use visualStyle.look CINEMATIC_DEVOTIONAL_3D and borderStrategy NONE, matching the full-bleed demo. Follow the visual direction below for hook and every scene.
- _instructions in the sample is writer guidance only; read it, then omit it from the final JSON if desired.
- Timeline: targetDurationSeconds === spokenHookDurationSeconds + sum(scenes[].durationSeconds)
- scene[0].startSecond === spokenHookDurationSeconds; each next scene starts where the previous ends.
- 5–7 scenes; each durationSeconds ≤ 8; spokenHookDurationSeconds ≤ 10; total picture plan 25–45 seconds (prefer ≤40).
- ElevenLabs v4: narrationHi = plain captions (no tags). On 1–3 key emotional turns only, add voiceDirection + elevenLabsText with sparse bracket tags ([calmly], [curious], [softly], [firmly], …). Do NOT use SSML <break>. Do NOT tag every scene. If you use voiceSegments, omit scene-level elevenLabsText.
- ENGAGEMENT ENDING (EpicAstra, mandatory): the story's emotional payoff lands in the LAST STORY SCENE, never in ending.payoffHi.
- After the payoff scene, add ONE short final share-ask scene (4–6s) aimed at a specific person, e.g. "अगर इस कथा ने मन छुआ… तो इसे उस राम भक्त को भेजिए, जिसने यह कभी नहीं सुनी।" Match the devotee word to the episode (राम भक्त / शिव भक्त / कृष्ण भक्त / माँ के भक्त). DM sends drive non-follower reach more than any other signal.
- ending.payoffHi is spoken LAST: only a low-friction devotional comment prompt + jaikara, ≤10 words, e.g. "और कमेंट में लिखिए — जय श्री राम!" / "कमेंट में लिखिए — हर हर महादेव!"
- Never use guilt or superstition share-bait ("शेयर नहीं किया तो…", "पुण्य मिलेगा"), never like/subscribe spam, never English CTA words inside Hindi narration.
- Prefer STILL; use AI_VIDEO sparingly (≤2 scenes / ≤10s total paid motion).
- For EVERY scene include videoPrompt (subject/face/body/object/environment/camera motion + identity preservation) and videoNegativePrompt (artifacts to avoid). Do not copy visualPrompt into videoPrompt. Wan generation is selective later — prompts live on all scenes so any can be animated.
- Mythology: storyKind CANONICAL_MYTHOLOGY or LESSER_KNOWN_MYTHOLOGY, sourceReview.status NEEDS_REVIEW, fictionDisclosureRequired false, ≥1 claimsToVerify.
- Fiction: ORIGINAL_MYTH_FICTION, sourceReview.status FICTION, fictionDisclosureRequired true.

${MYTHOLOGY_VISUAL_BRIEF}

FIELD GUIDE
${guide}

SAMPLE JSON (copy this shape — fill/replace every value for the topic)
${templateJson}
`;
}

export type ScriptBundleBrand = string;

/** Brand-aware template + LLM brief for Desk download / import. */
export function buildScriptBundle(
  brandId: ScriptBundleBrand,
  topicPlaceholder = '{{TOPIC}}',
  format: 'default' | 'legacy' = 'default'
): {
  brandId: ScriptBundleBrand;
  template: Record<string, unknown>;
  fieldGuide: ReadonlyArray<{ field: string; required: boolean; note: string }>;
  llmPrompt: string;
  notes: string[];
  downloadStem: string;
} {
  const tech = isTechBrand(brandId);
  if (tech && format !== 'legacy') return buildTechReelScriptBundle(topicPlaceholder, brandId);
  if (tech) {
    return {
      brandId,
      template: techEpisodeScriptTemplate(brandId),
      fieldGuide: [...TECH_EPISODE_SCRIPT_FIELD_GUIDE],
      llmPrompt: buildTechEpisodeScriptLlmPrompt(topicPlaceholder, brandId),
      notes: [
        'Tech pipeline: same JSON import path as EpicAstra.',
        `brandId must be ${brandId}; storyKind must be TECH_EDUCATION.`,
        'English may live in *Hi fields; narrationHi is still the spoken line.'
      ],
      downloadStem: `${brandId}-episode-script`
    };
  }

  return {
    brandId,
    template: { ...episodeScriptTemplate(), brandId },
    fieldGuide: [...EPISODE_SCRIPT_FIELD_GUIDE],
    llmPrompt: buildEpisodeScriptLlmPrompt(topicPlaceholder),
    notes: [
      'Download or copy sample JSON / LLM prompt (prompt already includes the sample JSON to paste).',
      'Story-first: write one connected Hindi katha, then split scenes at natural speech beats.',
      'Default voice = Conversational Cinematic Kathavachak (warm, restrained). Sparse ElevenLabs tags only.',
      'Paste or upload the filled JSON via Import script JSON to skip AI story generation.',
      'Validation uses EpisodeSchema + editorial gates + budget (same as Generate script).',
      'titleHi/titleEn are never spoken; spokenHook is the first audio.',
      'targetDurationSeconds must equal spokenHookDurationSeconds + sum(scene durations) (picture plan; TTS retimes).'
    ],
    downloadStem: `${brandId}-episode-script`
  };
}

