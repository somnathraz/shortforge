import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Episode } from '../schema/episode.js';
import { isTechBrand } from '../lib/brands.js';

const ROOT = process.cwd();

export function remotionRootDir(): string {
  return path.resolve(ROOT, process.env.REMOTION_OUTPUT_DIR || 'output/remotion');
}

export function remotionSilentPath(episodeId: string): string {
  return path.join(remotionRootDir(), `${episodeId}-silent.mp4`);
}

export type TechVisualEngine = 'ffmpeg' | 'remotion';

/** Episode is eligible for Remotion teaching visuals (tech diagrams present). */
export function episodeSupportsRemotionTech(episode: Episode): boolean {
  if (episode.storyKind !== 'TECH_EDUCATION') return false;
  if (episode.brandId && !isTechBrand(episode.brandId)) return false;
  return Boolean(episode.hookTechVisual || episode.scenes.some((scene) => scene.techVisual));
}

/** @deprecated use episodeSupportsRemotionTech */
export function episodeUsesRemotionTech(episode: Episode): boolean {
  return episodeSupportsRemotionTech(episode);
}

/**
 * Resolve which tech visual engine to use for this produce/assemble.
 * Explicit `engine` wins; else TECH_VISUAL_ENGINE / REMOTION_TECH env; else remotion.
 */
export function resolveTechVisualEngine(
  episode: Episode,
  engine?: TechVisualEngine | string | null
): TechVisualEngine {
  if (!episodeSupportsRemotionTech(episode)) return 'ffmpeg';
  const raw = (engine || process.env.TECH_VISUAL_ENGINE || process.env.REMOTION_TECH || 'remotion')
    .toString()
    .trim()
    .toLowerCase();
  if (raw === 'ffmpeg' || raw === 'svg' || raw === 'false' || raw === '0') return 'ffmpeg';
  if (raw === 'remotion' || raw === 'true' || raw === '1') return 'remotion';
  return 'remotion';
}

export async function remotionCliInstalled(): Promise<boolean> {
  try {
    await access(path.join(ROOT, 'remotion', 'node_modules', 'remotion', 'package.json'));
    await access(path.join(ROOT, 'remotion', 'node_modules', '@remotion', 'cli', 'package.json'));
    return true;
  } catch {
    return false;
  }
}

/** Narration-aligned visual slots (hook / scene / ending) that override the planned scene durations. */
export type TechSlotDuration = {
  kind: 'spokenHook' | 'scene' | 'ending';
  sceneId: number;
  durationSeconds: number;
};

function buildRemotionProps(episode: Episode, slots?: TechSlotDuration[]): {
  segments: Array<{
    visualType: string;
    visualData: Record<string, unknown>;
    animationSteps: unknown[];
    durationSeconds: number;
  }>;
} {
  const segments: Array<{
    visualType: string;
    visualData: Record<string, unknown>;
    animationSteps: unknown[];
    durationSeconds: number;
  }> = [];
  const slotSeconds = (kind: TechSlotDuration['kind'], sceneId?: number): number | undefined =>
    slots?.find((slot) => slot.kind === kind && (kind !== 'scene' || slot.sceneId === sceneId))
      ?.durationSeconds;
  if (episode.hookTechVisual) {
    segments.push({
      visualType: episode.hookTechVisual.visualType,
      visualData: (episode.hookTechVisual.visualData || {}) as Record<string, unknown>,
      animationSteps: episode.hookTechVisual.animationSteps || [],
      durationSeconds: slotSeconds('spokenHook') ?? (episode.spokenHookDurationSeconds || 5)
    });
  }
  for (const scene of episode.scenes) {
    if (!scene.techVisual) continue;
    segments.push({
      visualType: scene.techVisual.visualType,
      visualData: (scene.techVisual.visualData || {}) as Record<string, unknown>,
      animationSteps: scene.techVisual.animationSteps || [],
      durationSeconds: slotSeconds('scene', scene.id) ?? (scene.durationSeconds || 6)
    });
  }
  // Closing outro (no tech visual of its own) is held on the last teaching panel.
  const endingSeconds = slotSeconds('ending');
  const last = segments[segments.length - 1];
  if (endingSeconds && last) last.durationSeconds += endingSeconds;
  return { segments };
}

/**
 * Render silent teaching MP4 via Remotion (BigOEpisode = Algo Lab / Scale Lab sample chrome).
 * FFmpeg finalizeWithAudioAndSubs should mux narration afterward.
 */
export async function renderRemotionTechSilent(input: {
  episode: Episode;
  /** Absolute path to episode JSON (preferred source for props). */
  episodeJsonPath?: string;
  outputPath?: string;
  /** Real narration timeline slots; without them the planned scene durations are used. */
  slots?: TechSlotDuration[];
}): Promise<string> {
  const outputPath = path.resolve(ROOT, input.outputPath || remotionSilentPath(input.episode.id));
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (!(await remotionCliInstalled())) {
    throw new Error(
      'Remotion not installed. From repo root run: npm run remotion:install'
    );
  }

  const remotionDir = path.join(ROOT, 'remotion');
  const episodeJson =
    input.episodeJsonPath ||
    path.join(ROOT, 'data', 'episodes-tech', `${input.episode.id}.json`);

  let episodeForProps = input.episode;
  try {
    episodeForProps = JSON.parse(await readFile(episodeJson, 'utf8')) as Episode;
  } catch {
    episodeForProps = input.episode;
  }

  // Props are built in Node and passed via --props (webpack cannot use node:fs).
  const props = buildRemotionProps(episodeForProps, input.slots);
  const propsPath = path.join(remotionRootDir(), `${input.episode.id}.props.json`);
  await writeFile(propsPath, `${JSON.stringify(props)}\n`, 'utf8');

  console.log(`Remotion tech silent → ${outputPath}`);
  console.log(`  episode JSON: ${episodeJson}`);
  console.log(`  props: ${propsPath}`);
  console.log(`  chrome: Algo Lab · codewithsome (Scale Lab sample)`);

  const code: number = await new Promise((resolve) => {
    const child = spawn(
      'npx',
      [
        'remotion',
        'render',
        'src/index.ts',
        'BigOEpisode',
        outputPath,
        '--props',
        propsPath,
        '--codec',
        'h264',
        '--log',
        'verbose'
      ],
      {
        cwd: remotionDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          REMOTION_EPISODE_ID: input.episode.id
        }
      }
    );
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });

  if (code !== 0) {
    throw new Error(`Remotion render failed (exit ${code})`);
  }

  await access(outputPath);
  return outputPath;
}
