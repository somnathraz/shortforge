import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSceneImagePrompt } from '../lib/sceneImage.js';

type VeoStartResponse = {
  name?: string;
  error?: { message?: string };
};

type VeoStatusResponse = {
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; videoBytes?: string };
      }>;
    };
  };
};

export type VeoClipInput = {
  prompt: string;
  outputPath: string;
  /** First-frame image (image-to-video). */
  imagePath?: string;
  /** Up to 3 asset reference images for character/style consistency. */
  referenceImagePaths?: string[];
  durationSeconds?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFor(filePath: string): string {
  return filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

async function imagePayload(filePath: string): Promise<{ bytesBase64Encoded: string; mimeType: string }> {
  const bytes = await readFile(filePath);
  return {
    bytesBase64Encoded: bytes.toString('base64'),
    mimeType: mimeFor(filePath)
  };
}

export function veoRootDir(): string {
  return path.resolve(process.env.VEO_OUTPUT_DIR || 'output/veo');
}

export function veoEpisodeDir(episodeId: string): string {
  return path.join(veoRootDir(), episodeId);
}

export function veoClipsDir(episodeId: string): string {
  return path.join(veoEpisodeDir(episodeId), 'clips');
}

export async function generateVeoClip(input: VeoClipInput): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is required for the Veo path');

  const model = process.env.VEO_MODEL || 'veo-3.1-generate-preview';
  const timeoutMs = Number(process.env.VEO_TIMEOUT_MS || '600000');
  const pollMs = Number(process.env.VEO_POLL_MS || '8000');
  const durationSeconds = Math.min(8, Math.max(4, input.durationSeconds ?? 8));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('VEO_TIMEOUT_MS must be positive');

  const refs = (input.referenceImagePaths || []).slice(0, 3);
  const instance: Record<string, unknown> = {
    prompt: buildSceneImagePrompt(input.prompt)
  };

  // Prefer referenceImages when provided (character/style lock).
  // Otherwise use single first-frame image for image-to-video.
  if (refs.length > 0) {
    instance.referenceImages = await Promise.all(
      refs.map(async (filePath) => ({
        image: await imagePayload(filePath),
        referenceType: 'asset'
      }))
    );
  } else if (input.imagePath) {
    instance.image = await imagePayload(input.imagePath);
  }

  const startUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning`;

  const parameters: Record<string, unknown> = {
    aspectRatio: '9:16',
    durationSeconds,
    personGeneration: 'allow_adult',
    sampleCount: 1
  };
  // Reference-image mode requires 8s on Veo 3.1.
  if (refs.length > 0) {
    parameters.durationSeconds = 8;
  }

  const startResponse = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      instances: [instance],
      parameters
    })
  });

  const startBody = (await startResponse.json()) as VeoStartResponse;
  if (!startResponse.ok) {
    throw new Error(`Veo start failed ${startResponse.status}: ${startBody.error?.message || startResponse.statusText}`);
  }
  if (!startBody.name) throw new Error('Veo did not return an operation name');

  const statusUrl = `https://generativelanguage.googleapis.com/v1beta/${startBody.name}`;
  const deadline = Date.now() + timeoutMs;
  let finalBody: VeoStatusResponse | undefined;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const statusResponse = await fetch(statusUrl, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const statusBody = (await statusResponse.json()) as VeoStatusResponse;
    if (!statusResponse.ok) {
      throw new Error(`Veo poll failed ${statusResponse.status}: ${statusBody.error?.message || statusResponse.statusText}`);
    }
    if (statusBody.error?.message) throw new Error(`Veo operation failed: ${statusBody.error.message}`);
    if (statusBody.done) {
      finalBody = statusBody;
      break;
    }
  }

  if (!finalBody) throw new Error(`Veo timed out after ${timeoutMs}ms for model ${model}`);

  const sample = finalBody.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
  await mkdir(path.dirname(input.outputPath), { recursive: true });

  if (sample?.videoBytes) {
    await writeFile(input.outputPath, Buffer.from(sample.videoBytes, 'base64'));
    return input.outputPath;
  }

  if (sample?.uri) {
    const download = await fetch(sample.uri, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow'
    });
    if (!download.ok) {
      throw new Error(`Veo download failed ${download.status}: ${download.statusText}`);
    }
    await writeFile(input.outputPath, Buffer.from(await download.arrayBuffer()));
    return input.outputPath;
  }

  throw new Error('Veo finished but returned no video bytes or URI');
}
