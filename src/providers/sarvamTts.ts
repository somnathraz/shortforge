import { mkdir, writeFile, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { NarrationStyle } from '../schema/narrationStyle.js';
import { mapNarrationStyleToTts } from '../lib/narrationStyleMap.js';

const MAX_CHARS_V3 = 2400;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-1500) || `${command} exited ${code}`));
    });
  });
}

/** Split Hindi narration into API-safe chunks (bulbul:v3 max ~2500 chars). */
export function chunkSarvamText(text: string, maxChars = MAX_CHARS_V3): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const parts: string[] = [];
  let remaining = cleaned;
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    const breakAt = Math.max(
      window.lastIndexOf('।'),
      window.lastIndexOf('.'),
      window.lastIndexOf('?'),
      window.lastIndexOf('!'),
      window.lastIndexOf('\n'),
      window.lastIndexOf(' ')
    );
    const cut = breakAt > maxChars * 0.4 ? breakAt + 1 : maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function callSarvamTts(options: {
  text: string;
  apiKey: string;
  speaker: string;
  model: string;
  languageCode: string;
  pace: number;
  sampleRate: number;
  codec: string;
  temperature?: number;
  timeoutMs: number;
}): Promise<{ audio: Buffer; requestBody: Record<string, unknown> }> {
  const body: Record<string, unknown> = {
    text: options.text,
    language_code: options.languageCode,
    speaker: options.speaker,
    model: options.model,
    pace: options.pace,
    speech_sample_rate: options.sampleRate,
    output_audio_codec: options.codec
  };
  if (options.model.includes('v3') && options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'api-subscription-key': options.apiKey,
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(options.timeoutMs),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS returned ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { audios?: string[]; request_id?: string };
  const chunks = payload.audios || [];
  if (!chunks.length) throw new Error('Sarvam TTS returned no audio');
  return { audio: Buffer.from(chunks.join(''), 'base64'), requestBody: body };
}

async function concatAudioFiles(inputs: string[], outputPath: string): Promise<void> {
  if (inputs.length === 1) {
    await run('ffmpeg', ['-y', '-i', inputs[0]!, '-c', 'copy', outputPath]);
    return;
  }
  const listPath = `${outputPath}.concat.txt`;
  await writeFile(
    listPath,
    `${inputs.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n')}\n`,
    'utf8'
  );
  try {
    await run('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      outputPath
    ]);
  } finally {
    await rm(listPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Hindi narration via Sarvam Bulbul TTS.
 * Requires SARVAM_API_KEY (api-subscription-key).
 * Uses episode.narrationStyle → pace + temperature (v3 has no emotion enum field).
 */
export async function synthesizeHindiSarvam(
  text: string,
  outputPath?: string,
  options?: { speaker?: string; narrationStyle?: NarrationStyle | unknown }
): Promise<string> {
  const apiKey =
    process.env.SARVAM_API_KEY?.trim() ||
    process.env.SARVAM_API_SUBSCRIPTION_KEY?.trim() ||
    '';
  if (!apiKey) throw new Error('SARVAM_API_KEY is required');
  if (!text.trim()) throw new Error('Narration text cannot be empty');

  const mapped = mapNarrationStyleToTts(options?.narrationStyle);
  const speaker =
    options?.speaker?.trim().toLowerCase() ||
    process.env.SARVAM_SPEAKER?.trim().toLowerCase() ||
    'shubh';
  const model = process.env.SARVAM_MODEL?.trim() || 'bulbul:v3';
  const languageCode = process.env.SARVAM_LANGUAGE?.trim() || 'hi-IN';
  // Style wins over env unless env explicitly forces override
  const pace = process.env.SARVAM_PACE_FORCE
    ? Number(process.env.SARVAM_PACE)
    : mapped.sarvamPace;
  const sampleRate = Number(process.env.SARVAM_SAMPLE_RATE || '24000');
  const codec = (process.env.SARVAM_OUTPUT_CODEC || 'mp3').toLowerCase();
  const temperature = process.env.SARVAM_TEMPERATURE_FORCE
    ? Number(process.env.SARVAM_TEMPERATURE)
    : mapped.sarvamTemperature;
  const timeoutMs = Number(process.env.SARVAM_TIMEOUT_MS || '120000');

  const outputDir = path.resolve(process.env.TTS_OUTPUT_DIR || 'output/audio');
  const ext = codec === 'wav' || codec === 'linear16' ? 'wav' : 'mp3';
  const destination = outputPath
    ? path.resolve(outputPath)
    : path.join(outputDir, `narration-sarvam-${Date.now()}.${ext}`);
  await mkdir(path.dirname(destination), { recursive: true });

  const chunks = chunkSarvamText(text);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'sarvam-tts-'));
  let lastRequestBody: Record<string, unknown> | undefined;
  try {
    const partPaths: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const { audio, requestBody } = await callSarvamTts({
        text: chunk,
        apiKey,
        speaker,
        model,
        languageCode,
        pace,
        sampleRate,
        codec: codec === 'linear16' ? 'wav' : codec,
        temperature,
        timeoutMs
      });
      lastRequestBody = requestBody;
      const partPath = path.join(tempDir, `part-${index}.${ext}`);
      await writeFile(partPath, audio);
      partPaths.push(partPath);
    }

    if (partPaths.length === 1) {
      await copyFile(partPaths[0]!, destination);
    } else {
      try {
        await concatAudioFiles(partPaths, destination);
      } catch {
        const listPath = path.join(tempDir, 'concat.txt');
        await writeFile(
          listPath,
          `${partPaths.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n')}\n`,
          'utf8'
        );
        await run('ffmpeg', [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c:a',
          ext === 'mp3' ? 'libmp3lame' : 'pcm_s16le',
          destination
        ]);
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  await writeFile(
    `${destination}.source.json`,
    `${JSON.stringify(
      {
        provider: 'sarvam',
        speaker,
        model,
        languageCode,
        narrationStyle: mapped.style,
        request: lastRequestBody
          ? {
              language_code: lastRequestBody.language_code,
              speaker: lastRequestBody.speaker,
              model: lastRequestBody.model,
              pace: lastRequestBody.pace,
              temperature: lastRequestBody.temperature,
              speech_sample_rate: lastRequestBody.speech_sample_rate,
              output_audio_codec: lastRequestBody.output_audio_codec
            }
          : undefined,
        chunks: chunks.length,
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
