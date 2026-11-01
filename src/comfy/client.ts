import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ComfyUploadResult = {
  name: string;
  subfolder?: string;
  type?: string;
};

export type ComfyHistoryJob = {
  outputs?: Record<
    string,
    {
      images?: Array<{ filename: string; subfolder?: string; type?: string }>;
      gifs?: Array<{ filename: string; subfolder?: string; type?: string }>;
      videos?: Array<{ filename: string; subfolder?: string; type?: string }>;
      /** Wan SaveVideo often sets this when the mp4 is listed under images. */
      animated?: boolean;
    }
  >;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: Array<[string, Record<string, unknown>?] | unknown>;
  };
};

/** Pull a human-readable failure reason from Comfy /history. */
export function formatComfyJobError(promptId: string, job: ComfyHistoryJob | undefined): string {
  if (!job) {
    return `ComfyUI job ${promptId} failed (no history entry — check Queue / logs on the GPU host)`;
  }
  const status = job.status?.status_str || 'error';
  const messages = Array.isArray(job.status?.messages) ? job.status!.messages! : [];
  for (const entry of messages) {
    if (!Array.isArray(entry) || entry.length < 1) continue;
    const kind = String(entry[0] || '');
    const data = (entry[1] && typeof entry[1] === 'object' ? entry[1] : {}) as Record<string, unknown>;
    if (kind === 'execution_interrupted') {
      const node = data.node_type || data.node_id;
      return `ComfyUI interrupted${node ? ` at ${String(node)}` : ''} (prompt ${promptId}). Often Cancel / new job / OOM — check Comfy Queue.`;
    }
    if (kind === 'execution_error') {
      const exc = data.exception_message || data.exception_type || data.message;
      const node = data.node_type || data.node_id;
      const parts = [
        'ComfyUI execution error',
        node ? `node ${String(node)}` : null,
        exc ? String(exc) : null,
        `(prompt ${promptId})`
      ].filter(Boolean);
      return parts.join(' · ');
    }
  }
  // Success in history but we still failed locally (e.g. couldn't pick/download output).
  if (status === 'success' || job.status?.completed) {
    const outKeys = Object.keys(job.outputs || {});
    return `ComfyUI finished (${status}) but no usable video output was found (nodes: ${outKeys.join(', ') || 'none'}; prompt ${promptId})`;
  }
  return `ComfyUI ${status}: prompt ${promptId}`;
}

/**
 * Minimal ComfyUI HTTP client: upload → queue → poll history → download.
 * Talks to a local tunnel (e.g. http://127.0.0.1:8188) or direct host.
 */
