import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildSceneImagePromptAsync,
  imageDimensions,
  IMAGE_NEGATIVE_PROMPT,
  resolveImageNegativePrompt,
  type BuildSceneImagePromptOptions
} from '../lib/sceneImage.js';

export type SceneImageInput = {
  visualPrompt: string;
  outputPath: string;
  seed?: number;
  width?: number;
  height?: number;
  /** Image style options (EpicAstra heritage or Tech Editorial). */
  style?: BuildSceneImagePromptOptions;
};

export async function generatePollinationsImage(input: SceneImageInput): Promise<string> {
  const prompt = await buildSceneImagePromptAsync(input.visualPrompt, input.style || {});
  const defaults = imageDimensions();
  const width = input.width ?? defaults.width;
  const height = input.height ?? defaults.height;
  const seed = input.seed ?? Number(process.env.POLLINATIONS_SEED || String(Date.now() % 1_000_000));
  const model = process.env.POLLINATIONS_MODEL || 'flux';
  const baseUrl = (process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai').replace(/\/$/, '');
  const timeoutMs = Number(process.env.POLLINATIONS_TIMEOUT_MS || '180000');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('POLLINATIONS_TIMEOUT_MS must be positive');

  const url = new URL(`${baseUrl}/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('model', model);
  url.searchParams.set('nologo', 'true');
  url.searchParams.set('private', 'true');
  url.searchParams.set('enhance', process.env.POLLINATIONS_ENHANCE || 'true');
  const negative =
    process.env.POLLINATIONS_NEGATIVE_PROMPT ||
    resolveImageNegativePrompt(input.style?.episode) ||
    IMAGE_NEGATIVE_PROMPT;
  url.searchParams.set('negative_prompt', negative);

  const headers: Record<string, string> = { accept: 'image/*' };
  const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Pollinations fetch failed (${url.origin}): ${reason}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Pollinations returned ${response.status}: ${detail.slice(0, 400)}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) {
    throw new Error(`Pollinations returned a suspiciously small payload (${bytes.length} bytes)`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const destination = input.outputPath.replace(/\.(png|jpg|jpeg)$/i, `.${extension}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return destination;
}
