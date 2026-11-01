import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ComfyClient, pickComfyMediaFile } from '../comfy/client.js';
import { assertWan22VideoWorkflow } from '../lib/wanWorkflow.js';
import {
  resolveWanQualityMode,
  type WanQualityMode
} from '../lib/wanQualityMode.js';

export type WanComfyGenerateInput = {
  imagePath: string;
  prompt: string;
  outputPath: string;
  width?: number;
  height?: number;
  /**
   * Optional legacy frame count for heuristic workflows.
   * The EpicAstra Wan2.2 API export derives frames as floor(duration * fps + 1).
   */
  frames?: number;
  /** Clip length in seconds → node 129:161 (Float Duration). */
  durationSeconds?: number;
  fps?: number;
  negativePrompt?: string;
  seed?: number;
  /** Optional SaveVideo filename_prefix override. */
  filenamePrefix?: string;
  /**
   * quality = 20-step baseline; fast = LightX2V 4-step LoRA (PrimitiveBoolean 129:131).
   */
  qualityMode?: WanQualityMode;
  onProgress?: (progress: {
    percent: number;
    value: number;
    max: number;
    label: string;
  }) => void | Promise<void>;
  /** Fired right after Comfy accepts the prompt (use to show job id in UI). */
  onQueued?: (info: { promptId: string; clientId: string }) => void | Promise<void>;
  signal?: AbortSignal;
};

type ComfyNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

type ComfyWorkflow = Record<string, ComfyNode>;

/**
 * Exact node IDs from the working Wan2.2 I2V API export
 * (`workflows/wan/wan22-i2v-a14b-api.json`).
 * Frame length is NOT patched — node 129:163 computes floor(duration * fps + 1).
 */
export const WAN22_I2V_NODE_MAP = {
  loadImage: '97',
  positive: '129:93',
  negative: '129:89',
  wanI2V: '129:98',
  seedPrimary: '129:86',
  /** Second KSampler in the dual-pass graph — keep seed in sync. */
  seedSecondary: '129:85',
  duration: '129:161',
  fps: '129:162',
  saveVideo: '108',
  /** PrimitiveBoolean — Enable 4steps LoRA? (LightX2V). */
  lightx2vEnable: '129:131'
} as const;

function workflowPath(): string {
  return path.resolve(
    process.env.WAN_COMFY_WORKFLOW || 'workflows/wan/wan22-i2v-a14b-api.json'
  );
}

function comfyBaseUrl(): string {
  const localPort = (process.env.WAN_COMFY_LOCAL_PORT || '8080').trim() || '8080';
  return (
    process.env.WAN_COMFY_URL ||
    process.env.COMFYUI_URL ||
    `http://127.0.0.1:${localPort}`
  ).replace(/\/$/, '');
}

function findNode(
  workflow: ComfyWorkflow,
  match: (id: string, node: ComfyNode) => boolean
): [string, ComfyNode] | undefined {
  return Object.entries(workflow).find(([id, node]) => match(id, node)) as
    | [string, ComfyNode]
    | undefined;
}

function titleOf(node: ComfyNode): string {
  return (node._meta?.title || '').toLowerCase();
}

function classOf(node: ComfyNode): string {
  return (node.class_type || '').toLowerCase();
}

function requireNode(workflow: ComfyWorkflow, id: string, label: string): ComfyNode {
  const node = workflow[id];
  if (!node) throw new Error(`Workflow missing ${label} node id "${id}"`);
  if (!node.inputs) node.inputs = {};
  return node;
}

function usesEpicAstraWan22Map(workflow: ComfyWorkflow): boolean {
  return Boolean(
    workflow[WAN22_I2V_NODE_MAP.loadImage] &&
      workflow[WAN22_I2V_NODE_MAP.positive] &&
      workflow[WAN22_I2V_NODE_MAP.wanI2V]
  );
}

