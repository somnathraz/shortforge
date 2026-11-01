import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Episode } from '../schema/episode.js';
import {
  AudioPlanSchema,
  SoundDirectorLlmSchema,
  type AudioPlan,
  type BgmMood,
  type SfxCue,
  type SfxEffectId
} from '../schema/audioPlan.js';
import { allowedEffectsPromptList, isAllowedEffect, SOUND_PROFILES } from './sfx-library.js';
import { openRouterStructuredChat } from '../lib/openrouter.js';
import { groqStructuredChat } from '../lib/groq.js';
import { openAIStructuredChat } from '../lib/openai.js';
import { geminiStructuredChat } from '../lib/gemini.js';
import {
  buildNarrationTimeline,
  type NarrationTimeline
} from './narration-timeline.js';

const AMBIENCE_EFFECTS = new Set<SfxEffectId>(['rain', 'wind', 'river', 'fire']);
const LOUD_IMPACTS = new Set<SfxEffectId>(['deep-boom', 'heavy-impact', 'impact', 'thunder']);
const SOFT_MOODS = new Set<BgmMood>(['divine_mystery', 'emotional']);

export function audioPlanPath(episodeId: string, cwd = process.cwd()): string {
  const root = path.resolve(cwd, process.env.AUDIO_OUTPUT_DIR || 'output/audio');
  return path.join(root, `${episodeId}.audio-plan.json`);
}

export function soundDirectorSystemPrompt(): string {
  const profiles = Object.entries(SOUND_PROFILES)
    .map(
      ([mood, profile]) =>
        `- ${mood} (${profile.label}): bed=${profile.bed}; prefer cues=${profile.typicalCues.join(', ')}`
    )
    .join('\n');

  return `You are the sound director for EpicAstra, a Hindi Indian mythology short-video channel.

Match TONE first. Many episodes are quiet, sacred, pastoral, or secret — not Hollywood trailers.

Given:
- Hindi narration
- REAL narration-aligned scene timings (seconds on the finished voice track)
- scene descriptions
- per-scene legacySoundCue (Hindi/English free text — treat as the director's intent)
- total narration duration

Create a sound-effect plan.

AVAILABLE EFFECTS:
${allowedEffectsPromptList()}

BGM MOODS (choose exactly one):
${profiles}

TONE → MOOD (pick the closest):
- Quiet sacred / gaushala / naamkaran / temple intimacy → divine_mystery or emotional
- Secret danger / Kamsa threat without battle → dark_mystery (soft volumes) OR divine_mystery
- Open war / weapons → epic_battle
- Big public reveal / cosmic climax only → revelation
NEVER choose revelation or epic_battle for a soft pastoral/secret ritual unless the whole short is a loud climax.

MAP legacySoundCue → nearest ALLOWED id (examples):
- गायों की घंटियाँ / घंटियाँ / bells → temple-bell (soft 0.25–0.4)
- बांसुरी / flute / तानपुरा / soft pad → magical-sparkle or divine-chime
- मंद शंख / soft shankh → shankh (volume ≤0.4)
- पवन / wind / village breeze → wind (0.2–0.35)
- मृदंग / soft pulse → transition-whoosh or magical-sparkle (never sword-clash)
- ominous rumble for Kamsa → thunder OR soft riser (≤0.4), not deep-boom
- straw / breath / silence → wind or skip a cue
If the cue is soft, the effect volume MUST be soft.

RULES:

1. Use 4–7 effects for a 50–60s video. Prefer fewer if the story is quiet.
2. Opening (≤1s) must match tone:
   - Soft/sacred/pastoral/secret → divine-chime or magical-sparkle or temple-bell (0.25–0.45). NEVER deep-boom / impact / heavy-impact.
   - Dark threat / battle / hard mystery hook → deep-boom or impact only when the opening line is punchy.
3. Support important story beats; do not SFX every scene.
4. Use riser sparingly — at most one, and only before a true cosmic/name revelation. Quiet naamkaran/gaushala stories often need ZERO risers.
5. Prefer divine + soft nature effects for miracles and rituals. Avoid battle SFX unless weapons appear.
6. Ambience (rain/wind/river/fire) volume 0.2–0.35.
7. Prefer scene startSecond or a beat just after; do not bury loud SFX mid-sentence.
8. Avoid repeating the same effect more than twice.
9. Volume 0.2–0.8; soft pastoral cues stay ≤0.45; shankh/temple-bell for intimacy ≤0.5.
10. effect must be an exact id from AVAILABLE EFFECTS — never invent filenames.
11. Cue times MUST use the provided narration-aligned startSecond values — do not invent a new timeline.
12. Honor legacySoundCue over generic "cinematic trailer" habits.
13. Return JSON only.

Return:
{
  "bgmMood": "...",
  "sfx": [
    {
      "time": number,
      "effect": "...",
      "volume": number,
      "reason": "..."
    }
  ]
}`;
}

