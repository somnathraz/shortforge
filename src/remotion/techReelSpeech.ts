import { writeFile } from 'node:fs/promises';
import {
  resolveTechVoiceProfile,
  techElevenLabsVoiceId,
  type TechVoiceProfile
} from '../lib/techVoiceProfile.js';

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
export function alignmentWords(alignment: Alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (characters.length !== starts.length || characters.length !== ends.length) throw new Error('Invalid speech alignment');
  const words: Array<{ part: string; start: number; end: number }> = [];
  let part = ''; let start = 0; let end = 0;
  const flush = () => { if (part) words.push({ part, start: Math.round(start * 1000), end: Math.round(end * 1000) }); part = ''; };
  characters.forEach((c, i) => {
    if (!Number.isFinite(starts[i]) || !Number.isFinite(ends[i])) throw new Error('Invalid speech timestamps');
    if (/\s/.test(c)) { flush(); return; }
    if (!part) start = starts[i]!;
    part += c; end = ends[i]!;
  });
  flush();
  return words;
}

export async function alignedElevenSpeech(
  text: string,
  output: string,
  profileInput?: string | TechVoiceProfile
): Promise<TechVoiceProfile> {
  const profile =
    typeof profileInput === 'object' && profileInput
      ? profileInput
      : resolveTechVoiceProfile(typeof profileInput === 'string' ? profileInput : undefined);
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = techElevenLabsVoiceId(profile);
  if (!key || !voiceId) throw new Error('ElevenLabs requires ELEVENLABS_API_KEY and a locked tech voice profile');

  const { ensureElevenLabsVoiceInLibrary } = await import('../lib/elevenlabsVoices.js');
  await ensureElevenLabsVoiceInLibrary({ voiceId });

  // v4: Stability + Similarity only (no style / speed / speaker_boost).
  const requestBody = {
    text,
    model_id: profile.elevenLabs.modelId,
    language_code: profile.elevenLabs.languageCode,
    voice_settings: {
      stability: profile.elevenLabs.voiceSettings.stability,
      similarity_boost: profile.elevenLabs.voiceSettings.similarity_boost
    }
  };

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify(requestBody)
    }
  );
  if (!response.ok) throw new Error(`ElevenLabs speech returned ${response.status}: ${(await response.text()).slice(0, 250)}`);
  const payload = (await response.json()) as { audio_base64: string; normalized_alignment?: Alignment; alignment?: Alignment };
  const alignment = payload.normalized_alignment || payload.alignment;
  if (!payload.audio_base64 || !alignment) throw new Error('ElevenLabs did not return audio and alignment');
  const words = alignmentWords(alignment);
  await writeFile(output, Buffer.from(payload.audio_base64, 'base64'));
  await writeFile(`${output}.json`, JSON.stringify(words));
  await writeFile(
    `${output}.source.json`,
    `${JSON.stringify({ provider: 'elevenlabs', profile: profile.id, voiceId, request: requestBody }, null, 2)}\n`
  );
  return profile;
}
