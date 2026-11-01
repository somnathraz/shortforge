import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EdgeTTS } from 'node-edge-tts';
import type { NarrationStyle } from '../schema/narrationStyle.js';
import { mapNarrationStyleToTts } from '../lib/narrationStyleMap.js';

export async function synthesizeHindiFree(
  text: string,
  outputPath?: string,
  options?: { narrationStyle?: NarrationStyle | unknown }
): Promise<string> {
  if (!text.trim()) throw new Error('Narration text cannot be empty');

  const mapped = mapNarrationStyleToTts(options?.narrationStyle);
  const voice = process.env.EDGE_TTS_VOICE || 'hi-IN-MadhurNeural';
  const lang = process.env.EDGE_TTS_LANG || 'hi-IN';
  const rate = process.env.EDGE_TTS_RATE_FORCE
    ? process.env.EDGE_TTS_RATE || 'default'
    : mapped.edgeRate;
  const timeoutMs = Number(process.env.EDGE_TTS_TIMEOUT_MS || '180000');
  const outputDir = path.resolve(process.env.TTS_OUTPUT_DIR || 'output/audio');
  const destination = outputPath
    ? path.resolve(outputPath)
    : path.join(outputDir, `narration-edge-${Date.now()}.mp3`);

  await mkdir(path.dirname(destination), { recursive: true });

  const tts = new EdgeTTS({
    voice,
    lang,
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
    rate,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180000
  });

  await tts.ttsPromise(text.trim(), destination);
  await writeFile(
    `${destination}.source.json`,
    `${JSON.stringify(
      {
        provider: 'edge-tts',
        voice,
        lang,
        rate,
        narrationStyle: mapped.style,
        costTier: 'free',
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return destination;
}
