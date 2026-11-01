/**
 * Static (non-animated) Remotion still of one scene template for Desk / Studio preview.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTemplateId, listRegisteredTemplates } from '../lib/techReelSceneTemplates.js';
import type { TechReel } from '../schema/techReel.js';
import { TechReelSchema } from '../schema/techReel.js';
import type { TechReelProps } from './techReelModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Settled frame after TemplateShell intro ease (~26 frames). */
const STILL_FRAME = 40;
const BEAT_SECONDS = 4;

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => chunks.push(Buffer.from(d)));
    child.stderr?.on('data', (d) => chunks.push(Buffer.from(d)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const log = Buffer.concat(chunks).toString('utf8').trim().slice(-1200);
        reject(new Error(log || `${command} exited ${code}`));
      }
    });
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function sampleBeatExtras(requires: string[]): Partial<TechReel['beats'][number]> {
  const extras: Partial<TechReel['beats'][number]> = {};
  if (requires.includes('window')) {
    extras.window = {
      values: [2, 1, 5, 1, 3, 2],
      windowStart: 1,
      windowSize: 3,
      stage: 'frame',
      sum: 7
    };
  }
  if (requires.includes('hardware')) {
    extras.hardware = {
      cores: 8,
      memoryGb: 32,
      demand: 0.72,
      capacity: 0.85,
      stage: 'normal'
    };
  }
  if (requires.includes('nodes')) {
    extras.nodes = { rail: { opacity: 1, load: 0.4 } };
  }
  return extras;
}

export function buildScenePreviewReel(input: {
  templateId: string;
  requires: string[];
  headline?: string;
  subhead?: string;
  chapter?: string;
}): TechReel {
  const id = assertTemplateId(input.templateId);
  const extras = sampleBeatExtras(input.requires);
  const reel: TechReel = {
    version: 1,
    brandId: 'tech-instagram',
    id: `still-${id.replace(/\./g, '-')}`,
    title: `Preview ${id}`,
    accent: '#efc373',
    style: 'orbital',
    voice: 'TECH_ENGLISH_INDIA',
    lang: 'en',
    nodes: [{ id: 'rail', kind: 'service', label: 'SCENE', x: 540, y: 980 }],
    beats: [
      {
        id: 'preview',
        chapter: (input.chapter || '01 / PREVIEW').slice(0, 32),
        headline: (input.headline || id).slice(0, 64),
        subhead: (input.subhead || 'Static scene preview').slice(0, 90),
        narration: 'Preview.',
        durationSeconds: BEAT_SECONDS,
        nodes: extras.nodes || {},
        flows: [],
        template: id,
        ...(extras.window ? { window: extras.window } : {}),
        ...(extras.hardware ? { hardware: extras.hardware } : {}),
        metric: { label: 'TEMPLATE', value: id.slice(0, 40) }
      }
    ]
  };
  return TechReelSchema.parse(reel);
}

export async function renderSceneTemplateStill(input: {
  templateId: string;
  headline?: string;
  subhead?: string;
  chapter?: string;
  /** 0.2–1; default 0.28 ≈ 300×540 for a small Desk thumbnail. */
  scale?: number;
  force?: boolean;
}): Promise<{ absolutePath: string; mediaUrl: string; frame: number; cached: boolean }> {
  const templateId = assertTemplateId(input.templateId);
  const catalog = await listRegisteredTemplates();
  const meta = catalog.find((t) => t.id === templateId);
  if (!meta) {
    throw new Error(
      `Unknown scene template "${templateId}". Pick a registered scene, or Save once for a new id.`
    );
  }

  const sceneFile = path.join(ROOT, 'remotion/src/templates/scenes', `${templateId}.tsx`);
  let sceneMtime = 0;
  try {
    sceneMtime = (await stat(sceneFile)).mtimeMs;
  } catch {
    throw new Error(`Scene file missing for "${templateId}" (${sceneFile}).`);
  }

  const scale = Math.min(1, Math.max(0.2, input.scale ?? 0.28));
  const reel = buildScenePreviewReel({
    templateId,
    requires: meta.requires,
    headline: input.headline,
    subhead: input.subhead,
    chapter: input.chapter
  });
  const props: TechReelProps = { reel, captions: [] };
  const fingerprint = createHash('sha1')
    .update(JSON.stringify({ templateId, scale, frame: STILL_FRAME, sceneMtime, props }))
    .digest('hex')
    .slice(0, 12);

  const directory = path.join(ROOT, 'output/tech-scene-previews', templateId.replace(/\./g, '_'));
  await mkdir(directory, { recursive: true });
  const pngName = `${fingerprint}.png`;
  const absolutePath = path.join(directory, pngName);
  const mediaUrl = `/api/media/tech-scene-previews/${templateId.replace(/\./g, '_')}/${pngName}`;

  if (!input.force && (await exists(absolutePath))) {
    return { absolutePath, mediaUrl, frame: STILL_FRAME, cached: true };
  }

  const propsPath = path.join(directory, `${fingerprint}-props.json`);
  await writeFile(propsPath, JSON.stringify(props, null, 2));

  const cli = path.join(ROOT, 'remotion/node_modules/@remotion/cli/remotion-cli.js');
  await run(
    process.execPath,
    [
      cli,
      'still',
      'src/index.ts',
      'TechReel',
      absolutePath,
      '--props',
      propsPath,
      '--frame',
      String(STILL_FRAME),
      '--scale',
      String(scale),
      '--log',
      'error'
    ],
    path.join(ROOT, 'remotion')
  );

  if (!(await exists(absolutePath))) {
    throw new Error(`Remotion still did not write ${absolutePath}`);
  }
  return { absolutePath, mediaUrl, frame: STILL_FRAME, cached: false };
}
