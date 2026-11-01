import { z } from 'zod';

const queueUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === 'https://queue.fal.run' && !url.username && !url.password;
}, 'Queue URLs must belong to queue.fal.run');
export const ReceiptSchema = z.object({ request_id: z.string().min(1), status_url: queueUrl, response_url: queueUrl });
export type Receipt = z.infer<typeof ReceiptSchema>;
export type VideoProvider = {
  submit(endpoint: string, input: Record<string, unknown>): Promise<Receipt>;
  result(receipt: Receipt): Promise<string>;
  download(url: string): Promise<Buffer>;
};
/** Queue reads may retry; submissions never retry automatically because acceptance can be ambiguous. */
export class FalVideoProvider implements VideoProvider {
  constructor(private readonly key: string, private readonly fetcher: typeof fetch = fetch,
    private readonly pause: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
    private readonly timeoutMs = 30 * 60_000) {
    if (!key.trim()) throw new Error('Set FAL_KEY in the local .env before running fal experiments.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid fal timeout');
  }
  private async json(url: string, input?: Record<string, unknown>): Promise<unknown> {
    // Never send the API key to a CDN or an arbitrary URL from a manifest.
    queueUrl.parse(url);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, { method: input ? 'POST' : 'GET', redirect: 'error',
          headers: { Authorization: `Key ${this.key}`, 'Content-Type': 'application/json' },
          ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(60_000) });
      } catch {
        if (input || attempt >= 2) throw new Error(input ? 'fal submission response lost; acceptance is unknown. Do not resubmit without checking the fal dashboard.' : 'fal queue network error; resume this run.');
        await this.pause(1000 * (attempt + 1)); continue;
      }
      if (response.ok) return response.json();
      if (!input && attempt < 2 && (response.status === 429 || response.status >= 500)) {
        await this.pause(1000 * (attempt + 1)); continue;
      }
      // Avoid reflecting request bodies, credentials or base64 images from provider errors.
      throw new Error(`fal ${input ? 'submission' : 'queue'} HTTP ${response.status}; inspect the fal dashboard for details.`);
    }
  }
  async submit(endpoint: string, input: Record<string, unknown>): Promise<Receipt> {
    return ReceiptSchema.parse(await this.json(`https://queue.fal.run/${endpoint}`, input));
  }
  async result(receipt: Receipt): Promise<string> {
    ReceiptSchema.parse(receipt);
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const status = z.object({ status: z.enum(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED']), error: z.unknown().optional() })
        .parse(await this.json(receipt.status_url));
      if (status.status === 'COMPLETED') {
        if (status.error) throw new Error(`fal generation failed for request ${receipt.request_id}; inspect the dashboard.`);
        const result = z.object({ video: z.object({ url: z.string().url() }) }).parse(await this.json(receipt.response_url));
        return result.video.url;
      }
      await this.pause(5000);
    }
    throw new Error(`fal wait timed out for ${receipt.request_id}; resume the same run to keep waiting.`);
  }
  async download(url: string): Promise<Buffer> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Expected HTTPS video result');
    // No Authorization header on media downloads.
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`fal media download HTTP ${response.status}; resume to retry the same result.`);
    return Buffer.from(await response.arrayBuffer());
  }
}