export class ComfyClient {
  constructor(private readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async health(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        // Some builds expose / only; treat 200 on root as healthy enough.
        const root = await fetch(`${this.baseUrl}/`, { signal: AbortSignal.timeout(10_000) });
        if (!root.ok) throw new Error(`ComfyUI health failed: ${response.status}`);
      }
      return this.baseUrl;
    } catch (error) {
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.message
            : String(error);
      if (/empty reply|ECONNRESET|socket hang up|other side closed/i.test(cause)) {
        throw new Error(
          `Tunnel open but ComfyUI not answering at ${this.baseUrl} (${cause}). Start Comfy on the GPU box on the remote forwarded port.`
        );
      }
      if (/ECONNREFUSED|fetch failed/i.test(cause) || /fetch failed/i.test(String(error))) {
        throw new Error(`ComfyUI unreachable at ${this.baseUrl} (${cause})`);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async uploadImage(filePath: string): Promise<ComfyUploadResult> {
    const absolute = path.resolve(filePath);
    const form = new FormData();
    // Node 18+ FormData accepts Blob; File gives Comfy a filename.
    const bytes = await import('node:fs/promises').then((fs) => fs.readFile(absolute));
    form.append('image', new File([bytes], path.basename(absolute)));
    form.append('overwrite', 'true');

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) {
      throw new Error(`ComfyUI upload failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
    }
    const body = (await response.json()) as ComfyUploadResult;
    if (!body.name) throw new Error('ComfyUI upload returned no filename');
    return body;
  }

  async queuePrompt(
    prompt: Record<string, unknown>,
    clientId = randomUUID()
  ): Promise<{ prompt_id: string; client_id: string }> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: clientId }),
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) {
      throw new Error(`ComfyUI queue failed (${response.status}): ${(await response.text()).slice(0, 600)}`);
    }
    const body = (await response.json()) as { prompt_id?: string };
    if (!body.prompt_id) throw new Error('ComfyUI queue response missing prompt_id');
    return { prompt_id: body.prompt_id, client_id: clientId };
  }

  async getHistory(promptId: string): Promise<Record<string, ComfyHistoryJob>> {
    const response = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`, {
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      throw new Error(`ComfyUI history failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
    }
    return (await response.json()) as Record<string, ComfyHistoryJob>;
  }

  /**
   * Wait for a queued prompt. Uses Comfy WebSocket progress when available
   * (percent of current sampler), falling back to history polling.
   */
  async waitForCompletion(
    promptId: string,
    options: {
      timeoutMs?: number;
      clientId?: string;
      signal?: AbortSignal;
      onProgress?: (progress: { percent: number; value: number; max: number; label: string }) => void | Promise<void>;
    } = {}
  ): Promise<ComfyHistoryJob> {
    const timeoutMs = options.timeoutMs ?? Number(process.env.WAN_COMFY_TIMEOUT_MS || '1800000');
    const started = Date.now();
    let lastPercent = -1;

    const report = async (value: number, max: number, label: string) => {
      if (!options.onProgress || !(max > 0)) return;
      const percent = Math.max(0, Math.min(99, Math.round((value / max) * 100)));
      if (percent === lastPercent) return;
      lastPercent = percent;
      await options.onProgress({ percent, value, max, label });
    };

    const stopWs = this.watchProgress(options.clientId, promptId, (value, max) => {
      void report(value, max, `${value}/${max}`);
    });

    try {
      while (Date.now() - started < timeoutMs) {
        if (options.signal?.aborted) {
          throw new Error('Cancelled');
        }
        const history = await this.getHistory(promptId);
        const job = history[promptId];
        if (job?.status?.status_str === 'error' || job?.status?.status_str === 'interrupted') {
          throw new Error(formatComfyJobError(promptId, job));
        }
        if (job?.status?.completed && job.outputs) {
          await options.onProgress?.({ percent: 100, value: 1, max: 1, label: 'done' });
          return job;
        }
        // Completed flag without outputs still counts as failure.
        if (job?.status?.completed && !job.outputs) {
          throw new Error(
            formatComfyJobError(promptId, job) + ' — finished with no video/image outputs'
          );
        }
        // Time-based soft estimate when WS progress is quiet (upload / load phase).
        if (lastPercent < 0) {
          const soft = Math.min(8, Math.floor((Date.now() - started) / 15_000));
          await report(soft, 100, 'starting…');
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error(`Timed out waiting for ComfyUI prompt ${promptId}`);
    } finally {
      stopWs();
    }
  }

  /** Subscribe to Comfy `/ws` progress for one prompt. Returns cleanup. */
  private watchProgress(
    clientId: string | undefined,
    promptId: string,
    onTick: (value: number, max: number) => void
  ): () => void {
    if (!clientId || typeof WebSocket === 'undefined') return () => undefined;
    const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.addEventListener('message', (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) return;
          const msg = JSON.parse(raw) as {
            type?: string;
            data?: {
              value?: number;
              max?: number;
              prompt_id?: string;
              node?: string;
              exception_message?: string;
            };
          };
          if (msg.type === 'progress') {
            if (msg.data?.prompt_id && msg.data.prompt_id !== promptId) return;
            const value = Number(msg.data?.value);
            const max = Number(msg.data?.max);
            if (Number.isFinite(value) && Number.isFinite(max) && max > 0) onTick(value, max);
            return;
          }
          // execution_error is also delivered on the socket — surface via progress label path later
        } catch {
          // ignore malformed frames
        }
      });
    } catch {
      return () => undefined;
    }
    return () => {
      try {
        socket?.close();
      } catch {
        // ignore
      }
    };
  }

  async downloadView(options: {
    filename: string;
    subfolder?: string;
    type?: string;
    destPath: string;
  }): Promise<string> {
    const query = new URLSearchParams({
      filename: options.filename,
      subfolder: options.subfolder || '',
      type: options.type || 'output'
    });
    const response = await fetch(`${this.baseUrl}/view?${query}`, {
      signal: AbortSignal.timeout(300_000)
    });
    if (!response.ok) {
      throw new Error(`ComfyUI download failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
    }
    const dest = path.resolve(options.destPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await response.arrayBuffer()));
    return dest;
  }

  /** Stop the currently executing prompt on ComfyUI. */
  async interrupt(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      throw new Error(`ComfyUI interrupt failed (${response.status})`);
    }
  }

  /** Drop pending queue items (does not always stop the active job — call interrupt too). */
  async clearQueue(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clear: true }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      throw new Error(`ComfyUI clear queue failed (${response.status})`);
    }
  }
}

/** Prefer video/gif outputs, then mp4/webm listed under images (Wan SaveVideo does this). */
export function pickComfyMediaFile(
  job: ComfyHistoryJob
): { filename: string; subfolder?: string; type?: string } | null {
  for (const output of Object.values(job.outputs || {})) {
    const file = output.videos?.[0] || output.gifs?.[0];
    if (file?.filename) return file;
  }
  for (const output of Object.values(job.outputs || {})) {
    const images = output.images || [];
    const animated = images.find((img) => /\.(mp4|webm|mov|mkv|gif|webp)$/i.test(img.filename || ''));
    if (animated?.filename) return animated;
    if (output.animated && images[0]?.filename) {
      return images[0];
    }
  }
  return null;
}
