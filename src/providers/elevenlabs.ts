import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NarrationStyle } from '../schema/narrationStyle.js';
import { mapNarrationStyleToTts } from '../lib/narrationStyleMap.js';

const V4_MODELS = new Set(['eleven_v4', 'eleven_v4_turbo']);

function isV4Model(modelId: string): boolean {
  return V4_MODELS.has(modelId.trim().toLowerCase());
}

export async function synthesizeHindi(
  text: string,
  outputPath?: string,
  options?: {
    voiceId?: string;
    narrationStyle?: NarrationStyle | unknown;
    /**
     * ISO 639-1 language for ElevenLabs. Mythology Hindi → "hi".
     * Tech English narration must use "en" — forcing "hi" on English text
     * often produces Arabic / Gulf-like accents.
     */
    languageCode?: string;
    /**
     * Prefer eleven_v4 for mythology + Tech Reels.
     * v4 only accepts stability + similarity_boost (no style/speed/SSML).
     */
    modelId?: string;
    voiceSettings?: { stability: number; similarity_boost: number };
    profileId?: string;
  }
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = options?.voiceId?.trim() || process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID or --voice is required');
  if (!text.trim()) throw new Error('Narration text cannot be empty');

  // Shared library voices must be in the account once; preview demos do not need this.
  const { ensureElevenLabsVoiceInLibrary } = await import('../lib/elevenlabsVoices.js');
  await ensureElevenLabsVoiceInLibrary({ voiceId });

  const mapped = mapNarrationStyleToTts(options?.narrationStyle);
  const timeoutMs = Number(process.env.ELEVENLABS_TIMEOUT_MS || '120000');
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
  const languageCode = (
    options?.languageCode?.trim() ||
    process.env.ELEVENLABS_LANGUAGE?.trim() ||
    'hi'
  ).toLowerCase();

  const modelId = (
    options?.modelId ||
    process.env.ELEVENLABS_MODEL ||
    'eleven_v4'
  ).trim();
  const v4 = isV4Model(modelId);

  // v4: only stability + similarity. Legacy models may still send style.
  const voice_settings = options?.voiceSettings
    ? {
        stability: options.voiceSettings.stability,
        similarity_boost: options.voiceSettings.similarity_boost
      }
    : v4
      ? {
          stability: mapped.elevenLabs.stability,
          similarity_boost: mapped.elevenLabs.similarity_boost
        }
      : mapped.elevenLabs;

  const requestBody = {
    text: text.trim(),
    model_id: modelId,
    language_code: languageCode,
    voice_settings
  };

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs returned ${response.status}: ${errorText.slice(0, 500)}`);
  }
  const outputDir = path.resolve(process.env.TTS_OUTPUT_DIR || 'output/audio');
  const destination = outputPath
    ? path.resolve(outputPath)
    : path.join(outputDir, `narration-${Date.now()}.mp3`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  await writeFile(
    `${destination}.source.json`,
    `${JSON.stringify(
      {
        provider: 'elevenlabs',
        voiceId,
        profileId: options?.profileId,
        narrationStyle: mapped.style,
        request: {
          model_id: requestBody.model_id,
          language_code: requestBody.language_code,
          voice_settings: requestBody.voice_settings
        },
        costTier: 'paid',
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return destination;
}