function clampVolume(effect: SfxEffectId, volume: number, mood?: BgmMood): number {
  const raw = Number.isFinite(volume) ? volume : 0.45;
  let min = 0.2;
  let max = 0.8;
  if (AMBIENCE_EFFECTS.has(effect)) {
    max = 0.4;
  } else if (LOUD_IMPACTS.has(effect)) {
    min = mood && SOFT_MOODS.has(mood) ? 0.25 : 0.45;
    if (mood && SOFT_MOODS.has(mood)) max = 0.55;
  } else if (
    (effect === 'shankh' || effect === 'temple-bell' || effect === 'divine-chime') &&
    mood &&
    SOFT_MOODS.has(mood)
  ) {
    max = 0.5;
  } else if (effect === 'riser' && mood && SOFT_MOODS.has(mood)) {
    max = 0.45;
  }
  return Math.min(max, Math.max(min, raw));
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  return Math.min(time, Math.max(0, duration - 0.05));
}

function openingHookForMood(mood: BgmMood): SfxCue {
  if (SOFT_MOODS.has(mood)) {
    return {
      time: 0.12,
      effect: 'divine-chime',
      volume: 0.38,
      reason: 'soft sacred opening (tone-matched hook)'
    };
  }
  if (mood === 'dark_mystery') {
    return {
      time: 0.12,
      effect: 'riser',
      volume: 0.4,
      reason: 'quiet ominous opening'
    };
  }
  return {
    time: 0.12,
    effect: 'deep-boom',
    volume: 0.75,
    reason: 'opening hook'
  };
}

function isSoftOpeningCue(cue: SfxCue): boolean {
  return (
    cue.time <= 1 &&
    (cue.effect === 'divine-chime' ||
      cue.effect === 'magical-sparkle' ||
      cue.effect === 'temple-bell' ||
      cue.effect === 'wind' ||
      cue.effect === 'transition-whoosh')
  );
}

function isLoudOpeningCue(cue: SfxCue): boolean {
  return cue.time <= 1 && LOUD_IMPACTS.has(cue.effect);
}

/** Normalize LLM / manual plan into a valid AudioPlan. */
export function normalizeAudioPlan(
  raw: unknown,
  totalDurationSeconds: number,
  options?: {
    maxSfx?: number;
    timingSource?: AudioPlan['timingSource'];
    narrationDurationSeconds?: number;
  }
): AudioPlan {
  const parsed = SoundDirectorLlmSchema.parse(raw);
  const maxSfx = options?.maxSfx ?? 7;
  const cues: SfxCue[] = [];
  const seen = new Map<SfxEffectId, number>();
  const mood = parsed.bgmMood;

  for (const cue of parsed.sfx) {
    if (!isAllowedEffect(cue.effect)) continue;
    const count = seen.get(cue.effect) || 0;
    if (count >= 2) continue;
    seen.set(cue.effect, count + 1);
    cues.push({
      time: clampTime(cue.time, totalDurationSeconds),
      effect: cue.effect,
      volume: clampVolume(cue.effect, cue.volume, mood),
      reason: cue.reason.trim().slice(0, 200)
    });
  }

  cues.sort((a, b) => a.time - b.time);

  // Soft moods must not keep a trailer boom on the opening second.
  if (SOFT_MOODS.has(mood)) {
    for (let i = cues.length - 1; i >= 0; i -= 1) {
      const cue = cues[i]!;
      if (isLoudOpeningCue(cue)) cues.splice(i, 1);
    }
  }

  if (!cues.some((cue) => cue.time <= 1)) {
    cues.unshift(openingHookForMood(mood));
  } else if (SOFT_MOODS.has(mood) && !cues.some(isSoftOpeningCue) && cues.some(isLoudOpeningCue)) {
    cues.unshift(openingHookForMood(mood));
  } else {
    // Keep opening hits slightly after t=0 so FFmpeg adelay + players don't drop them.
    for (const cue of cues) {
      if (cue.time < 0.04) cue.time = 0.04;
    }
  }

  // Soft sacred plans: at most one riser.
  if (SOFT_MOODS.has(mood)) {
    let risers = 0;
    for (let i = 0; i < cues.length; i += 1) {
      if (cues[i]!.effect !== 'riser') continue;
      risers += 1;
      if (risers > 1) {
        cues.splice(i, 1);
        i -= 1;
      } else {
        cues[i]!.volume = Math.min(cues[i]!.volume, 0.42);
      }
    }
  }

  const trimmed = cues.slice(0, maxSfx);
  return AudioPlanSchema.parse({
    bgmMood: mood,
    sfx: trimmed,
    ...(options?.timingSource ? { timingSource: options.timingSource } : {}),
    ...(options?.narrationDurationSeconds !== undefined
      ? { narrationDurationSeconds: options.narrationDurationSeconds }
      : {})
  });
}

