import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { PackagingLanguageSchema } from '../schema/packaging.js';
import { publishEpisode } from './publish.js';
import {
  listSchedules,
  saveSchedule,
  type ScheduleRecord
} from './publishSchedules.js';

function episodesDir(): string {
  return path.resolve(process.env.EPISODES_DIR || 'data/episodes');
}

async function resolveEpisodeFile(fileOrId: string): Promise<string> {
  if (fileOrId.endsWith('.json')) {
    const absolute = path.isAbsolute(fileOrId)
      ? fileOrId
      : path.join(episodesDir(), path.basename(fileOrId));
    await access(absolute);
    return absolute;
  }
  const absolute = path.join(episodesDir(), fileOrId);
  try {
    await access(absolute);
    return absolute;
  } catch {
    // treat as episode id
  }
  const files = await readdir(episodesDir());
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const parsed = JSON.parse(await readFile(path.join(episodesDir(), file), 'utf8')) as {
        id?: string;
      };
      if (parsed.id === fileOrId) return path.join(episodesDir(), file);
    } catch {
      // continue
    }
  }
  throw new Error(`Episode file not found for schedule: ${fileOrId}`);
}

export async function processDueSchedules(nowMs = Date.now()): Promise<{
  processed: string[];
  errors: Array<{ id: string; error: string }>;
}> {
  const pending = await listSchedules({ status: 'pending' });
  const due = pending.filter((row) => new Date(row.scheduledAt).getTime() <= nowMs);
  const processed: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of due) {
    const running: ScheduleRecord = {
      ...row,
      status: 'running',
      updatedAt: new Date().toISOString()
    };
    await saveSchedule(running);
    try {
      const episodePath = await resolveEpisodeFile(row.episodeFile);
      const episode = EpisodeSchema.parse(
        JSON.parse(await readFile(episodePath, 'utf8')) as unknown
      );
      const language = PackagingLanguageSchema.parse(row.language || 'hi');
      await publishEpisode({
        episode,
        platforms: row.platforms,
        language,
        requirePackaging: row.requirePackaging !== false,
        force: row.force === true,
        ...(row.privacy ? { privacy: row.privacy } : {}),
        ...(row.metaFormats ? { metaFormats: row.metaFormats } : {}),
        ...(row.videoPath ? { videoPath: row.videoPath } : {})
      });
      await saveSchedule({
        ...running,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });
      processed.push(row.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await saveSchedule({
        ...running,
        status: 'failed',
        error: message,
        updatedAt: new Date().toISOString()
      });
      errors.push({ id: row.id, error: message });
    }
  }

  return { processed, errors };
}
