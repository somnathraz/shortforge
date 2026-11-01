/**
 * Tech reel series planner — Day 1 / Day 2 topics before scene + JSON work.
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const ROOT = process.cwd();
const DIRECTORY = path.join(ROOT, 'data/tech-series');

const Id = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/).max(64);

export const TechSeriesDaySchema = z
  .object({
    day: z.number().int().min(1).max(99),
    title: z.string().min(1).max(64),
    topic: z.string().max(240).default(''),
    reelId: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80).optional(),
    templateId: z
      .string()
      .regex(/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/)
      .max(64)
      .optional()
  })
  .strict();

export const TechSeriesSchema = z
  .object({
    version: z.literal(1),
    id: Id,
    title: z.string().min(1).max(90),
    pitch: z.string().max(200).default(''),
    days: z.array(TechSeriesDaySchema).min(1).max(60),
    updatedAt: z.string().min(1)
  })
  .strict()
  .superRefine((series, ctx) => {
    const days = series.days.map((d) => d.day);
    if (new Set(days).size !== days.length) {
      ctx.addIssue({ code: 'custom', path: ['days'], message: 'Day numbers must be unique' });
    }
  });

export type TechSeries = z.infer<typeof TechSeriesSchema>;
export type TechSeriesDay = z.infer<typeof TechSeriesDaySchema>;

function seriesPath(id: string): string {
  if (!Id.safeParse(id).success) throw new Error('Invalid series id');
  return path.join(DIRECTORY, `${id}.json`);
}

export function seriesPromptTopic(series: TechSeries, day: TechSeriesDay): string {
  const topic = day.topic.trim() || day.title;
  return `Day ${day.day} of "${series.title}": ${topic}`;
}

export async function listTechSeries(): Promise<Array<Pick<TechSeries, 'id' | 'title' | 'pitch' | 'updatedAt'> & { days: number }>> {
  await mkdir(DIRECTORY, { recursive: true });
  const files = (await readdir(DIRECTORY)).filter((f) => /^[a-z][a-z0-9-]+\.json$/.test(f));
  const items = await Promise.all(
    files.map(async (file) => {
      const series = TechSeriesSchema.parse(JSON.parse(await readFile(path.join(DIRECTORY, file), 'utf8')));
      return {
        id: series.id,
        title: series.title,
        pitch: series.pitch,
        updatedAt: series.updatedAt,
        days: series.days.length
      };
    })
  );
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
}

export async function loadTechSeries(id: string): Promise<TechSeries> {
  const series = TechSeriesSchema.parse(JSON.parse(await readFile(seriesPath(id), 'utf8')));
  if (series.id !== id) throw new Error('Series id must match filename');
  return series;
}

export async function saveTechSeries(value: unknown, create = false): Promise<TechSeries> {
  const parsed = TechSeriesSchema.parse({
    ...(typeof value === 'object' && value ? value : {}),
    updatedAt: new Date().toISOString()
  });
  await mkdir(DIRECTORY, { recursive: true });
  const destination = seriesPath(parsed.id);
  const body = `${JSON.stringify(parsed, null, 2)}\n`;
  if (create) {
    await writeFile(destination, body, { flag: 'wx' });
  } else {
    await loadTechSeries(parsed.id);
    const pending = `${destination}.tmp`;
    await writeFile(pending, body);
    await rename(pending, destination);
  }
  return parsed;
}

export function blankSeries(id: string, title: string): TechSeries {
  return TechSeriesSchema.parse({
    version: 1,
    id,
    title,
    pitch: '',
    updatedAt: new Date().toISOString(),
    days: [
      { day: 1, title: 'Day 1 topic', topic: '' },
      { day: 2, title: 'Day 2 topic', topic: '' }
    ]
  });
}

export function addSeriesDay(series: TechSeries, title = ''): TechSeries {
  const nextDay = series.days.reduce((max, d) => Math.max(max, d.day), 0) + 1;
  return {
    ...series,
    days: [
      ...series.days,
      {
        day: nextDay,
        title: title.trim() || `Day ${nextDay} topic`,
        topic: ''
      }
    ],
    updatedAt: new Date().toISOString()
  };
}
