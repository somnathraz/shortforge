#!/usr/bin/env node
import '../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import { EpisodeSchema, type Episode } from '../schema/episode.js';
import { synthesizeHindiSarvam } from '../providers/sarvamTts.js';
import { buildHindiTtsScript, resolveSpokenHook } from '../lib/ttsScript.js';
import {
  isTwoSpeakerDialogueEpisode,
  persistDialogueVoices,
  synthesizeTwoSpeakerDialogue
} from '../lib/dialogueTts.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  const directText = valueFor('--text');
  const outputPath = valueFor('--output');
  const speaker = valueFor('--voice') || valueFor('--speaker');
  const voiceAArg = valueFor('--voice-a') || valueFor('--voiceA');
  const voiceBArg = valueFor('--voice-b') || valueFor('--voiceB');
  const forceSingle = args.includes('--single-voice');
  if (!episodePath && !directText) {
    throw new Error(
      'Usage: npm run tts:sarvam -- --episode data/episodes/file.json [--voice shubh] [--voice-a A] [--voice-b B] [--output narration.mp3]'
    );
  }

  let narration = directText;
  let episodeId = 'narration';
  let episode: Episode | undefined;
  let resolvedEpisodePath: string | undefined;
  if (episodePath) {
    resolvedEpisodePath = episodePath;
    episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
    narration = buildHindiTtsScript(episode);
    episodeId = episode.id;
    if (resolveSpokenHook(episode)) {
      console.log('TTS includes spokenHook before scenes (title is not spoken)');
    }
  }

  if (episode && !forceSingle && isTwoSpeakerDialogueEpisode(episode)) {
    const voiceA =
      voiceAArg?.trim() ||
      speaker?.trim() ||
      episode.voices?.A?.voiceId?.trim() ||
      episode.voiceCast?.NARRATOR?.speaker?.trim() ||
      process.env.SARVAM_SPEAKER?.trim();
    const voiceB =
      voiceBArg?.trim() ||
      episode.voices?.B?.voiceId?.trim() ||
      episode.voiceCast?.FEMALE_CHARACTER?.speaker?.trim() ||
      process.env.SARVAM_SPEAKER_B?.trim();
    if (!voiceA || !voiceB) {
      throw new Error(
        'Two-speaker dialogue needs both Sarvam speakers. Pick Voice A + Voice B in Desk, or pass --voice-a and --voice-b.'
      );
    }
    if (resolvedEpisodePath) {
      episode = await persistDialogueVoices(resolvedEpisodePath, episode, voiceA, voiceB, 'sarvam');
    }
    const tag = `${voiceA.slice(0, 6)}-${voiceB.slice(0, 6)}`;
    const defaultOut = `output/audio/${episodeId}-sarvam-dialogue-${tag}-${Date.now()}.mp3`;
    const result = await synthesizeTwoSpeakerDialogue(episode, outputPath || defaultOut, {
      provider: 'sarvam',
      voiceA,
      voiceB,
      ...(episode.narrationStyle ? { narrationStyle: episode.narrationStyle } : {})
    });
    console.log(`Created: ${result.destination}`);
    console.log(
      `Two-speaker Sarvam dialogue · ${result.turns} turns · A=${result.voiceA} · B=${result.voiceB}`
    );
    return;
  }

  const voiceTag = (speaker || process.env.SARVAM_SPEAKER || 'shubh').slice(0, 12);
  const defaultOut = `output/audio/${episodeId}-sarvam-${voiceTag}-${Date.now()}.mp3`;
  const destination = await synthesizeHindiSarvam(narration || '', outputPath || defaultOut, {
    ...(speaker ? { speaker } : {}),
    ...(episode?.narrationStyle ? { narrationStyle: episode.narrationStyle } : {})
  });
  console.log(`Created: ${destination}`);
  if (speaker) console.log(`Speaker: ${speaker}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
