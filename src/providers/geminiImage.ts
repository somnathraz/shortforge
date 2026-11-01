import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildSceneImagePromptAsync,
  type BuildSceneImagePromptOptions
} from '../lib/sceneImage.js';

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
};

const IMAGE_SIZES = ['512', '1K', '2K', '4K'] as const;
type ImageSize = (typeof IMAGE_SIZES)[number];

export type SceneImageInput = {
  referenceImagePaths?: string[];
  referenceImageRoles?: string[];
  visualPrompt: string;
  outputPath: string;
  /** Gemini imageConfig aspectRatio, e.g. 9:16, 16:9, 1:1 */
  aspectRatio?: string;
  /** Gemini imageConfig imageSize when supported (1K / 2K / 4K). */
  imageSize?: ImageSize | string;
  /** EpicAstra Heritage Frame options (variant / strong|thin / camera). */
  style?: BuildSceneImagePromptOptions;
};

function resolveImageSize(explicit?: string): ImageSize | undefined {
  const raw = (explicit || process.env.GOOGLE_IMAGE_SIZE || '').trim().toUpperCase();
  if (!raw) return undefined;
  const normalized = raw === '512' ? '512' : raw.replace(/^(\d)K$/i, '$1K');
  if ((IMAGE_SIZES as readonly string[]).includes(normalized)) {
    return normalized as ImageSize;
  }
  return undefined;
}

function mimeFor(file: string): string {
  if (/\.jpe?g$/i.test(file)) return 'image/jpeg';
  if (/\.webp$/i.test(file)) return 'image/webp';
  return 'image/png';
}

export async function generateGeminiImage(input: SceneImageInput): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is required when IMAGE_PROVIDER=gemini');

  const model = process.env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const timeoutMs = Number(process.env.GOOGLE_IMAGE_TIMEOUT_MS || '180000');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('GOOGLE_IMAGE_TIMEOUT_MS must be positive');

  const hasRefs = Boolean(input.referenceImagePaths?.length);
  const prompt = await buildSceneImagePromptAsync(input.visualPrompt, {
    ...(input.style || {}),
    includeReferenceInstructions: hasRefs || input.style?.includeReferenceInstructions
  });
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const refParts: GeminiPart[] = [];
  for (const [index, file] of (input.referenceImagePaths || []).entries()) {
    const role = input.referenceImageRoles?.[index] || 'GENERAL VISUAL REFERENCE (use only details relevant to the written scene)';
    refParts.push({ text: `Reference image ${index + 1} (${role}):` });
    refParts.push({
      inlineData: {
        mimeType: mimeFor(file),
        data: (await readFile(file)).toString('base64')
      }
    });
  }

  const imageSize = resolveImageSize(input.imageSize);
  const imageConfig: Record<string, string> = {
    aspectRatio: input.aspectRatio || '9:16'
  };
  if (imageSize) imageConfig.imageSize = imageSize;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ parts: [...refParts, { text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig
        }
      })
    });

    const body = (await response.json()) as GeminiResponse;
    if (response.status === 429) {
      const waitMs = 2000 * attempt;
      lastError = new Error(`Gemini image returned 429: ${body.error?.message || response.statusText}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Gemini image returned ${response.status}: ${body.error?.message || response.statusText}`);
    }

    const parts = body.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini image response did not include image bytes');
    }

    const mime = imagePart.inlineData.mimeType || 'image/png';
    const extension = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
    const destination = input.outputPath.replace(/\.(png|jpg|jpeg)$/i, `.${extension}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(imagePart.inlineData.data, 'base64'));
    return destination;
  }

  throw lastError || new Error('Gemini image generation failed after retries');
}
