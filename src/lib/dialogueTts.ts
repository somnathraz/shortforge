import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Episode } from '../schema/episode.js';
import { synthesizeHindi } from '../providers/elevenlabs.js';
import { synthesizeHindiSarvam } from '../providers/sarvamTts.js';
import { expandEpisodeVoicePlan } from './ttsScript.js';
import { stripDialogueSpeakerPrefix } from './dialogueEpisode.js';

export type DialogueTurn = {
  speaker: 'A' | 'B';
  text: string;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-800)}`));
    });
  });
}

async function concatMp3Files(inputs: string[], outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  if (inputs.length === 1) {
    await runFfmpeg(['-y', '-i', inputs[0]!, '-c:a', 'libmp3lame', '-q:a', '2', outputPath]);
    return;
  }
  const listPath = `${outputPath}.concat.txt`;
  await writeFile(
    listPath,
    `${inputs.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n')}\n`,
    'utf8'
  );
  try {
    // Re-encode so mixed sample rates / bitrates from separate TTS calls still join cleanly.
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      outputPath
    ]);
  } finally {
    await rm(listPath, { force: true }).catch(() => undefined);
  }
}

function normalizeSpeaker(raw: string): 'A' | 'B' {
  const key = raw.trim().toUpperCase();
  if (key === 'B' || key === 'LISTENER' || key === 'FEMALE_CHARACTER') return 'B';
  return 'A';
}

/** Prefer authored dialogue request order; fall back to voiceSegments plan. */
export function buildDialogueTurns(episode: Episode): DialogueTurn[] {
  const fromRequest = episode.elevenLabsDialogueRequest?.inputs;
  if (fromRequest?.length) {
    return mergeConsecutiveTurns(
      fromRequest.map((line) => ({
        speaker: normalizeSpeaker(line.speaker),
        text: stripDialogueSpeakerPrefix(line.text)
      }))
    );
  }

  const turns: DialogueTurn[] = [];
  const hasSceneDialogue = episode.scenes.some((scene) => (scene.dialogueLines?.length || 0) > 0);
  if (hasSceneDialogue || episode.hookDialogueLines?.length) {
    for (const line of episode.hookDialogueLines || []) {
      turns.push({
        speaker: normalizeSpeaker(line.speaker),
        text: stripDialogueSpeakerPrefix(line.text)
      });
    }
    for (const scene of episode.scenes) {
      for (const line of scene.dialogueLines || []) {
        turns.push({
          speaker: normalizeSpeaker(line.speaker),
          text: stripDialogueSpeakerPrefix(line.text)
        });
      }
    }
    for (const line of episode.ending.teaseDialogueLines || []) {
      turns.push({
        speaker: normalizeSpeaker(line.speaker),
        text: stripDialogueSpeakerPrefix(line.text)
      });
    }
  } else {
    for (const item of expandEpisodeVoicePlan(episode)) {
      const speaker =
        item.voiceRole === 'FEMALE_CHARACTER' || /listener/i.test(item.speaker)
          ? 'B'
          : normalizeSpeaker(item.speaker);
      turns.push({
        speaker,
        text: (item.elevenLabsText || item.textHi).trim()
      });
    }
  }
  return mergeConsecutiveTurns(turns.filter((turn) => turn.text.trim()));
}

export function mergeConsecutiveTurns(turns: DialogueTurn[]): DialogueTurn[] {
  const merged: DialogueTurn[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.speaker === turn.speaker) {
      last.text = `${last.text} ${text}`.replace(/\s{2,}/g, ' ').trim();
    } else {
      merged.push({ speaker: turn.speaker, text });
    }
  }
  return merged;
}

export function resolveDialogueVoiceIds(
  episode: Episode,
  options?: { voiceA?: string; voiceB?: string; provider?: 'elevenlabs' | 'sarvam' }
): { voiceA: string; voiceB: string } {
  const provider = options?.provider || 'elevenlabs';
  const envFallback =
    provider === 'sarvam'
      ? process.env.SARVAM_SPEAKER?.trim() || ''
      : process.env.ELEVENLABS_VOICE_ID?.trim() || '';
  const voiceA =
    options?.voiceA?.trim() ||
    episode.voices?.A?.voiceId?.trim() ||
    episode.voiceCast?.NARRATOR?.speaker?.trim() ||
    envFallback ||
    '';
  const voiceB =
    options?.voiceB?.trim() ||
    episode.voices?.B?.voiceId?.trim() ||
    episode.voiceCast?.FEMALE_CHARACTER?.speaker?.trim() ||
    (provider === 'sarvam' ? process.env.SARVAM_SPEAKER_B?.trim() || '' : '') ||
    voiceA;
  if (!voiceA) throw new Error('Voice A is required (pick storyteller in Desk or set voices.A.voiceId)');
  if (!voiceB) throw new Error('Voice B is required (pick listener in Desk or set voices.B.voiceId)');
  return { voiceA, voiceB };
}

