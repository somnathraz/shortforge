import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type WanResponse = {
  artifacts?: Array<{ base64?: string }>;
  data?: { b64_json?: string } | Array<{ b64_json?: string }>;
  error?: { message?: string } | string;
};

export type WanAnimateInput = {
  imagePath: string;
  videoPath: string;
  prompt: string;
  outputPath?: string;
  seed?: number;
};

function mimeFor(filePath: string, type: 'image' | 'video'): string {
  const extension = path.extname(filePath).toLowerCase();
  if (type === 'video') {
    if (extension !== '.mp4') throw new Error('Wan driving video must be an .mp4 file');
    return 'video/mp4';
  }
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  throw new Error('Wan reference image must be PNG, JPEG, or WebP');
}

function artifactBase64(body: WanResponse): string | undefined {
  const direct = body.artifacts?.[0]?.base64;
  if (direct) return direct;
  if (Array.isArray(body.data)) return body.data[0]?.b64_json;
  return body.data?.b64_json;
}

function runtimeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.WAN_NIM_API_KEY) headers.authorization = `Bearer ${process.env.WAN_NIM_API_KEY}`;
  return headers;
}

export async function checkWanNimHealth(): Promise<string> {
  const baseUrl = (process.env.WAN_NIM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/v1/health/ready`, {
    headers: runtimeHeaders(),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Wan NIM health check returned ${response.status}`);
  return baseUrl;
}

export async function animateWithWanNim(input: WanAnimateInput): Promise<string> {
  const baseUrl = (process.env.WAN_NIM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const timeoutMs = Number(process.env.WAN_NIM_TIMEOUT_MS || '900000');
  const seed = input.seed ?? Number(process.env.WAN_NIM_SEED || '0');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('WAN_NIM_TIMEOUT_MS must be positive');
  if (!Number.isInteger(seed) || seed < 0) throw new Error('Wan seed must be a non-negative integer');
  if (!input.prompt.trim()) throw new Error('Wan animation prompt cannot be empty');

  const [image, video] = await Promise.all([readFile(input.imagePath), readFile(input.videoPath)]);
  const response = await fetch(`${baseUrl}/v1/infer`, {
    method: 'POST',
    headers: {
      ...runtimeHeaders(),
      accept: 'application/json',
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: process.env.WAN_NIM_MODEL || 'Wan2.2-Animate-2-14B',
      prompt: input.prompt.trim(),
      image: `data:${mimeFor(input.imagePath, 'image')};base64,${image.toString('base64')}`,
      video: `data:${mimeFor(input.videoPath, 'video')};base64,${video.toString('base64')}`,
      seed
    })
  });

  const body = (await response.json()) as WanResponse;
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(`Wan NIM returned ${response.status}: ${message || response.statusText}`);
  }
  const encoded = artifactBase64(body);
  if (!encoded) throw new Error('Wan NIM response did not contain a video artifact');

  const outputDir = path.resolve(process.env.WAN_OUTPUT_DIR || 'output/wan');
  const outputPath = input.outputPath
    ? path.resolve(input.outputPath)
    : path.join(outputDir, `wan-${Date.now()}.mp4`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(encoded, 'base64'));
  return outputPath;
}
