/**
 * In-process sequential Wan queue for the UI server.
 * One GPU → one generation at a time. Status persisted under output/ai-video/<id>/video-state.json.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeSchema } from '../schema/episode.js';
import { ComfyClient } from '../comfy/client.js';
import { defaultVideoProviderName } from '../providers/videoGeneration.js';
import { episodesDir } from './paths.js';
import {
  buildSceneVideoStatus,
  generateEpisodeVideos,
  generateSceneVideo,
  loadEpisodeVideoState,
  saveEpisodeVideoState,
  type EpisodeVideoState
} from '../pipeline/sceneVideo.js';

const running = new Set<string>();
const controllers = new Map<string, AbortController>();

async function loadEpisode(file: string) {
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    throw new Error('Invalid episode file');
  }
  const absolute = path.join(episodesDir(), file);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(absolute, 'utf8')) as unknown);
  return { episode, absolute, file };
}

function comfyBaseUrl(): string {
  const localPort = (process.env.WAN_COMFY_LOCAL_PORT || '8080').trim() || '8080';
  return (
    process.env.WAN_COMFY_URL ||
    process.env.COMFYUI_URL ||
    `http://127.0.0.1:${localPort}`
  ).replace(/\/$/, '');
}

/** Prefer in-memory running flag so UI never shows Batch done while a job is still active. */
function withLiveBatchFlag(state: EpisodeVideoState, episodeId: string): EpisodeVideoState {
  const live = running.has(episodeId);
  if (!live) return state;
  const batch = state.batch;
  if (batch?.running) return state;
  return {
    ...state,
    batch: {
      mode: batch?.mode || 'one',
      total: batch?.total ?? 1,
      completed: batch?.completed ?? 0,
      failed: batch?.failed ?? 0,
      running: true,
      ...(batch?.currentSceneId !== undefined ? { currentSceneId: batch.currentSceneId } : {}),
      progressPercent:
        typeof batch?.progressPercent === 'number' ? Math.min(99, batch.progressPercent) : 0
    }
  };
}

export async function getWanEpisodeStatus(file: string): Promise<EpisodeVideoState> {
  const { episode } = await loadEpisode(file);
  const state = await buildSceneVideoStatus(episode, file);
  return withLiveBatchFlag(state, episode.id);
}