/**
 * Patch the known EpicAstra Wan2.2 I2V API export by exact node IDs.
 * Does not touch model loaders (CLIP/VAE/UNET) or sampler architecture.
 */
export function patchEpicAstraWan22Workflow(
  workflow: ComfyWorkflow,
  options: {
    imageName: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    durationSeconds: number;
    fps: number;
    seed: number;
    filenamePrefix?: string;
    qualityMode?: WanQualityMode;
  }
): void {
  const load = requireNode(workflow, WAN22_I2V_NODE_MAP.loadImage, 'Load Image');
  load.inputs!.image = options.imageName;

  const positive = requireNode(workflow, WAN22_I2V_NODE_MAP.positive, 'Positive prompt');
  positive.inputs!.text = options.prompt;

  const negative = requireNode(workflow, WAN22_I2V_NODE_MAP.negative, 'Negative prompt');
  negative.inputs!.text = options.negativePrompt;

  const wan = requireNode(workflow, WAN22_I2V_NODE_MAP.wanI2V, 'WanImageToVideo');
  // Replace manual-test leftovers (e.g. 804.0625×880) with configured Short size.
  wan.inputs!.width = Math.round(options.width);
  wan.inputs!.height = Math.round(options.height);
  // Keep length as the linked expression node (duration × fps + 1). Never overwrite with a number.

  const seedPrimary = requireNode(workflow, WAN22_I2V_NODE_MAP.seedPrimary, 'KSampler seed');
  seedPrimary.inputs!.noise_seed = options.seed;
  const seedSecondary = workflow[WAN22_I2V_NODE_MAP.seedSecondary];
  if (seedSecondary?.inputs) {
    seedSecondary.inputs.noise_seed = options.seed;
  }

  const duration = requireNode(workflow, WAN22_I2V_NODE_MAP.duration, 'Duration');
  duration.inputs!.value = options.durationSeconds;

  const fps = requireNode(workflow, WAN22_I2V_NODE_MAP.fps, 'FPS');
  fps.inputs!.value = options.fps;

  const qualityMode = resolveWanQualityMode(options.qualityMode);
  const lightx2v = workflow[WAN22_I2V_NODE_MAP.lightx2vEnable];
  if (lightx2v?.inputs) {
    // true → LightX2V 4-step LoRA path; false → 20-step baseline.
    lightx2v.inputs.value = qualityMode === 'fast';
  }

  if (options.filenamePrefix) {
    const save = requireNode(workflow, WAN22_I2V_NODE_MAP.saveVideo, 'Save Video');
    save.inputs!.filename_prefix = options.filenamePrefix;
  }
}

