import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PUBLISH_PLATFORMS, type PublishPlatform } from './publish.js';
import { parseScheduleAt, toScheduleIso } from '../lib/publishSchedule.js';

const ScheduleRecordSchema = z.object({
  id: z.string().min(1),
  episodeId: z.string().min(1),
  episodeFile: z.string().min(1),
  platforms: z.array(z.enum(['youtube', 'instagram', 'facebook'])).min(1),
  scheduledAt: z.string().min(1),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  language: z.enum(['hi', 'en']).optional(),
  privacy: z.enum(['private', 'unlisted', 'public']).optional(),
  metaFormats: z
    .object({
      reel: z.boolean(),
      story: z.boolean()
    })
    .optional(),
  videoPath: z.string().optional(),
  requirePackaging: z.boolean().optional(),
  force: z.boolean().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
  completedAt: z.string().optional()
});

export type ScheduleRecord = z.infer<typeof ScheduleRecordSchema>;

function schedulesRoot(): string {
  return path.resolve(process.env.PUBLISH_SCHEDULES_DIR || 'data/publish-schedules');
}

function schedulePath(id: string): string {
  return path.join(schedulesRoot(), `${id}.json`);
}

async function writeSchedule(record: ScheduleRecord): Promise<void> {
  await mkdir(schedulesRoot(), { recursive: true });
  await writeFile(schedulePath(record.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

export async function listSchedules(filter?: {
  episodeId?: string;
  status?: ScheduleRecord['status'];
}): Promise<ScheduleRecord[]> {
  await mkdir(schedulesRoot(), { recursive: true });
  let names: string[] = [];
  try {
    names = await readdir(schedulesRoot());
  } catch {
    return [];
  }
  const rows: ScheduleRecord[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      const raw = JSON.parse(await readFile(path.join(schedulesRoot(), name), 'utf8')) as unknown;
      const parsed = ScheduleRecordSchema.parse(raw);
      if (filter?.episodeId && parsed.episodeId !== filter.episodeId) continue;
      if (filter?.status && parsed.status !== filter.status) continue;
      rows.push(parsed);
    } catch {
      // skip corrupt
    }
  }
  return rows.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function getSchedule(id: string): Promise<ScheduleRecord | null> {
  try {
    const raw = JSON.parse(await readFile(schedulePath(id), 'utf8')) as unknown;
    return ScheduleRecordSchema.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSchedule(record: ScheduleRecord): Promise<void> {
  await writeSchedule(ScheduleRecordSchema.parse(record));
}

export async function createDeferredSchedule(input: {
  episodeId: string;
  episodeFile: string;
  platforms: PublishPlatform[];
  scheduledAt: string | Date;
  language?: 'hi' | 'en';
  privacy?: 'private' | 'unlisted' | 'public';
  metaFormats?: { reel: boolean; story: boolean };
  videoPath?: string;
  requirePackaging?: boolean;
  force?: boolean;
  note?: string;
}): Promise<ScheduleRecord> {
  if (!input.platforms.length) throw new Error('At least one platform is required for a schedule');
  for (const platform of input.platforms) {
    if (!PUBLISH_PLATFORMS.includes(platform)) {
      throw new Error(`Unknown platform in schedule: ${platform}`);
    }
  }
  const when =
    input.scheduledAt instanceof Date ? input.scheduledAt : parseScheduleAt(input.scheduledAt);
  const now = new Date().toISOString();
  const id = `${input.episodeId}-${when.getTime()}-${input.platforms.join('-')}`;
  const record: ScheduleRecord = {
    id,
    episodeId: input.episodeId,
    episodeFile: input.episodeFile,
    platforms: input.platforms,
    scheduledAt: toScheduleIso(when),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...(input.language ? { language: input.language } : {}),
    ...(input.privacy ? { privacy: input.privacy } : {}),
    ...(input.metaFormats ? { metaFormats: input.metaFormats } : {}),
    ...(input.videoPath ? { videoPath: input.videoPath } : {}),
    ...(input.requirePackaging !== undefined ? { requirePackaging: input.requirePackaging } : {}),
    ...(input.force !== undefined ? { force: input.force } : {}),
    ...(input.note ? { note: input.note } : {})
  };
  await writeSchedule(record);
  return record;
}

export async function cancelSchedule(id: string): Promise<ScheduleRecord> {
  const existing = await getSchedule(id);
  if (!existing) throw new Error(`Schedule not found: ${id}`);
  if (existing.status !== 'pending') {
    throw new Error(`Cannot cancel schedule in status ${existing.status}`);
  }
  const next: ScheduleRecord = {
    ...existing,
    status: 'cancelled',
    updatedAt: new Date().toISOString()
  };
  await writeSchedule(next);
  return next;
}

export async function pruneOldSchedules(days = 30): Promise<number> {
  const cutoff = Date.now() - days * 24 * 60 * 60_000;
  const rows = await listSchedules();
  let removed = 0;
  for (const row of rows) {
    if (row.status === 'pending' || row.status === 'running') continue;
    const stamp = new Date(row.completedAt || row.updatedAt).getTime();
    if (stamp < cutoff) {
      await unlink(schedulePath(row.id)).catch(() => undefined);
      removed += 1;
    }
  }
  return removed;
}