function buildUserPrompt(episode: Episode, timeline: NarrationTimeline): string {
  const scenes = timeline.scenes
    .map((scene) => {
      const label =
        scene.kind === 'spokenHook'
          ? 'SPOKEN HOOK'
          : scene.kind === 'ending'
            ? 'ENDING PAYOFF'
            : `Scene ${scene.id}`;
      return [
        `${label} @ ${scene.startSecond}s (${scene.durationSeconds}s) [NARRATION CLOCK]`,
        `  narration: ${scene.narrationHi}`,
        `  visual: ${scene.visualPrompt}`,
        `  camera: ${scene.camera}`,
        `  importance: ${scene.importance}/10`,
        `  legacySoundCue (MUST guide effect choice): ${scene.soundCue}`
      ].join('\n');
    })
    .join('\n\n');

  return `Episode: ${episode.id}
Title (NOT spoken — packaging only): ${episode.titleHi} / ${episode.titleEn}
Packaging hookHi (NOT automatically spoken): ${episode.hookHi}
Spoken hook delivery: ${episode.hookDelivery || 'curious'}
Kind: ${episode.storyKind}
Target duration: ${episode.targetDurationSeconds}s
Timing source: ${timeline.method}
Real narration duration: ${timeline.narrationDurationSeconds}s

Tone reminder: If titles/cues mention गौशाला, नामकरण, गाय, बांसुरी, घंटियाँ, गुप्त संस्कार — prefer divine_mystery or emotional, soft divine SFX, no trailer boom, no double risers.

Spoken hook (if present) starts at 0s — optional subtle whoosh / soft curiosity hit only; never loud trailer boom.

Use these NARRATION-ALIGNED timestamps as truth for cue placement (seconds on the voice track):

${scenes}

Create the audio plan now.`;
}

async function runSoundDirectorLlm(
  episode: Episode,
  provider: string,
  timeline: NarrationTimeline
): Promise<AudioPlan> {
  const system = soundDirectorSystemPrompt();
  const user = buildUserPrompt(episode, timeline);
  const chat =
    provider === 'gemini'
      ? geminiStructuredChat
      : provider === 'groq'
      ? groqStructuredChat
      : provider === 'openai'
        ? openAIStructuredChat
        : openRouterStructuredChat;

  const raw = await chat(SoundDirectorLlmSchema, system, user);
  return normalizeAudioPlan(raw, timeline.narrationDurationSeconds, {
    timingSource: timeline.method,
    narrationDurationSeconds: timeline.narrationDurationSeconds
  });
}

export async function loadAudioPlan(
  episodeId: string,
  cwd = process.cwd()
): Promise<AudioPlan | undefined> {
  try {
    const text = await readFile(audioPlanPath(episodeId, cwd), 'utf8');
    return AudioPlanSchema.parse(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

export async function saveAudioPlan(
  episodeId: string,
  plan: AudioPlan,
  cwd = process.cwd()
): Promise<string> {
  const out = audioPlanPath(episodeId, cwd);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return out;
}

/**
 * LLM Sound Director: plan BGM mood + timed SFX from narration-aligned timings.
 */
export async function planEpisodeAudio(options: {
  episode: Episode;
  episodePath?: string;
  /** Finished TTS path — enables real cue timestamps. */
  narrationPath?: string;
  provider?: string;
  persistOnEpisode?: boolean;
  cwd?: string;
}): Promise<{ plan: AudioPlan; planPath: string; timeline: NarrationTimeline }> {
  const cwd = options.cwd || process.cwd();
  const provider =
    options.provider ||
    process.env.SOUND_DIRECTOR_PROVIDER ||
    process.env.STORY_PROVIDER ||
    'openrouter';

  const timeline = await buildNarrationTimeline(options.episode, options.narrationPath);
  if (timeline.method === 'narration-aligned') {
    console.log(
      `Cue clock: narration-aligned (${timeline.narrationDurationSeconds}s TTS)`
    );
  } else {
    console.warn('Cue clock: scene-planned (pass --audio / narration for real timestamps)');
  }

  const plan = await runSoundDirectorLlm(options.episode, provider, timeline);
  const planPath = await saveAudioPlan(options.episode.id, plan, cwd);

  if (options.persistOnEpisode !== false && options.episodePath) {
    const raw = JSON.parse(await readFile(options.episodePath, 'utf8')) as Record<string, unknown>;
    raw.audioPlan = plan;
    await writeFile(options.episodePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  }

  return { plan, planPath, timeline };
}

export function resolvePlanFromEpisode(episode: Episode): AudioPlan | undefined {
  if (!episode.audioPlan) return undefined;
  const total = episode.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const opts: {
    timingSource?: AudioPlan['timingSource'];
    narrationDurationSeconds?: number;
  } = {};
  if (episode.audioPlan.timingSource) opts.timingSource = episode.audioPlan.timingSource;
  if (episode.audioPlan.narrationDurationSeconds !== undefined) {
    opts.narrationDurationSeconds = episode.audioPlan.narrationDurationSeconds;
  }
  return normalizeAudioPlan(episode.audioPlan, total, opts);
}