/** Legacy heuristic patcher for older/simple I2V graphs (tests + alternate exports). */
export function patchWorkflowHeuristic(
  workflow: ComfyWorkflow,
  options: {
    imageName: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    frames: number;
    seed: number;
  }
): void {
  const loadImage =
    findNode(workflow, (_, n) => classOf(n) === 'loadimage') ||
    findNode(workflow, (_, n) => titleOf(n).includes('load image'));
  if (!loadImage) {
    throw new Error('Workflow missing Load Image node (class_type LoadImage)');
  }
  if (!loadImage[1].inputs) loadImage[1].inputs = {};
  loadImage[1].inputs.image = options.imageName;

  const positive =
    findNode(
      workflow,
      (_, n) =>
        classOf(n).includes('cliptextencode') &&
        (titleOf(n).includes('positive') || titleOf(n).includes('prompt'))
    ) || findNode(workflow, (_, n) => classOf(n).includes('cliptextencode'));
  if (positive) {
    if (!positive[1].inputs) positive[1].inputs = {};
    if ('text' in positive[1].inputs) positive[1].inputs.text = options.prompt;
    else if ('prompt' in positive[1].inputs) positive[1].inputs.prompt = options.prompt;
  }

  const negative = findNode(
    workflow,
    (_, n) => classOf(n).includes('cliptextencode') && titleOf(n).includes('negative')
  );
  if (negative) {
    if (!negative[1].inputs) negative[1].inputs = {};
    if ('text' in negative[1].inputs) negative[1].inputs.text = options.negativePrompt;
    else if ('prompt' in negative[1].inputs) negative[1].inputs.prompt = options.negativePrompt;
  }

  const wan =
    findNode(
      workflow,
      (_, n) =>
        classOf(n).includes('wanimagetovideo') || titleOf(n).includes('image to video')
    ) || findNode(workflow, (_, n) => classOf(n).includes('imagetovideo'));

  if (wan) {
    if (!wan[1].inputs) wan[1].inputs = {};
    wan[1].inputs.width = options.width;
    wan[1].inputs.height = options.height;
    // Only set length when it is a plain number (not a Comfy link array).
    if (typeof wan[1].inputs.length === 'number' || wan[1].inputs.length === undefined) {
      wan[1].inputs.length = options.frames;
    }
    for (const key of ['seed', 'noise_seed'] as const) {
      if (key in wan[1].inputs) wan[1].inputs[key] = options.seed;
    }
  }

  for (const [, node] of Object.entries(workflow)) {
    if (!node.inputs) continue;
    if (classOf(node).includes('createvideo') || classOf(node).includes('videocombine')) {
      if (typeof node.inputs.fps === 'number') node.inputs.fps = 16;
    }
    if (classOf(node).includes('emptylatent') || classOf(node).includes('emptyhunyuan')) {
      if ('width' in node.inputs) node.inputs.width = options.width;
      if ('height' in node.inputs) node.inputs.height = options.height;
      if (typeof node.inputs.length === 'number') node.inputs.length = options.frames;
    }
    if ('seed' in node.inputs) node.inputs.seed = options.seed;
    if ('noise_seed' in node.inputs) node.inputs.noise_seed = options.seed;
  }

  if (!positive && !wan) {
    throw new Error(
      'Could not find a prompt / Wan node to patch. Check _meta.title / class_type in the API JSON.'
    );
  }
}

export function patchWorkflow(
  workflow: ComfyWorkflow,
  options: {
    imageName: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    frames?: number;
    durationSeconds?: number;
    fps?: number;
    seed: number;
    filenamePrefix?: string;
    qualityMode?: WanQualityMode;
  }
): void {
  if (usesEpicAstraWan22Map(workflow)) {
    const durationSeconds =
      options.durationSeconds ??
      (options.frames && options.fps ? options.frames / options.fps : 5);
    const fps = options.fps ?? 16;
    patchEpicAstraWan22Workflow(workflow, {
      imageName: options.imageName,
      prompt: options.prompt,
      negativePrompt: options.negativePrompt,
      width: options.width,
      height: options.height,
      durationSeconds,
      fps,
      seed: options.seed,
      ...(options.filenamePrefix ? { filenamePrefix: options.filenamePrefix } : {}),
      ...(options.qualityMode ? { qualityMode: options.qualityMode } : {})
    });
    return;
  }

  patchWorkflowHeuristic(workflow, {
    imageName: options.imageName,
    prompt: options.prompt,
    negativePrompt: options.negativePrompt,
    width: options.width,
    height: options.height,
    frames: options.frames ?? 49,
    seed: options.seed
  });
}

async function loadWorkflow(): Promise<ComfyWorkflow> {
  const file = workflowPath();
  try {
    await access(file);
  } catch {
    throw new Error(
      [
        `Missing Comfy API workflow: ${file}`,
        'In ComfyUI: open Wan 2.2 14B Image-to-Video → Save (API format)',
        'Save as workflows/wan/wan22-i2v-a14b-api.json'
      ].join('\n')
    );
  }
  const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
  let workflow: ComfyWorkflow;
  if (raw && typeof raw === 'object' && 'prompt' in (raw as object)) {
    workflow = (raw as { prompt: ComfyWorkflow }).prompt;
  } else {
    workflow = raw as ComfyWorkflow;
  }
  if (!workflow || typeof workflow !== 'object' || Object.keys(workflow).length === 0) {
    throw new Error(
      [
        `Workflow file is empty/placeholder: ${file}`,
        'Replace it with ComfyUI → Save (API Format) for Wan 2.2 14B I2V.'
      ].join('\n')
    );
  }
  return structuredClone(workflow);
}

