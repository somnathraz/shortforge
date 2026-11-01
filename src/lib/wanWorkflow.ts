import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type WanWorkflowInfo = {
  path: string;
  kind: 'video' | 'unknown';
  family: 'wan2.2' | 'wan2.1' | 'unknown';
  ok: boolean;
  models: string[];
  savePrefix?: string;
  error?: string;
};

type ComfyNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

function workflowFile(): string {
  return path.resolve(process.env.WAN_COMFY_WORKFLOW || 'workflows/wan/wan22-i2v-a14b-api.json');
}

/**
 * Inspect the API workflow EpicAstra will queue.
 * We require Wan 2.2 I2V (video), not the Wan 2.1 template graph.
 */
export async function inspectWanWorkflow(file = workflowFile()): Promise<WanWorkflowInfo> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
    const workflow =
      raw && typeof raw === 'object' && 'prompt' in (raw as object)
        ? ((raw as { prompt: Record<string, ComfyNode> }).prompt)
        : (raw as Record<string, ComfyNode>);

    const models: string[] = [];
    let savePrefix: string | undefined;
    let hasWanI2V = false;
    let hasSaveVideo = false;

    for (const node of Object.values(workflow || {})) {
      const ct = (node.class_type || '').toLowerCase();
      if (ct === 'wanimagetovideo') hasWanI2V = true;
      if (ct === 'savevideo' || ct === 'createvideo') hasSaveVideo = true;
      const inputs = node.inputs || {};
      for (const [key, value] of Object.entries(inputs)) {
        if (typeof value !== 'string') continue;
        if (
          key.includes('unet') ||
          key.includes('lora') ||
          key.includes('clip') ||
          key.includes('vae') ||
          value.endsWith('.safetensors')
        ) {
          if (/wan|umt5|vae/i.test(value)) models.push(value);
        }
        if (key === 'filename_prefix') savePrefix = value;
      }
    }

    const joined = models.join(' ').toLowerCase();
    const family: WanWorkflowInfo['family'] = joined.includes('wan2.2')
      ? 'wan2.2'
      : joined.includes('wan2.1')
        ? 'wan2.1'
        : 'unknown';
    const kind: WanWorkflowInfo['kind'] = hasWanI2V || hasSaveVideo ? 'video' : 'unknown';
    const ok = family === 'wan2.2' && kind === 'video' && hasWanI2V;

    return {
      path: file,
      kind,
      family,
      ok,
      models: [...new Set(models)],
      ...(savePrefix ? { savePrefix } : {}),
      ...(!ok
        ? {
            error:
              family !== 'wan2.2'
                ? `Expected Wan 2.2 I2V workflow, found ${family}. Set WAN_COMFY_WORKFLOW to wan22-i2v-a14b-api.json`
                : 'Workflow missing WanImageToVideo / SaveVideo nodes'
          }
        : {})
    };
  } catch (error) {
    return {
      path: file,
      kind: 'unknown',
      family: 'unknown',
      ok: false,
      models: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function assertWan22VideoWorkflow(): Promise<WanWorkflowInfo> {
  const info = await inspectWanWorkflow();
  if (!info.ok) {
    throw new Error(info.error || 'Wan 2.2 I2V workflow required');
  }
  return info;
}
