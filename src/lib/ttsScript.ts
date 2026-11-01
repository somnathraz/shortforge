import type { Episode, Scene } from '../schema/episode.js';
import {
  defaultSarvamVoiceCast,
  spokenHookDelivery,
  spokenHookText,
  type VoiceCast,
  type VoiceRoleProfile,
  type VoiceSegment
} from '../schema/voiceCast.js';
import {
  resolveElevenLabsSpeakText,
  voiceDirectionToV4Settings,
  type VoiceDirection
} from '../schema/voiceDirection.js';

/** Packaging/title are never spoken — only spokenHook + scene narration + ending payoff. */
export function resolveSpokenHook(episode: Episode): string {
  return spokenHookText(episode.spokenHook);
}

export function spokenHookPlannedDuration(episode: Episode): number {
  const hook = resolveSpokenHook(episode);
  if (!hook) return 0;
  const raw = episode.spokenHookDurationSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (episode.spokenHook && typeof episode.spokenHook === 'object') {
    const estimated = episode.spokenHook.estimatedDurationSeconds;
    if (typeof estimated === 'number' && estimated > 0) return estimated;
  }
  return 6;
}

export function resolveVoiceCast(episode: Episode): VoiceCast {
  return episode.voiceCast && Object.keys(episode.voiceCast).length
    ? episode.voiceCast
    : defaultSarvamVoiceCast();
}

export function resolveVoiceRoleProfile(
  episode: Episode,
  voiceRole: string
): VoiceRoleProfile {
  const cast = resolveVoiceCast(episode);
  const profile = cast[voiceRole] || cast.NARRATOR;
  if (!profile) {
    throw new Error(`voiceCast missing role "${voiceRole}" and NARRATOR fallback`);
  }
  return profile;
}

/** Scene spoken text: join voiceSegments when present, else narrationHi. */
export function resolveSceneSpokenText(scene: Scene): string {
  if (scene.voiceSegments?.length) {
    return scene.voiceSegments
      .map((segment) => segment.textHi.trim())
      .filter(Boolean)
      .join(' ');
  }
  return scene.narrationHi.trim();
}

/** Scene text for ElevenLabs v4 — keeps [audio tags] from elevenLabsText. */
export function resolveSceneElevenLabsText(scene: Scene): string {
  if (scene.voiceSegments?.length) {
    return scene.voiceSegments
      .map((segment) =>
        resolveElevenLabsSpeakText({
          plainText: segment.textHi,
          elevenLabsText: segment.elevenLabsText,
          voiceDirection: segment.voiceDirection
        })
      )
      .filter(Boolean)
      .join(' ');
  }
  return resolveElevenLabsSpeakText({
    plainText: scene.narrationHi,
    elevenLabsText: scene.elevenLabsText,
    voiceDirection: scene.voiceDirection
  });
}

export function resolveSceneVoiceSegments(scene: Scene): VoiceSegment[] {
  if (scene.voiceSegments?.length) return scene.voiceSegments;
  return [
    {
      id: `${scene.id}a`,
      type: 'NARRATION',
      speaker: 'NARRATOR',
      voiceRole: 'NARRATOR',
      textHi: scene.narrationHi.trim(),
      delivery: 'storytelling',
      ...(scene.voiceDirection ? { voiceDirection: scene.voiceDirection } : {}),
      ...(scene.elevenLabsText ? { elevenLabsText: scene.elevenLabsText } : {}),
      lipSync: false
    }
  ];
}

/** Aggregate voiceDirection intensity for a single-file ElevenLabs render. */
export function resolveEpisodeVoiceDirection(episode: Episode): VoiceDirection | undefined {
  for (const scene of episode.scenes) {
    if (scene.voiceDirection) return scene.voiceDirection;
    const fromSegment = scene.voiceSegments?.find((segment) => segment.voiceDirection)?.voiceDirection;
    if (fromSegment) return fromSegment;
  }
  return undefined;
}

export function resolveEpisodeElevenLabsVoiceSettings(episode: Episode): {
  stability: number;
  similarity_boost: number;
} {
  return voiceDirectionToV4Settings(resolveEpisodeVoiceDirection(episode));
}

export type VoicePlanItem = {
  key: string;
  kind: 'spokenHook' | 'scene' | 'ending';
  sceneId?: number;
  segmentId: string;
  speaker: string;
  voiceRole: string;
  type: 'NARRATION' | 'DIALOGUE';
  textHi: string;
  /** ElevenLabs v4 speak text (may include [audio tags]). */
  elevenLabsText: string;
  delivery?: string;
  voiceDirection?: VoiceDirection;
  lipSync: boolean;
  profile: VoiceRoleProfile;
  /** Relative path hint under output/audio/<episodeId>/ */
  relativePath: string;
};

/**
 * Expand episode into ordered TTS jobs (hook → scene segments → ending).
 * Speakers come from fixed voiceCast — never shuffled randomly.
 */
