import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type SceneGenerationRecord = {
  sceneId: number;
  renderMode: 'STILL' | 'AI_VIDEO';
  provider: 'ffmpeg' | 'remotion' | 'wan' | 'veo' | 'runway' | 'upload';
  gpu?: string;
  attempts: number;
  generationSeconds: number;
  costUsd: number;
  accepted: boolean;
  clipPath?: string;
  error?: string;
};

export type ProductionPublishResult = {
  platform: string;
  status: string;
  id?: string | undefined;
  url?: string | undefined;
  reason?: string | undefined;
  error?: string | undefined;
  titleUsed?: string | undefined;
  coverPath?: string | undefined;
  scheduledAt?: string | undefined;
  scheduleId?: string | undefined;
  formats?: Array<{ kind: 'reel' | 'story'; id: string; url?: string | undefined }> | undefined;
  /** When this ledger row was recorded. Older rows may not have this field. */
  recordedAt?: string | undefined;
  /** Absolute video file used for this publish attempt. */
  videoPath?: string | undefined;
};

export type ProductionReport = {
  episodeId: string;
  createdAt: string;
  finalVideo?: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REGENERATE';
  regenerateSceneIds: number[];
  scenes: SceneGenerationRecord[];
  totals: {
    attempts: number;
    generationSeconds: number;
    costUsd: number;
  };
  publish?: {
    lastAt: string;
    dryRun: boolean;
    results: ProductionPublishResult[];
    reportPath?: string;
  };
  /** Set when an approved upstream selection changes after this video was built. */
  staleReason?: string | undefined;
};

export function estimateVeoCostUsd(durationSeconds: number, model?: string): number {
  const name = (model || process.env.VEO_MODEL || '').toLowerCase();
  let perSecond = 0.4; // standard
  if (name.includes('lite')) perSecond = 0.05;
  else if (name.includes('fast')) perSecond = 0.1;
  return Number((durationSeconds * perSecond).toFixed(4));
}

export function estimateWanCostUsd(generationSeconds: number): number {
  const hourly = Number(process.env.WAN_GPU_USD_PER_HOUR || '0.35');
  if (!Number.isFinite(hourly) || hourly < 0) return 0;
  return Number(((generationSeconds / 3600) * hourly).toFixed(4));
}

export function finalRootDir(): string {
  return path.resolve(process.env.FINAL_OUTPUT_DIR || 'output/final');
}

export function productionReportPath(episodeId: string): string {
  return path.join(finalRootDir(), `${episodeId}.production.json`);
}

export function buildProductionReport(
  episodeId: string,
  scenes: SceneGenerationRecord[],
  finalVideo?: string
): ProductionReport {
  const totals = scenes.reduce(
    (acc, scene) => {
      acc.attempts += scene.attempts;
      acc.generationSeconds += scene.generationSeconds;
      acc.costUsd += scene.costUsd;
      return acc;
    },
    { attempts: 0, generationSeconds: 0, costUsd: 0 }
  );
  totals.costUsd = Number(totals.costUsd.toFixed(4));
  totals.generationSeconds = Number(totals.generationSeconds.toFixed(2));
  return {
    episodeId,
    createdAt: new Date().toISOString(),
    ...(finalVideo ? { finalVideo } : {}),
    reviewStatus: 'PENDING',
    regenerateSceneIds: [],
    scenes,
    totals
  };
}

export async function writeProductionReport(report: ProductionReport): Promise<string> {
  const out = productionReportPath(report.episodeId);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return out;
}
