import { MYTHOLOGY_VISUAL_BRIEF } from '../lib/mythologyVisualBrief.js';
import '../lib/loadEnv.js';
import { loadBudget } from '../config/budget.js';
import { assertBudgetPolicy, assertEditorialPolicy, routeWithinBudget } from '../guards/episode.js';
import { groqStructuredChat } from '../lib/groq.js';
import { structuredChat } from '../lib/ollama.js';
import { nvidiaStructuredChat } from '../lib/nvidia.js';
import { openAIStructuredChat } from '../lib/openai.js';
import { openRouterStructuredChat } from '../lib/openrouter.js';
import { geminiStructuredChat } from '../lib/gemini.js';
import { type Episode, EpisodeGenerationSchema, EpisodeSchema } from '../schema/episode.js';
import { DEFAULT_NARRATION_STYLE } from '../schema/narrationStyle.js';
import { resolveEpisodeId } from '../lib/episodeIdentity.js';
import { isTechBrand, DEFAULT_BRAND_ID, currentBrandId, type BrandId } from '../lib/brands.js';

export const STORY_PROVIDERS = ['gemini', 'ollama', 'nvidia', 'openai', 'openrouter', 'groq'] as const;
export type StoryProvider = (typeof STORY_PROVIDERS)[number];
export type RequestedStoryKind = 'canonical' | 'lesser-known' | 'fiction' | 'auto' | 'tech';

const storyKindValues = {
  canonical: 'CANONICAL_MYTHOLOGY',
  'lesser-known': 'LESSER_KNOWN_MYTHOLOGY',
  fiction: 'ORIGINAL_MYTH_FICTION',
  tech: 'TECH_EDUCATION'
} as const;