export async function startWanEpisodeJob(options: {
  file: string;
  mode: 'one' | 'all' | 'retry';
  sceneId?: number;
  /** Explicit scene ids (any renderMode). When set with mode=all, only these are queued. */
  sceneIds?: number[];
  force?: boolean;
  videoPrompt?: string;
  videoNegativePrompt?: string;
  qualityMode?: 'quality' | 'fast';
}): Promise<EpisodeVideoState> {
  const { episode, file } = await loadEpisode(options.file);
  const key = episode.id;
  if (running.has(key)) {
    const state = await loadEpisodeVideoState(key);
    throw new Error(
      `Wan job already running for ${key}${
        state.batch?.currentSceneId ? ` (scene ${state.batch.currentSceneId})` : ''
      }`
    );
  }

  const controller = new AbortController();
  controllers.set(key, controller);
  running.add(key);

  // Persist running=true BEFORE returning so the UI never flashes the previous "Batch done".
  const pending = await loadEpisodeVideoState(key);
  if (options.mode === 'one') {
    if (typeof options.sceneId !== 'number' || !Number.isFinite(options.sceneId)) {
      running.delete(key);
      controllers.delete(key);
      throw new Error('sceneId required for mode=one');
    }
    pending.batch = {
      mode: 'one',
      total: 1,
      completed: 0,
      failed: 0,
      running: true,
      currentSceneId: options.sceneId,
      progressPercent: 0
    };
    pending.scenes[String(options.sceneId)] = {
      sceneId: options.sceneId,
      status: 'queued',
      ...(pending.scenes[String(options.sceneId)]?.imagePath
        ? { imagePath: pending.scenes[String(options.sceneId)]!.imagePath }
        : {}),
      ...(pending.scenes[String(options.sceneId)]?.imageMtimeMs !== undefined
        ? { imageMtimeMs: pending.scenes[String(options.sceneId)]!.imageMtimeMs }
        : {})
    };
  } else {
    const totalHint = options.sceneIds?.length || pending.batch?.total || 1;
    pending.batch = {
      mode: options.mode === 'retry' ? 'retry' : 'all',
      total: totalHint,
      completed: 0,
      failed: 0,
      running: true,
      progressPercent: 0,
      ...(options.sceneIds?.[0] !== undefined ? { currentSceneId: options.sceneIds[0] } : {})
    };
  }
  await saveEpisodeVideoState(pending);

  void (async () => {
    try {
      if (options.mode === 'one') {
        try {
          await generateSceneVideo({
            episode,
            episodeFile: file,
            sceneId: options.sceneId!,
            force: options.force !== false,
            signal: controller.signal,
            shouldCancel: () => controller.signal.aborted,
            ...(options.videoPrompt ? { videoPromptOverride: options.videoPrompt } : {}),
            ...(options.videoNegativePrompt
              ? { videoNegativePromptOverride: options.videoNegativePrompt }
              : {}),
            ...(options.qualityMode ? { qualityMode: options.qualityMode } : {})
          });
          const done = await loadEpisodeVideoState(key);
          done.batch = {
            mode: 'one',
            total: 1,
            completed: controller.signal.aborted ? 0 : 1,
            failed: controller.signal.aborted ? 1 : 0,
            running: false,
            progressPercent: controller.signal.aborted ? 0 : 100,
            ...(options.sceneId !== undefined ? { currentSceneId: options.sceneId } : {})
          };
          await saveEpisodeVideoState(done);
        } catch (error) {
          const failed = await loadEpisodeVideoState(key);
          const msg = error instanceof Error ? error.message : String(error);
          const cancelled = /cancel/i.test(msg) || controller.signal.aborted;
          if (cancelled && failed.scenes[String(options.sceneId)]) {
            failed.scenes[String(options.sceneId)] = {
              ...failed.scenes[String(options.sceneId)]!,
              status: 'failed',
              error: 'Cancelled'
            };
          }
          failed.batch = {
            mode: 'one',
            total: 1,
            completed: 0,
            failed: 1,
            running: false,
            progressPercent: 0,
            ...(options.sceneId !== undefined ? { currentSceneId: options.sceneId } : {})
          };
          await saveEpisodeVideoState(failed);
        }
      } else {
        await generateEpisodeVideos({
          episode,
          episodeFile: file,
          mode: options.mode === 'retry' ? 'retry' : 'all',
          force: Boolean(options.force),
          ...(options.sceneIds?.length ? { sceneIds: options.sceneIds } : {}),
          ...(options.qualityMode ? { qualityMode: options.qualityMode } : {}),
          signal: controller.signal,
          shouldCancel: () => controller.signal.aborted
        });
      }
    } catch (error) {
      console.error('[wanJobs]', error instanceof Error ? error.message : error);
    } finally {
      running.delete(key);
      controllers.delete(key);
    }
  })();

  return withLiveBatchFlag(await buildSceneVideoStatus(episode, file), key);
}

/** Cancel in-flight EpicAstra batch + interrupt ComfyUI. */
export async function cancelWanEpisodeJob(file: string): Promise<EpisodeVideoState> {
  const { episode } = await loadEpisode(file);
  const key = episode.id;
  const controller = controllers.get(key);
  controller?.abort();

  // The abort signal cancels a Runway task itself; only a Comfy/Wan run needs the GPU queue cleared.
  try {
    if (defaultVideoProviderName().toLowerCase().startsWith('runway')) throw new Error('hosted provider — no Comfy queue');
    const client = new ComfyClient(comfyBaseUrl());
    await client.interrupt();
    await client.clearQueue();
  } catch (error) {
    console.warn(
      '[wanJobs] Comfy interrupt/clear failed:',
      error instanceof Error ? error.message : error
    );
  }

  const state = await loadEpisodeVideoState(key);
  for (const [id, scene] of Object.entries(state.scenes)) {
    if (scene.status === 'queued' || scene.status === 'generating') {
      state.scenes[id] = {
        ...scene,
        status: 'failed',
        error: 'Cancelled',
        finishedAt: new Date().toISOString()
      };
    }
  }
  if (state.batch) {
    state.batch = {
      ...state.batch,
      running: false
    };
  }
  await saveEpisodeVideoState(state);
  running.delete(key);
  controllers.delete(key);
  return withLiveBatchFlag(await buildSceneVideoStatus(episode, file), key);
}

export function isWanJobRunning(episodeId: string): boolean {
  return running.has(episodeId);
}
