import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ProductionPublishResult } from './productionCost.js';

/** Rebuild the durable publish ledger from timestamped publish reports. */
export async function loadPublishLedger(episodeId: string): Promise<ProductionPublishResult[]> {
  const dir = path.join(path.resolve(process.env.PUBLISH_DIR || 'output/publish'), episodeId);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => /^publish-\d+\.json$/.test(file)).sort();
  } catch {
    return [];
  }

  const results: ProductionPublishResult[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    try {
      const report = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as {
        publishedAt?: string;
        videoPath?: string;
        results?: ProductionPublishResult[];
      };
      for (const item of report.results || []) {
        const key = JSON.stringify([
          item.platform,
          item.status,
          item.id || '',
          item.url || '',
          item.scheduleId || '',
          item.scheduledAt || '',
          item.error || '',
          item.videoPath || report.videoPath || ''
        ]);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          ...item,
          ...(item.recordedAt || report.publishedAt
            ? { recordedAt: item.recordedAt || report.publishedAt }
            : {}),
          ...(item.videoPath || report.videoPath
            ? { videoPath: item.videoPath || report.videoPath }
            : {})
        });
      }
    } catch {
      // A damaged historical report must not hide the rest of the ledger.
    }
  }
  return results;
}

export function mergePublishLedgers(
  historical: ProductionPublishResult[],
  current: ProductionPublishResult[] = []
): ProductionPublishResult[] {
  const output: ProductionPublishResult[] = [];
  const seen = new Set<string>();
  for (const item of [...historical, ...current]) {
    const key = JSON.stringify([
      item.platform,
      item.status,
      item.id || '',
      item.url || '',
      item.scheduleId || '',
      item.scheduledAt || '',
      item.error || ''
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.slice(-100);
}