export function expandEpisodeVoicePlan(episode: Episode): VoicePlanItem[] {
  const cast = resolveVoiceCast(episode);
  const items: VoicePlanItem[] = [];

  const hook = resolveSpokenHook(episode);
  if (hook) {
    const voiceRole =
      (episode.spokenHook && typeof episode.spokenHook === 'object'
        ? episode.spokenHook.voiceRole
        : undefined) || 'NARRATOR';
    const delivery =
      spokenHookDelivery(episode.spokenHook, episode.hookDelivery) || 'curious';
    const profile = cast[voiceRole] || cast.NARRATOR!;
    items.push({
      key: 'hook',
      kind: 'spokenHook',
      segmentId: 'hook',
      speaker: 'NARRATOR',
      voiceRole,
      type: 'NARRATION',
      textHi: hook,
      elevenLabsText: hook,
      delivery,
      lipSync: false,
      profile,
      relativePath: 'hook.wav'
    });
  }

  for (const scene of episode.scenes) {
    const segments = resolveSceneVoiceSegments(scene);
    segments.forEach((segment, index) => {
      const profile = cast[segment.voiceRole] || cast.NARRATOR!;
      const order = String(index + 1).padStart(2, '0');
      const slug = segment.speaker
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'voice';
      const elevenLabsText = resolveElevenLabsSpeakText({
        plainText: segment.textHi,
        elevenLabsText: segment.elevenLabsText,
        voiceDirection: segment.voiceDirection
      });
      items.push({
        key: `scene-${scene.id}-${segment.id}`,
        kind: 'scene',
        sceneId: scene.id,
        segmentId: segment.id,
        speaker: segment.speaker,
        voiceRole: segment.voiceRole,
        type: segment.type,
        textHi: segment.textHi.trim(),
        elevenLabsText,
        ...(segment.delivery ? { delivery: segment.delivery } : {}),
        ...(segment.voiceDirection ? { voiceDirection: segment.voiceDirection } : {}),
        lipSync: Boolean(segment.lipSync),
        profile,
        relativePath: `scene-${String(scene.id).padStart(2, '0')}/${order}-${slug}.wav`
      });
    });
  }

  const ending = episode.ending.payoffHi.trim();
  if (ending) {
    const profile = cast.NARRATOR!;
    items.push({
      key: 'ending',
      kind: 'ending',
      segmentId: 'ending',
      speaker: 'NARRATOR',
      voiceRole: 'NARRATOR',
      type: 'NARRATION',
      textHi: ending,
      elevenLabsText: ending,
      delivery: 'conclusive',
      lipSync: false,
      profile,
      relativePath: 'ending.wav'
    });
  }

  return items;
}

/**
 * Full Hindi script for single-file TTS providers (legacy path).
 * Order: spokenHook → scenes (voiceSegments joined) → ending payoff.
 * Never includes titleHi / titleEn / nextEpisodeTease.
 * Plain text only — no ElevenLabs audio tags.
 */
export function buildHindiTtsScript(episode: Episode): string {
  const parts = [
    resolveSpokenHook(episode),
    ...episode.scenes.map((scene) => resolveSceneSpokenText(scene)),
    episode.ending.payoffHi.trim()
  ].filter(Boolean);
  if (!parts.length) throw new Error('Episode has no spoken narration text');
  return parts.join(' ');
}

/**
 * Full script for ElevenLabs v4 — includes inline audio tags from elevenLabsText.
 * Captions / Edge / Sarvam should keep using buildHindiTtsScript.
 */
export function buildElevenLabsTtsScript(episode: Episode): string {
  const parts = [
    resolveSpokenHook(episode),
    ...episode.scenes.map((scene) => resolveSceneElevenLabsText(scene)),
    episode.ending.payoffHi.trim()
  ].filter(Boolean);
  if (!parts.length) throw new Error('Episode has no spoken narration text');
  return parts.join(' ');
}

/** Planned picture length: hook window + scene windows (ending may extend via audio). */
export function plannedVisualDurationSeconds(episode: Episode): number {
  return (
    spokenHookPlannedDuration(episode) +
    episode.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0)
  );
}

export type NarrationSegment = {
  kind: 'spokenHook' | 'scene' | 'ending';
  id: string | number;
  text: string;
  /** Planned start when using scene-planned clock (hook offset). */
  plannedStartSecond: number;
  plannedDurationSeconds: number;
};

/** Segments for captions / timeline weighting (includes ending payoff). */
export function narrationSegments(episode: Episode): NarrationSegment[] {
  const hook = resolveSpokenHook(episode);
  const hookDur = spokenHookPlannedDuration(episode);
  const segments: NarrationSegment[] = [];
  let cursor = 0;

  if (hook) {
    segments.push({
      kind: 'spokenHook',
      id: 'spokenHook',
      text: hook,
      plannedStartSecond: 0,
      plannedDurationSeconds: hookDur
    });
    cursor = hookDur;
  }

  for (const scene of episode.scenes) {
    segments.push({
      kind: 'scene',
      id: scene.id,
      text: resolveSceneSpokenText(scene),
      plannedStartSecond: scene.startSecond,
      plannedDurationSeconds: scene.durationSeconds
    });
    cursor = scene.startSecond + scene.durationSeconds;
  }

  const ending = episode.ending.payoffHi.trim();
  if (ending) {
    const endingDur = Math.min(5, Math.max(2.5, ending.length / 18));
    segments.push({
      kind: 'ending',
      id: 'ending',
      text: ending,
      plannedStartSecond: cursor,
      plannedDurationSeconds: endingDur
    });
  }

  return segments;
}
