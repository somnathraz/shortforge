import { stripElevenLabsAudioTags } from '../schema/voiceDirection.js';
import type { DialogueLine } from '../schema/dialogueCast.js';
import type { Episode, Scene } from '../schema/episode.js';

const SPEAKER_PREFIX = /^\s*[A-Za-z]\s*:\s*/;

/** Remove leading "A:" / "B:" labels so TTS does not speak them. */
export function stripDialogueSpeakerPrefix(text: string): string {
  return text.replace(SPEAKER_PREFIX, '').trim();
}

export function plainDialogueCaption(text: string): string {
  return stripElevenLabsAudioTags(stripDialogueSpeakerPrefix(text));
}

export function dialogueLinesToNarrationHi(lines: DialogueLine[]): string {
  return lines
    .map((line) => plainDialogueCaption(line.text))
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function dialogueLinesToElevenLabsText(lines: DialogueLine[]): string {
  return lines
    .map((line) => stripDialogueSpeakerPrefix(line.text))
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function dialogueLinesToVoiceSegments(
  sceneId: number,
  lines: DialogueLine[]
): NonNullable<Scene['voiceSegments']> {
  return lines.slice(0, 8).map((line, index) => {
    const speaker = line.speaker.toUpperCase();
    const isListener = speaker === 'B';
    const plain = plainDialogueCaption(line.text);
    const tagged = stripDialogueSpeakerPrefix(line.text);
    return {
      id: `${sceneId}${String.fromCharCode(97 + index)}`,
      type: isListener ? ('DIALOGUE' as const) : ('NARRATION' as const),
      speaker: isListener ? 'Listener' : 'Kathavachak',
      voiceRole: isListener ? 'FEMALE_CHARACTER' : 'NARRATOR',
      textHi: plain || tagged,
      elevenLabsText: tagged,
      lipSync: false
    };
  });
}

/**
 * Ensure production TTS fields are clean while preserving dialogue metadata.
 * - Strip A:/B: from spokenHook / narrationHi / ending.payoffHi
 * - Fill narrationHi + elevenLabsText (+ voiceSegments) from dialogueLines when present
 */
export function normalizeDialogueEpisodeForProduction<T extends Record<string, unknown>>(
  raw: T
): T {
  const episode = structuredClone(raw) as T & {
    spokenHook?: unknown;
    hookDialogueLines?: DialogueLine[];
    scenes?: Array<Record<string, unknown>>;
    ending?: Record<string, unknown>;
    format?: string;
  };

  if (Array.isArray(episode.hookDialogueLines) && episode.hookDialogueLines.length) {
    const hookPlain = dialogueLinesToNarrationHi(episode.hookDialogueLines);
    const hookTagged = dialogueLinesToElevenLabsText(episode.hookDialogueLines);
    if (typeof episode.spokenHook === 'string') {
      episode.spokenHook = stripDialogueSpeakerPrefix(episode.spokenHook);
      if (/^\s*[AB]\s*:/i.test(String(raw.spokenHook || '')) || !episode.spokenHook) {
        episode.spokenHook = hookPlain;
      }
    } else if (!episode.spokenHook) {
      episode.spokenHook = hookPlain;
    }
    // Keep tagged hook available via first scene pattern; spokenHook stays caption-safe plain.
    void hookTagged;
  } else if (typeof episode.spokenHook === 'string') {
    episode.spokenHook = stripDialogueSpeakerPrefix(episode.spokenHook);
  }

  if (Array.isArray(episode.scenes)) {
    for (const scene of episode.scenes) {
      const lines = scene.dialogueLines as DialogueLine[] | undefined;
      if (Array.isArray(lines) && lines.length) {
        scene.narrationHi = dialogueLinesToNarrationHi(lines);
        scene.elevenLabsText = dialogueLinesToElevenLabsText(lines);
        if (!scene.voiceSegments) {
          scene.voiceSegments = dialogueLinesToVoiceSegments(Number(scene.id) || 1, lines);
        }
      } else if (typeof scene.narrationHi === 'string') {
        scene.narrationHi = stripDialogueSpeakerPrefix(scene.narrationHi);
        // If narration still has "A: ... B: ..." mid-string, strip each clause label.
        scene.narrationHi = String(scene.narrationHi)
          .replace(/(^|\s)[A-Za-z]\s*:\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
      if (typeof scene.elevenLabsText === 'string') {
        scene.elevenLabsText = stripDialogueSpeakerPrefix(scene.elevenLabsText).replace(
          /(^|\s)[A-Za-z]\s*:\s*/g,
          ' '
        );
      }
    }
  }

  if (episode.ending && typeof episode.ending.payoffHi === 'string') {
    episode.ending.payoffHi = stripDialogueSpeakerPrefix(String(episode.ending.payoffHi))
      .replace(/(^|\s)[A-Za-z]\s*:\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (episode.ending && typeof episode.ending.nextEpisodeTeaseHi === 'string') {
    // Tease is packaging-only; keep readable without forcing TTS labels.
    episode.ending.nextEpisodeTeaseHi = String(episode.ending.nextEpisodeTeaseHi)
      .replace(/(^|\s)[A-Za-z]\s*:\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (!episode.format && (episode.hookDialogueLines || episode.elevenLabsDialogueRequest)) {
    episode.format = 'TWO_SPEAKER_DIALOGUE';
  }

  return episode;
}

export type DialogueNormalizedEpisode = Episode;