export function isTwoSpeakerDialogueEpisode(episode: Episode): boolean {
  if (episode.format === 'TWO_SPEAKER_DIALOGUE') return true;
  if (episode.elevenLabsDialogueRequest?.inputs?.length) return true;
  if (episode.hookDialogueLines?.length) return true;
  return episode.scenes.some((scene) => (scene.dialogueLines?.length || 0) > 0);
}

export async function persistDialogueVoices(
  episodePath: string,
  episode: Episode,
  voiceA: string,
  voiceB: string,
  provider: 'elevenlabs' | 'sarvam' = 'elevenlabs'
): Promise<Episode> {
  const languageCode = provider === 'sarvam' ? 'hi-IN' : 'hi';
  const next: Episode = {
    ...episode,
    format: episode.format || 'TWO_SPEAKER_DIALOGUE',
    voices: {
      ...(episode.voices || {}),
      A: {
        role: episode.voices?.A?.role || 'storyteller (kathavachak)',
        voiceId: voiceA,
        ...(episode.voices?.A?.note ? { note: episode.voices.A.note } : {})
      },
      B: {
        role: episode.voices?.B?.role || 'listener (reacts)',
        voiceId: voiceB,
        ...(episode.voices?.B?.note ? { note: episode.voices.B.note } : {})
      }
    },
    voiceCast: {
      ...(episode.voiceCast || {}),
      NARRATOR: {
        provider,
        speaker: voiceA,
        languageCode,
        ...(episode.voiceCast?.NARRATOR?.model
          ? { model: episode.voiceCast.NARRATOR.model }
          : {})
      },
      FEMALE_CHARACTER: {
        provider,
        speaker: voiceB,
        languageCode,
        ...(episode.voiceCast?.FEMALE_CHARACTER?.model
          ? { model: episode.voiceCast.FEMALE_CHARACTER.model }
          : {})
      }
    }
  };
  await writeFile(episodePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export type DialogueTurnSynthesizer = (args: {
  text: string;
  outputPath: string;
  voiceId: string;
  narrationStyle?: Episode['narrationStyle'];
}) => Promise<void>;

/**
 * Generate interleaved A/B clips with two voices, then concat to one narration file.
 */
export async function synthesizeTwoSpeakerDialogue(
  episode: Episode,
  outputPath: string,
  options?: {
    voiceA?: string;
    voiceB?: string;
    provider?: 'elevenlabs' | 'sarvam';
    narrationStyle?: Episode['narrationStyle'];
    synthesizeTurn?: DialogueTurnSynthesizer;
  }
): Promise<{ destination: string; turns: number; voiceA: string; voiceB: string }> {
  const turns = buildDialogueTurns(episode);
  if (!turns.length) throw new Error('No dialogue turns found for two-speaker TTS');
  const provider = options?.provider || 'elevenlabs';
  const { voiceA, voiceB } = resolveDialogueVoiceIds(episode, {
    voiceA: options?.voiceA,
    voiceB: options?.voiceB,
    provider
  });
  if (voiceA === voiceB) {
    console.warn(
      'Voice A and Voice B are the same id — output will not sound like two speakers. Pick different voices in Desk.'
    );
  }

  const synthesizeTurn: DialogueTurnSynthesizer =
    options?.synthesizeTurn ||
    (provider === 'sarvam'
      ? async ({ text, outputPath: clipPath, voiceId, narrationStyle }) => {
          await synthesizeHindiSarvam(text, clipPath, {
            speaker: voiceId,
            ...(narrationStyle ? { narrationStyle } : {})
          });
        }
      : async ({ text, outputPath: clipPath, voiceId, narrationStyle }) => {
          await synthesizeHindi(text, clipPath, {
            voiceId,
            languageCode: 'hi',
            modelId: process.env.ELEVENLABS_MODEL?.trim() || 'eleven_v4',
            ...(narrationStyle ? { narrationStyle } : {})
          });
        });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mythos-dialogue-'));
  const clipPaths: string[] = [];
  try {
    for (const [index, turn] of turns.entries()) {
      const clipPath = path.join(tempDir, `${String(index).padStart(3, '0')}-${turn.speaker}.mp3`);
      const voiceId = turn.speaker === 'B' ? voiceB : voiceA;
      await synthesizeTurn({
        text: turn.text,
        outputPath: clipPath,
        voiceId,
        ...(options?.narrationStyle ? { narrationStyle: options.narrationStyle } : {})
      });
      clipPaths.push(clipPath);
      console.log(
        `Dialogue turn ${index + 1}/${turns.length} · ${turn.speaker} · ${provider} · ${voiceId.slice(0, 12)}…`
      );
    }
    await concatMp3Files(clipPaths, outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return { destination: outputPath, turns: turns.length, voiceA, voiceB };
}
