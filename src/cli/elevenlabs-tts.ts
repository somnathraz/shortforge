#!/usr/bin/env node
import '../lib/loadEnv.js';
import { readFile } from 'node:fs/promises';
import { EpisodeSchema, type Episode } from '../schema/episode.js';
import { synthesizeHindi } from '../providers/elevenlabs.js';
import {
  buildElevenLabsTtsScript,
  resolveEpisodeElevenLabsVoiceSettings,
  resolveSpokenHook
} from '../lib/ttsScript.js';
import {
  isTwoSpeakerDialogueEpisode,
  persistDialogueVoices,
  synthesizeTwoSpeakerDialogue
} from '../lib/dialogueTts.js';
import { isTechEditorialEpisode } from '../visual/tech-editorial-style.js';
import {
  TECH_ENGLISH_INDIA,
  techElevenLabsVoiceId
} from '../lib/techVoiceProfile.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

/** Tech Reels speak English; mythology speaks Hindi. */
function resolveTtsLanguage(episode?: Episode, override?: string): string {
  if (override?.trim()) return override.trim().toLowerCase();
  if (episode && isTechEditorialEpisode(episode)) return 'en';
  return 'hi';
}

async function main(): Promise<void> {
  const episodePath = valueFor('--episode');
  const directText = valueFor('--text');
  const outputPath = valueFor('--output');
  const voiceId = valueFor('--voice');
  const voiceAArg = valueFor('--voice-a') || valueFor('--voiceA');
  const voiceBArg = valueFor('--voice-b') || valueFor('--voiceB');
  const languageOverride = valueFor('--language');
  const forceSingle = args.includes('--single-voice');
  if (!episodePath && !directText) {
    throw new Error(
      'Usage: npm run tts:elevenlabs -- --episode data/episodes/file.json [--voice VOICE_ID] [--voice-a A] [--voice-b B] [--language en|hi] [--output narration.mp3]'
    );
  }

  let narration = directText;
  let defaultOut: string | undefined;
  let episodeId = 'narration';
  let episode: Episode | undefined;
  let resolvedEpisodePath: string | undefined;
  if (episodePath) {
    resolvedEpisodePath = episodePath;
    episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
    narration = buildElevenLabsTtsScript(episode);
    episodeId = episode.id;
    if (resolveSpokenHook(episode)) {
      console.log('TTS includes spokenHook before scenes (title is not spoken)');
    }
  }
  const languageCode = resolveTtsLanguage(episode, languageOverride);
  const techEpisode = Boolean(episode && isTechEditorialEpisode(episode));

  // Two-speaker dialogue: generate A/B turns with separate voices, then concat.
  if (episode && !techEpisode && !forceSingle && isTwoSpeakerDialogueEpisode(episode)) {
    const voiceA =
      voiceAArg?.trim() ||
      voiceId?.trim() ||
      episode.voices?.A?.voiceId?.trim() ||
      process.env.ELEVENLABS_VOICE_ID?.trim();
    const voiceB =
      voiceBArg?.trim() ||
      episode.voices?.B?.voiceId?.trim() ||
      process.env.ELEVENLABS_VOICE_B_ID?.trim();
    if (!voiceA || !voiceB) {
      throw new Error(
        'Two-speaker dialogue needs both voices. Pick Voice A + Voice B in Desk, or pass --voice-a and --voice-b.'
      );
    }
    if (resolvedEpisodePath) {
      episode = await persistDialogueVoices(resolvedEpisodePath, episode, voiceA, voiceB);
    }
    const tag = `${voiceA.slice(0, 4)}-${voiceB.slice(0, 4)}`;
    defaultOut = `output/audio/${episodeId}-elevenlabs-dialogue-${tag}-${Date.now()}.mp3`;
    const result = await synthesizeTwoSpeakerDialogue(episode, outputPath || defaultOut, {
      voiceA,
      voiceB,
      ...(episode.narrationStyle ? { narrationStyle: episode.narrationStyle } : {})
    });
    console.log(`Created: ${result.destination}`);
    console.log(
      `Two-speaker dialogue · ${result.turns} turns · A=${result.voiceA} · B=${result.voiceB}`
    );
    return;
  }

  // Tech: Indian-English voices only — default Rahul; allow Desk --voice pick; never mythology Kanika default.
  const resolvedVoiceId = techEpisode
    ? techElevenLabsVoiceId(TECH_ENGLISH_INDIA, voiceId)
    : voiceId?.trim() || process.env.ELEVENLABS_VOICE_ID?.trim();
  const voiceTag = (resolvedVoiceId || 'default').slice(0, 8);
  defaultOut = `output/audio/${episodeId}-elevenlabs-${voiceTag}-${Date.now()}.mp3`;
  const mythologyV4Settings =
    episode && !techEpisode ? resolveEpisodeElevenLabsVoiceSettings(episode) : undefined;
  const destination = await synthesizeHindi(narration || '', outputPath || defaultOut, {
    ...(resolvedVoiceId ? { voiceId: resolvedVoiceId } : {}),
    languageCode: techEpisode ? TECH_ENGLISH_INDIA.elevenLabs.languageCode : languageCode,
    ...(techEpisode
      ? {
          profileId: TECH_ENGLISH_INDIA.id,
          modelId: TECH_ENGLISH_INDIA.elevenLabs.modelId,
          voiceSettings: TECH_ENGLISH_INDIA.elevenLabs.voiceSettings
        }
      : {
          modelId: process.env.ELEVENLABS_MODEL?.trim() || 'eleven_v4',
          ...(mythologyV4Settings ? { voiceSettings: mythologyV4Settings } : {}),
          ...(episode?.narrationStyle ? { narrationStyle: episode.narrationStyle } : {})
        })
  });
  console.log(`Created: ${destination}`);
  if (techEpisode) {
    console.log(
      `Tech voice: ${TECH_ENGLISH_INDIA.label} (${resolvedVoiceId}) · ${TECH_ENGLISH_INDIA.elevenLabs.modelId} · lang=en`
    );
  } else {
    console.log(
      `Language: ${languageCode}${languageCode === 'en' ? ' (English)' : ' (Hindi mythology)'} · model=eleven_v4`
    );
    if (resolvedVoiceId) console.log(`Voice: ${resolvedVoiceId}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
