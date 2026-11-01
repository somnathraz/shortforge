import { access, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { Episode } from '../schema/episode.js';
import { AudioPlanSchema, type AudioPlan } from '../schema/audioPlan.js';
import {
  loadAudioPlan,
  normalizeAudioPlan,
  planEpisodeAudio,
  saveAudioPlan
} from './sound-director.js';
import { mixNarrationWithSfx, sfxMixPath, summarizeSfxUsage } from './sfx-mixer.js';
import { finalMixPath, mixWithBgm } from './bgm-mixer.js';
import { buildNarrationTimeline } from './narration-timeline.js';
import {
  composeElevenLabsMusic,
  defaultHeroBgmPath,
  heroBgmPromptForMood
} from '../providers/elevenlabsMusic.js';
import { resolveUserBgmPath } from './sfx-library.js';

export type MixEpisodeAudioResult = {
  plan: AudioPlan;
  sfxMixPath: string;
  finalMixPath: string;
  bgmUsed?: string;
};

/**
 * Resolve plan (episode field → sidecar → LLM), mix SFX onto narration, then BGM.
 * Cue times use narration-aligned clock when planning fresh.
 * User-picked `bgmPath` only overrides automatic BGM selection — it does not disable SFX.
 * Pass `skipSfx: true` only when you explicitly want narration + BGM with no SFX layer.
 */
export async function mixEpisodeAudio(options: {
  episode: Episode;
  narrationPath: string;
  episodePath?: string;
  plan?: AudioPlan;
  /** If true and no plan exists, call Sound Director LLM. */
  autoPlan?: boolean;
  provider?: string;
  /** Paid ElevenLabs Music bed (hero Reels only). */
  heroBgm?: boolean;
  heroBgmPrompt?: string;
  /**
   * If true, missing library SFX may be generated via ElevenLabs into custom/
   * (opt-in — default is local/custom library only).
   */
  allowElevenLabsSfx?: boolean;
  /**
   * Explicit BGM file (absolute or under assets/audio/bgm/).
   * Overrides random mood pick. Does NOT skip SFX.
   */
  bgmPath?: string;
  /** Explicitly skip the SFX layer (narration + BGM only). Default false. */
  skipSfx?: boolean;
  cwd?: string;
}): Promise<MixEpisodeAudioResult> {
  const cwd = options.cwd || process.cwd();
  await access(options.narrationPath);

  const timeline = await buildNarrationTimeline(options.episode, options.narrationPath);
  const total = timeline.narrationDurationSeconds;
  const userBgmRaw = options.bgmPath?.trim();
  const skipSfx = options.skipSfx === true;

  let plan = options.plan;
  if (!plan && options.episode.audioPlan) {
    const opts: {
      timingSource?: AudioPlan['timingSource'];
      narrationDurationSeconds?: number;
    } = { narrationDurationSeconds: total };
    opts.timingSource = options.episode.audioPlan.timingSource || timeline.method;
    plan = normalizeAudioPlan(options.episode.audioPlan, total, opts);
  }
  if (!plan) {
    plan = await loadAudioPlan(options.episode.id, cwd);
  }

  const autoPlan =
    options.autoPlan ??
    (process.env.SOUND_DIRECTOR_AUTO_PLAN !== 'false' && process.env.AUDIO_AUTO_PLAN !== 'false');

  // Re-plan when we have real narration but existing plan was scene-planned only.
  const shouldReplanForNarration =
    !skipSfx &&
    autoPlan &&
    timeline.method === 'narration-aligned' &&
    plan &&
    plan.timingSource !== 'narration-aligned' &&
    process.env.AUDIO_REPLAN_ON_NARRATION !== 'false';

  if (!plan || shouldReplanForNarration) {
    if (!plan && skipSfx) {
      // Explicit SFX skip: no Sound Director / SFX plan required.
      plan = {
        bgmMood: 'divine_mystery',
        sfx: [
          {
            time: 0.05,
            effect: 'divine-chime',
            volume: 0.3,
            reason: 'Placeholder — skipped because skipSfx=true'
          }
        ],
        timingSource: timeline.method,
        narrationDurationSeconds: total
      };
    } else if (!plan && !autoPlan) {
      throw new Error(
        `No audio plan for ${options.episode.id}. Run: npm run audio:plan -- --episode ${options.episode.id} --audio <narration>`
      );
    } else if (!plan || shouldReplanForNarration) {
      if (shouldReplanForNarration) {
        console.log('Re-planning SFX on narration-aligned clock…');
      }
      const planned = await planEpisodeAudio({
        episode: options.episode,
        narrationPath: options.narrationPath,
        ...(options.episodePath ? { episodePath: options.episodePath } : {}),
        ...(options.provider ? { provider: options.provider } : {}),
        cwd
      });
      plan = planned.plan;
    }
  } else {
    plan = {
      ...AudioPlanSchema.parse(plan),
      timingSource: plan.timingSource || timeline.method,
      narrationDurationSeconds: plan.narrationDurationSeconds || total
    };
    await saveAudioPlan(options.episode.id, plan, cwd);
  }

  const sfxOut = sfxMixPath(options.episode.id, cwd);
  const finalOut = finalMixPath(options.episode.id, cwd);
  await mkdir(path.dirname(sfxOut), { recursive: true });

  if (skipSfx) {
    console.log('skipSfx=true — narration + BGM only (SFX layer disabled)');
    await copyFile(options.narrationPath, sfxOut);
    plan = {
      ...plan,
      sfxUsage: { local: 0, elevenlabs: 0, cues: [] }
    };
  } else {
    console.log(
      `SFX mix: ${plan.sfx.length} cues, mood=${plan.bgmMood}, clock=${plan.timingSource || 'unknown'}`
    );
    const sfxResult = await mixNarrationWithSfx({
      narrationPath: options.narrationPath,
      plan,
      outputPath: sfxOut,
      cwd,
      // Opt-in only — never auto-generate on miss. Missing cues are skipped.
      allowElevenLabsMiss: options.allowElevenLabsSfx === true,
      skipMissing: true
    });
    const sfxUsage = summarizeSfxUsage(sfxResult.resolved);
    const skippedN = sfxUsage.skipped || sfxResult.skipped.length;
    console.log(
      `SFX sources: ${sfxUsage.local} local · ${sfxUsage.elevenlabs} ElevenLabs` +
        (skippedN ? ` · ${skippedN} skipped (upload optional)` : '')
    );
    plan = { ...plan, sfxUsage };
  }

  const hero =
    !userBgmRaw &&
    (options.heroBgm === true ||
      process.env.HERO_REEL === 'true' ||
      process.env.AUDIO_HERO_BGM === 'true');

  let bgmOverride: string | undefined;

  if (userBgmRaw) {
    const resolved = resolveUserBgmPath(userBgmRaw, cwd);
    await access(resolved);
    bgmOverride = resolved;
    console.log(`BGM (user selected): ${resolved}`);
    plan = { ...plan, bgmTrack: path.basename(resolved), heroBgm: false };
  } else if (hero) {
    const heroPath = defaultHeroBgmPath(options.episode.id, cwd);
    try {
      await access(heroPath);
      bgmOverride = heroPath;
      console.log(`Hero BGM (cached): ${heroPath}`);
    } catch {
      const prompt = heroBgmPromptForMood(plan.bgmMood, options.heroBgmPrompt);
      const lengthMs = Math.round(Math.min(90, Math.max(15, total + 3)) * 1000);
      console.log(`Hero BGM: generating ElevenLabs Music (${lengthMs}ms)…`);
      bgmOverride = await composeElevenLabsMusic({
        prompt,
        musicLengthMs: lengthMs,
        outputPath: heroPath
      });
    }
    plan = { ...plan, heroBgm: true, bgmTrack: path.basename(bgmOverride) };
  }

  const bgmResult = await mixWithBgm({
    voicePath: sfxOut,
    narrationPath: options.narrationPath,
    mood: plan.bgmMood,
    outputPath: finalOut,
    ...(bgmOverride ? { bgmPath: bgmOverride } : {}),
    cwd
  });

  if (!bgmResult.bgmUsed) {
    console.warn(
      `BGM file missing for mood "${plan.bgmMood}" — voice+SFX only. Add tracks under assets/audio/bgm/${plan.bgmMood}/`
    );
  } else {
    console.log(`BGM: ${path.basename(bgmResult.bgmUsed)}`);
    plan = { ...plan, bgmTrack: path.basename(bgmResult.bgmUsed) };
  }

  await saveAudioPlan(options.episode.id, plan, cwd);

  // Also keep a timestamped take so Desk lists a new file (stable *-final-mix.wav is "latest").
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  const stampedFinal = path.join(
    path.dirname(finalOut),
    `${options.episode.id}-final-mix-${stamp}.wav`
  );
  const stampedSfx = path.join(
    path.dirname(sfxOut),
    `${options.episode.id}-sfx-mix-${stamp}.wav`
  );
  await copyFile(finalOut, stampedFinal);
  await copyFile(sfxOut, stampedSfx);
  console.log(`Mix take: ${path.basename(stampedFinal)}`);

  const result: MixEpisodeAudioResult = {
    plan,
    sfxMixPath: sfxOut,
    finalMixPath: stampedFinal
  };
  if (bgmResult.bgmUsed) result.bgmUsed = bgmResult.bgmUsed;
  return result;
}

/** Prefer existing final-mix / sfx-mix for produce when present. */
export async function resolveMixedAudioIfPresent(
  episodeId: string,
  cwd = process.cwd()
): Promise<string | undefined> {
  for (const candidate of [finalMixPath(episodeId, cwd), sfxMixPath(episodeId, cwd)]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return undefined;
}

export async function ensureFinalMixCopy(
  sourcePath: string,
  episodeId: string,
  cwd = process.cwd()
): Promise<string> {
  const dest = finalMixPath(episodeId, cwd);
  if (path.resolve(sourcePath) === path.resolve(dest)) return dest;
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(sourcePath, dest);
  return dest;
}