export async function checkWanComfyHealth(): Promise<string> {
  const baseUrl = comfyBaseUrl();
  const client = new ComfyClient(baseUrl);
  return client.health();
}

/** Image → video via remote ComfyUI Wan 2.2 I2V workflow (no driving video). */
export async function generateWanComfyClip(input: WanComfyGenerateInput): Promise<string> {
  const baseUrl = comfyBaseUrl();
  const width = input.width ?? Number(process.env.WAN_COMFY_WIDTH || process.env.WAN_WIDTH || '704');
  const height =
    input.height ?? Number(process.env.WAN_COMFY_HEIGHT || process.env.WAN_HEIGHT || '1280');
  const fps = input.fps ?? Number(process.env.WAN_COMFY_FPS || '16');
  const durationSeconds =
    input.durationSeconds ??
    Number(process.env.WAN_COMFY_DURATION_SECONDS || '5');
  const seed = input.seed ?? Number(process.env.WAN_COMFY_SEED || `${Date.now() % 1_000_000}`);
  const negativePrompt =
    input.negativePrompt ||
    process.env.WAN_COMFY_NEGATIVE ||
    'text, subtitles, logo, watermark, extra limbs, deformed, blurry';

  if (!input.prompt.trim()) throw new Error('Wan Comfy prompt cannot be empty');
  if (!Number.isFinite(width) || width < 64) throw new Error('Invalid Wan Comfy width');
  if (!Number.isFinite(height) || height < 64) throw new Error('Invalid Wan Comfy height');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Invalid Wan durationSeconds');
  }
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Invalid Wan fps');

  const client = new ComfyClient(baseUrl);
  await client.health();
  await assertWan22VideoWorkflow();

  if (input.signal?.aborted) throw new Error('Cancelled');

  const workflow = await loadWorkflow();
  const uploaded = await client.uploadImage(input.imagePath);
  const derivedFrames = Math.floor(durationSeconds * fps + 1);
  patchWorkflow(workflow, {
    imageName: uploaded.name,
    prompt: input.prompt.trim(),
    negativePrompt,
    width: Math.round(width),
    height: Math.round(height),
    durationSeconds,
    fps,
    frames: input.frames ?? derivedFrames,
    seed,
    qualityMode: resolveWanQualityMode(input.qualityMode),
    ...(input.filenamePrefix
      ? { filenamePrefix: input.filenamePrefix }
      : {
          filenamePrefix: `epicastra/wan_s${Date.now().toString(36)}`
        })
  });

  const qualityMode = resolveWanQualityMode(input.qualityMode);
  console.log(
    `ComfyUI queue → ${baseUrl} (${Math.round(width)}x${Math.round(height)}, duration=${durationSeconds}s @ ${fps}fps ≈ ${derivedFrames} frames, mode=${qualityMode}) [Wan 2.2 I2V video]`
  );
  const { prompt_id, client_id } = await client.queuePrompt(workflow);
  console.log(`ComfyUI prompt_id=${prompt_id}`);
  await input.onQueued?.({ promptId: prompt_id, clientId: client_id });
  const job = await client.waitForCompletion(prompt_id, {
    clientId: client_id,
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  });
  const file = pickComfyMediaFile(job);
  if (!file) {
    throw new Error(
      `ComfyUI finished but no video/gif/image output was found. Inspect /history/${prompt_id}`
    );
  }

  return client.downloadView({
    filename: file.filename,
    subfolder: file.subfolder || '',
    type: file.type || 'output',
    destPath: input.outputPath
  });
}
