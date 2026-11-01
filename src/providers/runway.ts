/**
 * Runway image-to-video (hosted API) — the no-GPU alternative to Wan/ComfyUI.
 * Docs: https://docs.dev.runwayml.com  ·  Pricing: https://docs.dev.runwayml.com/guides/pricing
 *
 * Env:
 *   RUNWAY_API_KEY          required (dev portal → API keys)
 *   RUNWAY_VIDEO_MODEL      default gen4_turbo (cheapest image-to-video; see CREDITS_PER_SECOND)
 *   RUNWAY_RATIO            default 720:1280 (9:16). Must be valid for the chosen model.
 *   RUNWAY_DURATIONS        comma list of allowed clip lengths, e.g. "5,10" (default: any 2–10s for gen4_turbo, else 5,10)
 *   RUNWAY_POLL_MS / RUNWAY_TIMEOUT_MS   default 5000 / 600000
 *   RUNWAY_API_VERSION      X-Runway-Version header, default 2024-11-06
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BASE_URL = 'https://api.dev.runwayml.com/v1';
const USD_PER_CREDIT = 0.01;
const MAX_PROMPT_CHARS = 1000;
/** Runway rejects very large data URIs; stay well under the limit. */
const MAX_IMAGE_BYTES = 3_500_000;

/** Credits per second of output, from the official pricing page. Unlisted models: no estimate. */
const CREDITS_PER_SECOND: Record<string, number> = {
  gen4_turbo: 5,
  'gen4.5': 12,
  'veo3.1_fast': 10,
  'veo3.1': 20,
  'kling2.5_turbo_pro': 12,
  wan3: 10,
  gemini_omni_flash: 10
};

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function runwayModel(): string {
  return trimEnv('RUNWAY_VIDEO_MODEL') || 'gen4_turbo';
}

export function runwayConfigured(): boolean {
  return Boolean(trimEnv('RUNWAY_API_KEY'));
}

/** USD for one clip, or undefined when the model's price is not in our table. */
export function estimateRunwayCostUsd(seconds: number, model = runwayModel()): number | undefined {
  const rate = CREDITS_PER_SECOND[model.toLowerCase()];
  return rate === undefined ? undefined : Math.round(rate * seconds * USD_PER_CREDIT * 100) / 100;
}

/** Clip length to request: narration length rounded up, snapped to what the model allows. */
export function runwayClipSeconds(narrationSeconds: number, model = runwayModel()): number {
  const needed = Math.max(1, Math.ceil(narrationSeconds));
  const configured = trimEnv('RUNWAY_DURATIONS');
  if (configured || model.toLowerCase() !== 'gen4_turbo') {
    const allowed = (configured || '5,10')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((a, b) => a - b);
    return allowed.find((value) => value >= needed) ?? allowed[allowed.length - 1] ?? 5;
  }
  return Math.min(10, Math.max(2, needed));
}

function headers(): Record<string, string> {
  const key = trimEnv('RUNWAY_API_KEY');
  if (!key) throw new Error('RUNWAY_API_KEY is not set (create one at https://dev.runwayml.com)');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': trimEnv('RUNWAY_API_VERSION') || '2024-11-06'
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Cancelled'));
      },
      { once: true }
    );
  });
}

async function apiError(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    detail = body.error || body.message || '';
  } catch {
    // non-JSON body
  }
  if (response.status === 401) return 'Runway rejected the API key (401). Check RUNWAY_API_KEY.';
  if (response.status === 402 || /credit/i.test(detail)) {
    return `Runway account is out of credits. Add credits at https://dev.runwayml.com. ${detail}`.trim();
  }
  return `Runway ${response.status}: ${detail || response.statusText}`;
}

/** Stills are re-encoded to a JPEG data URI small enough for the API. */
async function imageDataUri(imagePath: string): Promise<string> {
  let quality = 90;
  let side = 1920;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const buffer = await sharp(imagePath)
      .rotate()
      .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (buffer.length <= MAX_IMAGE_BYTES) return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    quality = Math.max(60, quality - 10);
    side = Math.round(side * 0.85);
  }
  throw new Error(`Could not shrink ${path.basename(imagePath)} under ${MAX_IMAGE_BYTES} bytes for Runway`);
}

type RunwayTask = {
  id: string;
  status: 'PENDING' | 'THROTTLED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | string;
  output?: string[];
  failure?: string;
  progress?: number;
};