function buildTimeline(targetSeconds: number, maxScenes: number, hookSeconds = 6): number[] {
  const sceneBudget = Math.max(20, targetSeconds - hookSeconds);
  const sceneCount = Math.max(5, Math.ceil(sceneBudget / 8));
  if (sceneCount > maxScenes) throw new Error('Budget cannot fit target duration into the configured scene limit');
  const base = Math.floor(sceneBudget / sceneCount);
  const remainder = sceneBudget % sceneCount;
  return Array.from({ length: sceneCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function systemPrompt(
  maxPaidMotionScenes: number,
  maxPaidMotionSeconds: number,
  maxScenes: number,
  timeline: number[],
  hookSeconds: number,
  brandId: BrandId = DEFAULT_BRAND_ID
): string {
  const starts = timeline.map(
    (_, index) => hookSeconds + timeline.slice(0, index).reduce((sum, value) => sum + value, 0)
  );
  const sceneTotal = timeline.reduce((sum, value) => sum + value, 0);
  const targetTotal = hookSeconds + sceneTotal;
  const productionBudget = `
PRODUCTION BUDGET (picture plan — not a hard speech cap)
- Use AI_VIDEO only for the most visually important action/reveal moments.
- Use STILL for scenes that can work with pan/zoom/parallax in FFmpeg.
- Never exceed ${maxPaidMotionScenes} AI_VIDEO scenes.
- Total AI_VIDEO duration should be no more than ${maxPaidMotionSeconds} seconds.
- Maximum ${maxScenes} scenes.
- targetDurationSeconds must be exactly ${targetTotal} (spokenHook ${hookSeconds}s + scenes ${sceneTotal}s).
- Create exactly ${timeline.length} scenes.
- Their durationSeconds values must be exactly [${timeline.join(', ')}] — these are planning budgets for the timeline schema; production retimes visuals to real TTS.
- Their startSecond values must be exactly [${starts.join(', ')}] (after the ${hookSeconds}s spokenHook window).
- Use at most ${Math.min(maxPaidMotionScenes, Math.floor(maxPaidMotionSeconds / Math.max(...timeline)))} AI_VIDEO scene(s); all others must be STILL.
`;

  if (isTechBrand(brandId)) {
    return `
You are the script editor for Tech Reels (brand ${brandId}) — short Instagram education videos.

GOAL
Create one clear tech concept (DSA, system design, architecture, app building, or tech update) for a vertical Reel under ~45–60s.

OUTPUT IDENTITY
- brandId must be "${brandId}".
- storyKind must be TECH_EDUCATION.
- Language: English (Hinglish only if the topic explicitly asks). English text may live in titleHi / narrationHi / ending.payoffHi.
- One concept only.

EDITORIAL SAFETY
- Do not invent API names, version numbers, or fake benchmarks.
- Put every accuracy claim into sourceReview.claimsToVerify.
- sourceReview.status = NEEDS_REVIEW; fictionDisclosureRequired = false.

SPOKEN HOOK vs TITLE
- titleHi / titleEn are packaging only — never spoken.
- spokenHook is the FIRST narration; must not copy titles.
- spokenHookDurationSeconds must be exactly ${hookSeconds}.
- Scene 1 must continue AFTER the spokenHook.

FEATURED SUBJECTS (featuredLords field — diagram locks)
- Use featuredLords for diagram/UI subjects (App Service, Cache, Database, Host), not deities.
- visualIdentity = concrete iconography (boxes, cylinders, IDE chrome).
- appearingLords must match featuredLords.nameEn.
- Prefer scenes[].techVisual { visualType, visualData, animationSteps } for teaching (ARRAY_LOOKUP, HALVING, etc.). Exact numbers live there — not in AI images.
- visualPrompt: short fallback only. No mythology, no heritage frame, no EpicAstra wordmark. Target ~50–60s picture plan.

AI_VIDEO
- Prefer STILL for tech diagrams. If AI_VIDEO, set videoPrompt/videoNegativePrompt on every scene.

${productionBudget}
`;
  }

  return `
You are the story editor for EpicAstra — cinematic Indian mythology YouTube Shorts narrated like a warm Hindi kathavachak.

GOAL
Create one watchable vertical Short whose spoken narration feels like ONE connected story, not six disconnected captions.

STORY-FIRST WORKFLOW (mandatory — do this in your head before filling JSON)
1) Research the topic; decide the self-contained arc that fits a Short (if the full katha is 2–3 minutes, pick ONE episode slice with a natural cliffhanger/payoff — do not cram the entire epic).
2) Write the COMPLETE flowing Hindi narration first: spokenHook → continuous story → ending.payoffHi. One voice telling one katha.
3) Only THEN split that narration across scenes at natural speech boundaries (end of a thought / beat). A scene cut must NEVER interrupt mid-thought or reset the story voice.
4) Add visuals, appearingLords, sparse voiceDirection/elevenLabsText, then timeline fields.

NARRATION STYLE — Conversational Cinematic Kathavachak (default)
- Warm, knowledgeable, personal, emotionally restrained. Prefer hookDelivery "warm" or "curious".
- Explain WHY a character acts, not only WHAT happens. Clear cause-and-effect between beats.
- Use natural connective Hindi: "लेकिन तभी...", "अब समस्या ये थी...", "और यहाँ से कहानी बदल गई...".
- Let emotion emerge from the incident; do NOT manufacture excitement in every sentence.
- Occasional direct questions are fine; not every scene.
- Avoid trailer clichés: "रोंगटे खड़े हो जाएंगे", "ऐसा रहस्य जिसे कोई नहीं जानता", constant "intense/dramatic/powerful" tone.
- Each line should create a reason to hear the next. Scene N must feel like it continues Scene N−1.
- Do NOT force every beat into 12–18 words. Write natural spoken Hindi; durationSeconds is only a picture-plan budget (TTS retimes visuals to real audio).

ELEVENLABS VOICE FIELDS (sparse — P1)
- narrationHi = clean spoken Hindi for captions (NO [audio tags]).
- On important emotional turns only (≈1–3 scenes), set voiceDirection + elevenLabsText with sparse bracket tags ([calmly], [curious], [softly], [firmly], …). Most scenes can omit tags and rely on the warm default voice.
- Do NOT invent voiceSegments unless you need short character dialogue; when voiceSegments exist, omit scene-level elevenLabsText (segments are the speak source).
- Do NOT tag every line. Prefer natural delivery.

EDITORIAL SAFETY
- Do not copy modern film/TV/comic/YouTube dialogue, visual designs, scripts, thumbnails or adaptations.
- For canonical or lesser-known mythology, never pretend uncertain information is scripture or fact.
- Put every factual claim that needs source checking into sourceReview.claimsToVerify.
- sourceReview.status must be NEEDS_REVIEW for mythology and FICTION for original fiction.
- For ORIGINAL_MYTH_FICTION, fictionDisclosureRequired must be true and the story must be clearly original.
- Do not invent quotes from deities or scriptures and present them as authentic.

SPOKEN HOOK vs TITLE (critical — strict script security)
- Structure: TITLE (metadata) → SPOKEN HOOK (voice+captions) → SCENE 1… → ending.payoffHi.
- titleHi / titleEn are publishing + thumbnail metadata ONLY. Never equal spokenHook. Never spoken by TTS.
- spokenHook is the FIRST narration the viewer hears (TTS + captions). Warm curiosity in the first 2–6 seconds — not a shouty trailer.
- hookHi may match packaging copy; spokenHook is what sounds natural aloud (can be longer / more insider).
- hookDelivery must be one of: curious, confident, urgent, warm, intriguing (prefer warm|curious).
- spokenHookDurationSeconds must be exactly ${hookSeconds}.
- Scene 1 narration must NOT repeat or reuse the spokenHook opening line. Continue the story after the hook.
- Do NOT speak labels like HOOK, SCENE 1, ENDING, or the publishing title.
- nextEpisodeTeaseHi is packaging only (not spoken).

FEATURED LORDS (critical for images — fill before writing scenes)
- featuredLords lists every deity/character the images must depict. The image model reads this field.
- For each lord set: nameEn (English, e.g. "Lord Jagannath"), nameHi, importance ("primary" or "supporting"),
  visualIdentity (default iconography: face, body, attributes, materials), and doNotConfuseWith (lookalikes to ban).
- Optional states map for age/costume variants (e.g. CHILD, PENANCE, WARRIOR) — never reuse an adult warrior lock for a childhood scene.
- At least one lord must be importance=primary (the main figure of this short).
- Each scene.appearingLords must list ONLY nameEn values visible in THAT scene. Use [] for empty location shots.
- Do NOT inject every featuredLord into every scene — image prompts lock only appearingLords.
- scene.characterStates may map nameEn → state key when a variant is required.
- scene.visualPrompt MUST name exact appearing lords (never vague “a deity” / “divine form”).
- Supernatural beings (Yaksha, etc.) need their own featuredLords entry with visualIdentity.

${MYTHOLOGY_VISUAL_BRIEF}

AI_VIDEO / MOTION PROMPTS (every scene)
- For EVERY scene set videoPrompt and videoNegativePrompt (STILL and AI_VIDEO).
- videoPrompt animates the still from visualPrompt — it must NOT merely repeat visualPrompt.
- Focus videoPrompt on: subject movement, facial/body movement, object movement, environmental movement, camera movement, and character identity preservation.
- Example videoPrompt style: "Kaundinya pulls the sacred red thread away and throws it toward the fire. Sushila reacts with shock. The thread moves naturally through the air and falls into the flames. Fire flares slightly. Clothing and hair move naturally. Camera slowly follows the thread. Preserve faces, clothing and character identity."
- videoNegativePrompt lists artifacts/motion failures to avoid (e.g. facial deformation, extra fingers, extra limbs, warped hands, changing identity, morphing faces, changing clothes, frame flicker, floating objects, unnatural body movement).
- renderMode AI_VIDEO marks budgeted paid motion preference; the desk can still generate Wan video for any selected scene using that scene's videoPrompt.

RETENTION
- spokenHook must create curiosity immediately without sounding like a movie trailer.
- Every scene must move the story forward with connected cause-and-effect.
- ending.payoffHi is spoken after the last scene (spoken LAST); nextEpisodeTeaseHi is packaging only.

ENGAGEMENT ENDING (EpicAstra — mandatory)
- The story's emotional payoff lands in the LAST STORY SCENE, never in ending.payoffHi.
- After the payoff scene, add ONE short final share-ask scene (4–6s) aimed at a specific person, e.g. "अगर इस कथा ने मन छुआ… तो इसे उस राम भक्त को भेजिए, जिसने यह कभी नहीं सुनी।" Match the devotee word to the episode (राम भक्त / शिव भक्त / कृष्ण भक्त / माँ के भक्त). DM sends drive non-follower reach more than any other signal.
- ending.payoffHi is spoken LAST: only a low-friction devotional comment prompt + jaikara, ≤10 words, e.g. "और कमेंट में लिखिए — जय श्री राम!" / "कमेंट में लिखिए — हर हर महादेव!"
- Never use guilt or superstition share-bait ("शेयर नहीं किया तो…", "पुण्य मिलेगा"), never like/subscribe spam, never English CTA words inside Hindi narration.
- Hindi narration should sound like one person telling a story aloud.

${productionBudget}
`;
}

export type EpisodeGenerator = (topic: string) => Promise<unknown>;

export async function generateEpisode(
  topic: string,
  generator?: EpisodeGenerator,
  provider: StoryProvider = 'ollama',
  requestedKind: RequestedStoryKind = 'canonical',
  brandId: BrandId = currentBrandId()
): Promise<Episode> {
  const cleanTopic = topic.trim();
  if (cleanTopic.length < 3) throw new Error('Topic must contain at least 3 characters');
  const effectiveKind: RequestedStoryKind =
    isTechBrand(brandId)
      ? 'tech'
      : requestedKind === 'tech'
        ? 'canonical'
        : requestedKind;
  const budget = await loadBudget();
  const hookSeconds = 6;
  const timeline = buildTimeline(budget.targetDurationSeconds, budget.maxScenes, hookSeconds);
  const prompt =
    isTechBrand(brandId)
      ? `
Create one tech education Reel about: ${cleanTopic}

IMPORTANT: The JSON field "topic" must be exactly this string (character-for-character):
${cleanTopic}
Put English titles in both "titleHi" and "titleEn" (titleHi may mirror English for this brand).
Set "id" to a short English kebab-case slug from the concept.
Set brandId to "${brandId}" and storyKind to TECH_EDUCATION.
Fill spokenHook (spoken cold open), hookDelivery, and spokenHookDurationSeconds=${hookSeconds}.
Fill featuredLords with diagram/UI subjects (not deities), then set each scene.appearingLords from those nameEn values.
Scene 1 must continue AFTER the spokenHook — do not repeat the hook.
Prefer STILL scenes. English narration in narrationHi.
Target about ${budget.targetDurationSeconds} seconds including the ${hookSeconds}s spokenHook window.
Audience: teens/adults unless the topic is beginner-friendly general.
`
      : `
Create one EpicAstra episode about: ${cleanTopic}

IMPORTANT: The JSON field "topic" must be exactly this string (character-for-character):
${cleanTopic}
Put the Hindi title in "titleHi" and the English title in "titleEn". Do not translate or rewrite "topic".
Set "id" to a short English kebab-case slug from the title (e.g. bhishma-lowered-bow). Never use placeholders like my-episode-001.

STORY FIRST: Draft the full connected Hindi katha (hook → beats → payoff) before assigning scene visuals.
Then split at natural speech boundaries into the required scene count. Lines must connect across scenes.
Narration style: warm conversational Hindi kathavachak — not mysterious/trailer. Prefer hookDelivery "warm" or "curious".
Do NOT pad with trailer clichés. Do NOT force 12–18-word captions; write natural spoken Hindi.
On 1–3 key emotional turns only, add voiceDirection + elevenLabsText (sparse tags). Keep narrationHi tag-free.

Fill spokenHook (spoken cold open), hookDelivery, and spokenHookDurationSeconds=${hookSeconds}.
Fill featuredLords first (exact lord names + visualIdentity + doNotConfuseWith), then set each scene.appearingLords from those nameEn values.
Scene 1 must continue AFTER the spokenHook — do not repeat the hook.

${effectiveKind === 'auto'
    ? 'Choose the appropriate storyKind yourself.'
    : `This request is explicitly ${effectiveKind}. storyKind must be ${storyKindValues[effectiveKind as Exclude<RequestedStoryKind, 'auto'>]}. Do not replace an established mythology story with invented fiction.`}
Picture-plan target about ${budget.targetDurationSeconds} seconds including the ${hookSeconds}s spokenHook window (final video retimes to TTS).
Audience: general/family unless the subject genuinely requires teens/adults.
If the full myth is long, write one self-contained Short slice with a natural cliffhanger — not the entire epic crammed in.
`;

  const system = systemPrompt(
    budget.maxPaidMotionScenes,
    budget.maxPaidMotionSeconds,
    budget.maxScenes,
    timeline,
    hookSeconds,
    brandId
  );
  const generationSchema =
    effectiveKind === 'auto'
      ? EpisodeGenerationSchema
      : EpisodeGenerationSchema.refine(
          (episode) =>
            episode.storyKind ===
            storyKindValues[effectiveKind as Exclude<RequestedStoryKind, 'auto'>],
          {
            path: ['storyKind'],
            message: `Must be ${storyKindValues[effectiveKind as Exclude<RequestedStoryKind, 'auto'>]} for this request`
          }
        );
  const raw = generator
    ? await generator(cleanTopic)
    : provider === 'gemini'
      ? await geminiStructuredChat(generationSchema, system, prompt)
      : provider === 'nvidia'
      ? await nvidiaStructuredChat(generationSchema, system, prompt)
      : provider === 'openai'
        ? await openAIStructuredChat(generationSchema, system, prompt)
        : provider === 'openrouter'
          ? await openRouterStructuredChat(generationSchema, system, prompt)
          : provider === 'groq'
            ? await groqStructuredChat(generationSchema, system, prompt)
            : await structuredChat(generationSchema, system, prompt);
  const parsed = EpisodeSchema.parse(raw);
  // Models (especially OpenAI) often localize `topic` into Hindi. Pin the requested
  // topic so generation does not fail a brittle exact-string check; Hindi titles live in titleHi.
  const localizedTopic =
    parsed.topic.trim().toLowerCase() !== cleanTopic.toLowerCase() ? parsed.topic.trim() : '';
  const titleEn = parsed.titleEn.trim() || cleanTopic;
  const titleHi = parsed.titleHi.trim() || localizedTopic || cleanTopic;
  // Models often copy sample id `my-episode-001` — never keep that as the asset folder key.
  const id = resolveEpisodeId({ id: parsed.id, titleEn, topic: cleanTopic });
  const episode: Episode = {
    ...parsed,
    id,
    brandId,
    topic: cleanTopic,
    titleEn,
    titleHi,
    ...(isTechBrand(brandId)
      ? { storyKind: 'TECH_EDUCATION' as const, fictionDisclosureRequired: false }
      : {
          // Conversational kathavachak default when the model omits narrationStyle.
          narrationStyle: parsed.narrationStyle ?? { ...DEFAULT_NARRATION_STYLE }
        })
  };
  assertEditorialPolicy(episode);
  const routedEpisode = routeWithinBudget(episode, budget);
  assertBudgetPolicy(routedEpisode, budget);

  return routedEpisode;
}