async function startTask(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const init: RequestInit = { method: 'POST', headers: headers(), body: JSON.stringify(body) };
    if (signal) init.signal = signal;
    const response = await fetch(`${BASE_URL}/image_to_video`, init);
    if (response.ok) return ((await response.json()) as { id: string }).id;
    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt >= 3) throw new Error(await apiError(response));
    await sleep(3000 * 2 ** attempt, signal);
  }
}

async function fetchTask(id: string, signal?: AbortSignal): Promise<RunwayTask> {
  const init: RequestInit = { headers: headers() };
  if (signal) init.signal = signal;
  const response = await fetch(`${BASE_URL}/tasks/${id}`, init);
  if (!response.ok) throw new Error(await apiError(response));
  return (await response.json()) as RunwayTask;
}

async function cancelTask(id: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/tasks/${id}`, { method: 'DELETE', headers: headers() });
  } catch {
    // best effort — the task also expires on Runway's side
  }
}

/** Credit balance for the Desk status line; throws on a bad key. */
export async function checkRunwayHealth(): Promise<{ creditBalance?: number; message: string }> {
  const response = await fetch(`${BASE_URL}/organization`, { headers: headers() });
  if (response.status === 401) throw new Error(await apiError(response));
  if (!response.ok) {
    // Key is accepted but the account endpoint is unavailable — generation can still work.
    return { message: `Runway reachable (account info unavailable: ${response.status})` };
  }
  const info = (await response.json()) as { creditBalance?: number };
  return {
    ...(typeof info.creditBalance === 'number' ? { creditBalance: info.creditBalance } : {}),
    message:
      typeof info.creditBalance === 'number'
        ? `Runway OK · ${info.creditBalance} credits · model ${runwayModel()}`
        : `Runway OK · model ${runwayModel()}`
  };
}

export type RunwayClipOptions = {
  imagePath: string;
  prompt: string;
  outputPath: string;
  /** Narration length; rounded up and snapped to the model's allowed durations. */
  durationSeconds?: number;
  onProgress?: (progress: { percent: number; label: string }) => void | Promise<void>;
  onQueued?: (info: { taskId: string }) => void | Promise<void>;
  signal?: AbortSignal;
};

export async function generateRunwayClip(options: RunwayClipOptions): Promise<string> {
  const model = runwayModel();
  const seconds = runwayClipSeconds(options.durationSeconds ?? 5, model);
  const cost = estimateRunwayCostUsd(seconds, model);
  console.log(
    `Runway ${model}: ${seconds}s clip from ${path.basename(options.imagePath)}${
      cost !== undefined ? ` · ≈$${cost.toFixed(2)}` : ''
    }`
  );

  const taskId = await startTask(
    {
      model,
      promptImage: await imageDataUri(options.imagePath),
      promptText: options.prompt.trim().slice(0, MAX_PROMPT_CHARS),
      ratio: trimEnv('RUNWAY_RATIO') || '720:1280',
      duration: seconds
    },
    options.signal
  );
  await options.onQueued?.({ taskId });

  const pollMs = Number(trimEnv('RUNWAY_POLL_MS')) || 5000;
  const timeoutMs = Number(trimEnv('RUNWAY_TIMEOUT_MS')) || 600_000;
  const started = Date.now();

  try {
    for (;;) {
      if (options.signal?.aborted) throw new Error('Cancelled');
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Runway task ${taskId} timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      const task = await fetchTask(taskId, options.signal);
      if (task.status === 'SUCCEEDED') {
        const url = task.output?.[0];
        if (!url) throw new Error(`Runway task ${taskId} succeeded without an output URL`);
        return await download(url, options.outputPath);
      }
      if (task.status === 'FAILED' || task.status === 'CANCELLED') {
        throw new Error(`Runway task ${task.status.toLowerCase()}: ${task.failure || 'no reason given'}`);
      }
      const percent =
        typeof task.progress === 'number'
          ? Math.round(Math.min(0.99, Math.max(0, task.progress)) * 100)
          : Math.min(95, Math.round(((Date.now() - started) / 90_000) * 100));
      await options.onProgress?.({
        percent,
        label: task.status === 'THROTTLED' ? 'queued at Runway' : task.status.toLowerCase()
      });
      await sleep(pollMs, options.signal);
    }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.message === 'Cancelled')) {
      await cancelTask(taskId);
    }
    throw error;
  }
}

async function download(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Runway output download failed (${response.status})`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
  await rename(temporary, outputPath);
  return outputPath;
}
