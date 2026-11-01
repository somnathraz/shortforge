import { buildTechReelScriptBundle } from '../lib/techReelScript.js';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { probeAudio } from '../audio/ffprobe.js';
import { rm } from 'node:fs/promises';
import { SceneVisualsSchema } from '../schema/sceneVisuals.js';
import { EpisodeSchema } from '../schema/episode.js';
import '../lib/loadEnv.js';
import {
  buildScriptBundle
} from '../lib/episodeScriptTemplate.js';
import {
  brandPublicView,
  currentBrandId,
  listBrands,
  resolveBrandId,
  runWithBrandAsync,
  type BrandId
} from '../lib/brands.js';
import { listElevenLabsVoiceOptions } from '../lib/elevenlabsVoices.js';
import { listSarvamVoiceOptions } from '../lib/sarvamVoices.js';
import { assertEpisodeNotPublished, fileExists } from './assets.js';
import { publishConnectionSetup, testPublishConnections } from './connections.js';
import { getEpisodeDetail, listEpisodes, loadReview, saveReview, deleteEpisode } from './episodes.js';
import { buildImagePromptsForEpisode, saveVisualPrompts } from './imagePrompts.js';
import {
  cancelSchedule,
  listSchedules
} from '../pipeline/publishSchedules.js';
import { processDueSchedules } from '../pipeline/processSchedules.js';
import {
  formatImportIssues,
  importEpisodeJson
} from '../pipeline/importEpisode.js';
import { listBgmLibraryForUi, resolveBgmAsset } from './bgmLibrary.js';
import { sfxAvailabilityForEffects, uploadCustomSfx } from './sfxLibraryApi.js';
import { runJob } from './jobs.js';
import { assertJobAllowed } from './jobGate.js';
import { experimentStatus, experimentAction, ExperimentActionSchema } from './videoExperiments.js';
import { loadPackaging, updatePlatformPack, applyJsonTitles } from './packaging.js';
import { outputDir, resolveInside, ROOT } from './paths.js';
import { toOutputRelative } from '../lib/selectedAssets.js';
import { assertExternalVideoPath } from '../lib/episodeAssetGuard.js';
import { instagramMediaHostingStatus } from '../lib/s3PublishMedia.js';
import {
  completeInstagramOAuth,
  instagramAuthSetup
} from '../providers/instagramAuth.js';
import {
  persistYoutubeVaultTokens,
  verifyInstagramOAuthState,
  verifyYoutubeOAuthState
} from '../lib/publishConnections.js';
import {
  exchangeYoutubeAuthCode,
  fetchYoutubeChannelTitle,
  youtubeAuthSetup,
  youtubeDeskRedirectUri
} from '../providers/youtubeUpload.js';
import { ensureYoutubeOAuthCallbackServer } from './youtubeOAuthCallback.js';
import {
  authenticateDeskLogin,
  bootstrapDeskPassword,
  deskAuthStatus,
  loginLockoutSeconds,
  recordLoginResult,
  signDeskSession,
  verifyDeskSession
} from '../lib/deskAuth.js';
import {
  brandForAccount,
  buildDmText,
  commentDmConfig,
  commentMatches,
  hasReplied,
  markReplied,
  parseCommentWebhook,
  verifyMetaSignature
} from '../lib/commentDm.js';
import { sendPrivateReply } from '../providers/metaDm.js';
import { persistInstagramLoginTokens } from './instagramAuthPersist.js';
import type { JobKind } from './types.js';
import {
  assertTechStudioBrand,
  attachTechReelToEpisode,
  listTechReels,
  techReelDetail,
  saveTechReel,
  startTechReelRender
} from './techReels.js';
import {
  formatSceneTsx,
  listRegisteredTemplates,
  publishSceneTemplate,
  readSceneTemplateSource,
  scaffoldSceneTemplate
} from '../lib/techReelSceneTemplates.js';
import { renderSceneTemplateStill } from '../remotion/renderSceneStill.js';
import {
  blankSeries,
  listTechSeries,
  loadTechSeries,
  saveTechSeries
} from './techSeries.js';

const PORT = Number(process.env.UI_PORT || 8787);
const HOST = process.env.UI_HOST || '127.0.0.1';

const ReviewBodySchema = z.object({
  episodeId: z.string().min(1),
  claimVerdicts: z.record(
    z.string(),
    z.enum(['unchecked', 'supported', 'unsupported', 'needs-source'])
  ),
  approvals: z.object({
    script: z.boolean(),
    tts: z.boolean(),
    images: z.boolean()
  }),
  selected: z
    .object({
      sceneVisuals: SceneVisualsSchema.optional(),
      burnSubtitles: z.boolean().optional(),
      audio: z.string().min(1).optional(),
      images: z.record(z.string(), z.string().min(1)).optional(),
      clips: z.record(z.string(), z.string().min(1)).optional(),
      final: z.string().min(1).optional(),
      externalVideo: z.string().min(1).optional()
    })
    .optional(),
  reviewerNotes: z.string()
});

const JobBodySchema = z.object({
  kind: z.enum([
    'topics',
    'story',
    'tts:free',
    'tts:elevenlabs',
    'tts:sarvam',
    'audio:plan',
    'audio:mix',
    'audio:sfx-el',
    'images',
    'images:demo',
    'render',
    'remotion',
    'remotion:chrome',
    'animate',
    'produce',
    'mux:external',
    'package',
    'review',
    'publish'
  ]),
  topic: z.string().optional(),
  episodeFile: z.string().optional(),
  episodeId: z.string().optional(),
  provider: z.string().optional(),
  scene: z.string().optional(),
  /** Comma-separated scene ids for partial image regen, e.g. "1,2,3". */
  scenes: z.string().optional(),
  /** What is wrong / how to fix when regenerating scene images. */
  feedback: z.string().optional(),
  action: z.string().optional(),
  platforms: z.string().optional(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
  reuseAi: z.boolean().optional(),
  focus: z.string().optional(),
  count: z.string().optional(),
  imageProvider: z.string().optional(),
  skipCovers: z.boolean().optional(),
  videoPath: z.string().optional(),
  language: z.enum(['hi', 'en']).optional(),
  requirePackaging: z.boolean().optional(),
  voiceId: z.string().min(1).optional(),
  /** Listener / Voice B for TWO_SPEAKER_DIALOGUE ElevenLabs TTS. */
  voiceIdB: z.string().min(1).optional(),
  motion: z.enum(['low', 'medium', 'high']).optional(),
  ffmpegEffects: z.enum(['off', 'atmosphere', 'water']).optional(),
  techEngine: z.enum(['remotion', 'ffmpeg']).optional(),
  audio: z.string().min(1).optional(),
  /** Comma-separated SFX effect ids for ElevenLabs generate-to-custom. */
  effects: z.string().optional(),
  /** Opt-in: mix may generate missing SFX via ElevenLabs. */
  elevenlabsSfx: z.boolean().optional(),
  /** User-selected BGM path (absolute or under assets/audio/bgm/). */
  bgm: z.string().min(1).optional(),
  /** Heritage frame family for images:demo. */
  frameVariant: z
    .enum(['HERITAGE_LIGHT', 'HERITAGE_CLASSIC', 'HERITAGE_DRAMATIC'])
    .optional(),
  /** Meta publish formats: "reel,story" | "reel" | "story". */
  metaFormats: z.string().min(1).optional(),
  /** ISO datetime to schedule publish (YouTube/FB Reel native; IG deferred). */
  scheduleAt: z.string().min(1).optional()
});

const PackagingPatchSchema = z.object({
  language: z.enum(['hi', 'en']).default('hi'),
  platform: z.enum(['youtube', 'instagram', 'facebook']),
  title: z.string().min(3).max(100),
  description: z.string().min(20).max(5000),
  tags: z.array(z.string().min(1).max(40)).min(1).max(20),
  hashtags: z.array(z.string().min(1).max(40)).min(1).max(30),
  cta: z.string().min(3).max(120)
});


const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.srt': 'application/x-subrip',
  '.woff2': 'font/woff2'
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

async function readBinaryBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Upload too large (max ${Math.round(maxBytes / (1024 * 1024))}MB)`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function sanitizeUploadFilename(name: string): string {
  const base = path.basename(name || 'upload.mp4').replace(/[^\w.\-]+/g, '_');
  return base || 'upload.mp4';
}

function uiDistDir(): string {
  return path.join(ROOT, 'ui', 'dist');
}

async function serveStatic(reqPath: string, res: http.ServerResponse): Promise<boolean> {
  const dist = uiDistDir();
  const relative = reqPath === '/' ? 'index.html' : reqPath.replace(/^\//, '');
  const filePath = resolveInside(dist, relative);
  if (!filePath) {
    sendText(res, 400, 'Invalid path');
    return true;
  }

  try {
    await access(filePath);
  } catch {
    if (!path.extname(relative)) {
      const indexPath = path.join(dist, 'index.html');
      try {
        await access(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        createReadStream(indexPath).pipe(res);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(res);
  return true;
}

async function serveMedia(
  urlPath: string,
  res: http.ServerResponse,
  req: http.IncomingMessage
): Promise<void> {
  const relative = decodeURIComponent(urlPath.replace(/^\/api\/media\//, ''));
  const absolute = resolveInside(outputDir(), relative);
  if (!absolute || !(await fileExists(absolute))) {
    sendText(res, 404, 'Media not found');
    return;
  }
  await serveFileAbsolute(absolute, res, req);
}

async function serveFileAbsolute(
  absolute: string,
  res: http.ServerResponse,
  req: http.IncomingMessage
): Promise<void> {
  const type = MIME[path.extname(absolute).toLowerCase()] || 'application/octet-stream';
  const info = await stat(absolute);
  const size = info.size;
  const method = req.method || 'GET';
  const range = req.headers.range;

  if (method === 'HEAD') {
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store, must-revalidate',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size)
    });
    res.end();
    return;
  }

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end >= start &&
        start < size
      ) {
        const safeEnd = Math.min(end, size - 1);
        const chunk = safeEnd - start + 1;
        res.writeHead(206, {
          'Content-Type': type,
          'Cache-Control': 'no-store, must-revalidate',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${safeEnd}/${size}`,
          'Content-Length': String(chunk)
        });
        createReadStream(absolute, { start, end: safeEnd }).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store, must-revalidate',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(size)
  });
  createReadStream(absolute).pipe(res);
}

async function handleCommentWebhook(body: unknown): Promise<void> {
  for (const comment of parseCommentWebhook(body)) {
    try {
      const brandId = brandForAccount(comment.platform, comment.accountId);
      if (!brandId || comment.fromId === comment.accountId) continue; // unknown account or our own reply
      const config = commentDmConfig(brandId);
      if (!config || !commentMatches(config, comment.text) || hasReplied(brandId, comment.commentId)) continue;
      const text = buildDmText(config, comment.fromName);
      if (!text) {
        console.warn(`[comment-dm] ${brandId}: no link urls configured, skipping`);
        continue;
      }
      await sendPrivateReply(brandId, comment, text);
      markReplied(brandId, comment.commentId);
      console.log(`[comment-dm] ${brandId}: DM sent for comment ${comment.commentId}`);
    } catch (error) {
      console.error(`[comment-dm] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const { pathname } = url;
  const method = req.method || 'GET';

  // Meta webhook (comment → DM). Public: authenticated by verify token / HMAC signature, not Desk login.
  if (pathname === '/api/webhooks/meta') {
    if (method === 'GET') {
      const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
      if (
        expected &&
        url.searchParams.get('hub.mode') === 'subscribe' &&
        url.searchParams.get('hub.verify_token') === expected
      ) {
        sendText(res, 200, url.searchParams.get('hub.challenge') || '');
      } else {
        sendText(res, 403, 'Forbidden');
      }
      return;
    }
    if (method === 'POST') {
      const secret = process.env.META_APP_SECRET?.trim() || process.env.INSTAGRAM_APP_SECRET?.trim();
      const raw = await readBinaryBody(req, 1_000_000);
      if (!secret || !verifyMetaSignature(raw, req.headers['x-hub-signature-256'] as string | undefined, secret)) {
        sendText(res, 403, 'Bad signature');
        return;
      }
      sendText(res, 200, 'ok'); // ack fast; Meta retries on slow responses
      void handleCommentWebhook(JSON.parse(raw.toString('utf8')));
      return;
    }
  }

  if (method === 'GET' && pathname === '/api/mcp/connect') {
    const { MCP_EXAMPLE_PROMPTS, MCP_SERVER_NAME, mcpClientSetups, providerReadiness } = await import('./mcpConnect.js');
    sendJson(res, 200, {
      serverName: MCP_SERVER_NAME,
      clients: mcpClientSetups(),
      providers: providerReadiness(),
      examples: MCP_EXAMPLE_PROMPTS
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/mcp/test') {
    const { testMcpServer } = await import('./mcpConnect.js');
    sendJson(res, 200, await testMcpServer());
    return;
  }

  if (method === 'GET' && pathname === '/api/pipelines') {
    sendJson(res, 200, {
      pipelines: listBrands().map((brand) => brandPublicView(brand)),
      active: resolveBrandId(
        (typeof req.headers['x-pipeline'] === 'string' ? req.headers['x-pipeline'] : null) ||
          url.searchParams.get('pipeline')
      )
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/auth/status') {
    sendJson(res, 200, deskAuthStatus());
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = z
        .object({
          email: z.string().min(1),
          password: z.string().min(1)
        })
        .parse(await readJsonBody(req));
      const client = req.socket.remoteAddress || 'unknown';
      const wait = loginLockoutSeconds(client);
      if (wait > 0) {
        sendJson(res, 429, { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} min.` });
        return;
      }
      const result = authenticateDeskLogin(body);
      recordLoginResult(client, result.ok);
      if (!result.ok) {
        sendJson(res, 401, { error: result.error });
        return;
      }
      const token = signDeskSession(result.user);
      sendJson(res, 200, {
        token,
        user: result.user,
        devFallback: result.devFallback
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Login failed' });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/auth/session') {
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = verifyDeskSession(bearer);
    if (!user) {
      sendJson(res, 401, { error: 'Not signed in' });
      return;
    }
    sendJson(res, 200, { user });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const experimentMatch = pathname.match(/^\/api\/episodes\/([^/]+)\/video-experiments$/);
  if (experimentMatch && (method === 'GET' || method === 'POST')) {
    const file = decodeURIComponent(experimentMatch[1]!);
    try {
      if (method === 'GET') sendJson(res, 200, await experimentStatus(file));
      else {
        const body = ExperimentActionSchema.parse(await readJsonBody(req));
        if (body.action !== 'plan') await assertJobAllowed('produce', { episodeFile: file });
        sendJson(res, body.action === 'plan' ? 200 : 202, await experimentAction(file, body));
      }
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Video experiment failed' });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'mythology-factory-ui' });
    return;
  }

  if (method === 'GET' && pathname === '/api/wan/health') {
    const { defaultVideoProviderName } = await import('../providers/videoGeneration.js');
    if (/^runway(ml)?$/i.test(defaultVideoProviderName())) {
      const { checkRunwayHealth, estimateRunwayCostUsd, runwayModel } = await import('../providers/runway.js');
      const model = runwayModel();
      const usdPerSecond = estimateRunwayCostUsd(1, model);
      try {
        const health = await checkRunwayHealth();
        sendJson(res, 200, {
          ok: true,
          provider: 'runway',
          backend: 'runway',
          model,
          message: health.message,
          ...(health.creditBalance !== undefined ? { creditBalance: health.creditBalance } : {}),
          ...(usdPerSecond !== undefined ? { usdPerSecond } : {})
        });
      } catch (error) {
        sendJson(res, 503, {
          ok: false,
          provider: 'runway',
          backend: 'runway',
          model,
          error: error instanceof Error ? error.message : String(error),
          hint: 'Set RUNWAY_API_KEY in .env (dev.runwayml.com → API keys) and add credits, then restart the server.'
        });
      }
      return;
    }
    const net = await import('node:net');
    const { planWanClipFromNarration, resolveWanResolution } = await import('../lib/wanTiming.js');
    const { inspectWanWorkflow } = await import('../lib/wanWorkflow.js');
    const { resolveWanQualityMode, wanQualityModeLabel, wanQualityModeHint } = await import(
      '../lib/wanQualityMode.js'
    );
    const { width, height } = resolveWanResolution();
    const fps = Number(process.env.WAN_COMFY_FPS || '16');
    const maxFrames = Number(process.env.WAN_COMFY_MAX_FRAMES || '129');
    const sample = planWanClipFromNarration(5, { fps, width, height, maxFrames });
    const workflowInfo = await inspectWanWorkflow();
    const qualityMode = resolveWanQualityMode();
    const localPort = (process.env.WAN_COMFY_LOCAL_PORT || '8080').trim() || '8080';
    const remotePort = (process.env.WAN_COMFY_REMOTE_PORT || localPort).trim() || localPort;
    const localPortNum = Number(localPort) || 8080;
    const comfyUrl =
      process.env.WAN_COMFY_URL?.trim() ||
      process.env.COMFYUI_URL?.trim() ||
      `http://127.0.0.1:${localPort}`;
    const sshHost = process.env.WAN_COMFY_SSH_HOST?.trim() || null;
    const sshPort = process.env.WAN_COMFY_SSH_PORT?.trim() || null;
    const sshUser = process.env.WAN_COMFY_SSH_USER?.trim() || 'root';
    const sshKey = process.env.WAN_COMFY_SSH_KEY?.trim() || '~/.ssh/id_vastai';
    const tunnelCommand =
      sshHost && sshPort
        ? `ssh -i ${sshKey} -p ${sshPort} -N -L ${localPort}:127.0.0.1:${remotePort} ${sshUser}@${sshHost}`
        : `npm run wan:tunnel:comfy`;
    const tunnelHint =
      sshHost && sshPort
        ? `npm run wan:tunnel:comfy  (= ${tunnelCommand})`
        : `Start ComfyUI on the GPU box, then: npm run wan:tunnel:comfy (Mac ${localPort} → remote ${remotePort})`;

    const tunnelOpen = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: localPortNum }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(1500, () => {
        socket.destroy();
        resolve(false);
      });
    });

    const basePayload = {
      backend: (process.env.WAN_BACKEND || 'comfy').trim().toLowerCase(),
      comfyUrl,
      localPort,
      remotePort,
      tunnelOpen,
      workflow: workflowInfo.path,
      workflowOk: workflowInfo.ok,
      workflowKind: workflowInfo.kind,
      workflowFamily: workflowInfo.family,
      workflowModels: workflowInfo.models.slice(0, 6),
      width,
      height,
      fps,
      maxFrames,
      frames: sample.frames,
      qualityMode,
      qualityModeLabel: wanQualityModeLabel(qualityMode),
      qualityModeHint: wanQualityModeHint(qualityMode),
      matchTtsDuration: true,
      sshHost,
      sshPort,
      tunnelCommand
    };

    try {
      const { wanRemoteHealth, wanBackend } = await import('../workers/wanRemote.js');
      const url = await wanRemoteHealth();
      sendJson(res, 200, {
        ...basePayload,
        ok: true,
        comfyOk: true,
        backend: wanBackend(),
        url
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      let classified = raw;
      if (!tunnelOpen) {
        classified = `No SSH tunnel on localhost:${localPort}. Run: ${tunnelCommand}`;
      } else if (/empty reply|not answering|ECONNRESET|socket hang up|other side closed/i.test(raw)) {
        classified = `SSH tunnel is open on :${localPort}, but ComfyUI is not serving on remote :${remotePort}. Start Comfy on the GPU box (same port as the forward).`;
      } else if (/unreachable|ECONNREFUSED|fetch failed/i.test(raw)) {
        classified = `Tunnel looks open but ComfyUI did not respond at ${comfyUrl}. Confirm Comfy is running on the GPU box on port ${remotePort}.`;
      }
      sendJson(res, 503, {
        ...basePayload,
        ok: false,
        comfyOk: false,
        error: classified,
        hint: tunnelHint
      });
    }
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/wan/comfy-job/')) {
    const promptId = decodeURIComponent(pathname.replace('/api/wan/comfy-job/', ''));
    try {
      const { ComfyClient, formatComfyJobError } = await import('../comfy/client.js');
      const localPort = (process.env.WAN_COMFY_LOCAL_PORT || '8080').trim() || '8080';
      const base = (
        process.env.WAN_COMFY_URL ||
        process.env.COMFYUI_URL ||
        `http://127.0.0.1:${localPort}`
      ).replace(/\/$/, '');
      const client = new ComfyClient(base);
      const history = await client.getHistory(promptId);
      const job = history[promptId];
      const reason = formatComfyJobError(promptId, job);
      sendJson(res, 200, {
        promptId,
        found: Boolean(job),
        status: job?.status?.status_str || null,
        completed: Boolean(job?.status?.completed),
        reason,
        messages: job?.status?.messages || [],
        historyUrl: `${base}/history/${promptId}`
      });
    } catch (error) {
      sendJson(res, 502, {
        promptId,
        found: false,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  const wanEpisodeMatch = pathname.match(
    /^\/api\/episodes\/([^/]+)\/wan(?:\/(status|generate|cancel))?$/
  );
  if (wanEpisodeMatch) {
    const file = decodeURIComponent(wanEpisodeMatch[1]!);
    const action = wanEpisodeMatch[2] || 'status';
    try {
      const { getWanEpisodeStatus, startWanEpisodeJob, cancelWanEpisodeJob } = await import(
        './wanJobs.js'
      );
      if (method === 'GET' && (action === 'status' || !wanEpisodeMatch[2])) {
        sendJson(res, 200, await getWanEpisodeStatus(file));
        return;
      }
      if (method === 'POST' && action === 'cancel') {
        sendJson(res, 200, await cancelWanEpisodeJob(file));
        return;
      }
      if (method === 'POST' && action === 'generate') {
        const body = (await readJsonBody(req)) as {
          mode?: 'one' | 'all' | 'retry';
          sceneId?: number;
          sceneIds?: number[];
          force?: boolean;
          videoPrompt?: string;
          videoNegativePrompt?: string;
          qualityMode?: 'quality' | 'fast';
        };
        const { parseWanQualityMode } = await import('../lib/wanQualityMode.js');
        sendJson(
          res,
          200,
          await startWanEpisodeJob({
            file,
            mode: body.mode || 'all',
            force: Boolean(body.force),
            ...(body.sceneId !== undefined ? { sceneId: body.sceneId } : {}),
            ...(body.sceneIds?.length ? { sceneIds: body.sceneIds } : {}),
            ...(body.videoPrompt ? { videoPrompt: body.videoPrompt } : {}),
            ...(body.videoNegativePrompt ? { videoNegativePrompt: body.videoNegativePrompt } : {}),
            qualityMode: parseWanQualityMode(body.qualityMode)
          })
        );
        return;
      }
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Wan job failed'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/bgm') {
    sendJson(res, 200, await listBgmLibraryForUi());
    return;
  }

  if (method === 'GET' && pathname === '/api/sfx/status') {
    const effects = (url.searchParams.get('effects') || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    sendJson(res, 200, await sfxAvailabilityForEffects(effects));
    return;
  }

  if (method === 'POST' && pathname === '/api/sfx/upload') {
    try {
      const effect = String(req.headers['x-sfx-effect'] || '').trim();
      const filename = sanitizeUploadFilename(String(req.headers['x-filename'] || 'sfx.wav'));
      if (!/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(filename)) {
        throw new Error('Upload an audio file (wav/mp3/…) for this SFX id');
      }
      const body = await readBinaryBody(req, 20 * 1024 * 1024);
      const saved = await uploadCustomSfx({
        effect,
        body,
        originalName: filename
      });
      sendJson(res, 201, {
        ...saved,
        present: true,
        note: 'Optional custom SFX saved. Mix uses it next time; missing cues are skipped without upload.'
      });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'SFX upload failed'
      });
    }
    return;
  }

  if ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/api/assets/bgm/')) {
    const relative = pathname.replace(/^\/api\/assets\/bgm\//, '');
    const absolute = await resolveBgmAsset(relative);
    if (!absolute) {
      sendText(res, 404, 'BGM not found');
      return;
    }
    await serveFileAbsolute(absolute, res, req);
    return;
  }

  if (pathname === '/api/tech-series' || pathname.startsWith('/api/tech-series/')) {
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!verifyDeskSession(header.startsWith('Bearer ') ? header.slice(7) : '')) {
      sendJson(res, 401, { error: 'Sign in to use motion studio' });
      return;
    }
    try {
      assertTechStudioBrand();
    } catch (error) {
      sendJson(res, 403, { error: error instanceof Error ? error.message : 'Tech pipeline required' });
      return;
    }
    try {
      if (pathname === '/api/tech-series' && method === 'GET') {
        sendJson(res, 200, { series: await listTechSeries() });
        return;
      }
      if (pathname === '/api/tech-series' && method === 'POST') {
        const body = z
          .object({
            id: z.string().min(2).max(64),
            title: z.string().min(1).max(90).optional(),
            series: z.unknown().optional()
          })
          .parse(await readJsonBody(req));
        if (body.series) {
          sendJson(res, 201, { series: await saveTechSeries(body.series, true) });
          return;
        }
        sendJson(res, 201, { series: await saveTechSeries(blankSeries(body.id, body.title || body.id), true) });
        return;
      }
      const seriesMatch = pathname.match(/^\/api\/tech-series\/([a-z][a-z0-9-]{1,63})$/);
      if (seriesMatch) {
        const id = seriesMatch[1]!;
        if (method === 'GET') {
          sendJson(res, 200, { series: await loadTechSeries(id) });
          return;
        }
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          sendJson(res, 200, { series: await saveTechSeries({ ...(typeof body === 'object' && body ? body : {}), id }, false) });
          return;
        }
      }
      sendJson(res, 404, { error: 'Series route not found' });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Series request failed' });
    }
    return;
  }

  if (pathname === '/api/tech-reels' || pathname.startsWith('/api/tech-reels/')) {
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!verifyDeskSession(header.startsWith('Bearer ') ? header.slice(7) : '')) {
      sendJson(res, 401, { error: 'Sign in to use motion studio' });
      return;
    }
    try {
      assertTechStudioBrand();
    } catch (error) {
      sendJson(res, 403, { error: error instanceof Error ? error.message : 'Tech pipeline required' });
      return;
    }
    try {
      if (pathname === '/api/tech-reels/template' && method === 'GET') {
        sendJson(res, 200, buildTechReelScriptBundle(url.searchParams.get('topic') || '{{TOPIC}}'));
        return;
      }
      if (pathname === '/api/tech-reels/scenes' && method === 'GET') {
        const id = url.searchParams.get('id');
        if (id) {
          sendJson(res, 200, await readSceneTemplateSource(id));
          return;
        }
        sendJson(res, 200, { templates: await listRegisteredTemplates() });
        return;
      }
      if (pathname === '/api/tech-reels/scenes/format' && method === 'POST') {
        const body = z.object({ source: z.string().min(1).max(250_000) }).parse(await readJsonBody(req));
        sendJson(res, 200, await formatSceneTsx(body.source));
        return;
      }
      if (pathname === '/api/tech-reels/scenes/scaffold' && method === 'POST') {
        const body = z.object({ id: z.string().min(3).max(64) }).parse(await readJsonBody(req));
        sendJson(res, 201, await scaffoldSceneTemplate(body.id));
        return;
      }
      if (pathname === '/api/tech-reels/scenes' && method === 'POST') {
        const body = z
          .object({
            id: z.string().min(3).max(64),
            source: z.string().min(1).max(250_000),
            title: z.string().max(90).optional(),
            llm: z.string().max(400).optional(),
            overwrite: z.boolean().optional()
          })
          .parse(await readJsonBody(req));
        sendJson(res, 201, await publishSceneTemplate(body));
        return;
      }
      if (pathname === '/api/tech-reels/scenes/preview' && method === 'POST') {
        const body = z
          .object({
            id: z.string().min(3).max(64),
            headline: z.string().max(64).optional(),
            subhead: z.string().max(90).optional(),
            chapter: z.string().max(32).optional(),
            scale: z.number().min(0.2).max(1).optional(),
            force: z.boolean().optional()
          })
          .parse(await readJsonBody(req));
        const still = await renderSceneTemplateStill({
          templateId: body.id,
          headline: body.headline,
          subhead: body.subhead,
          chapter: body.chapter,
          scale: body.scale,
          force: body.force
        });
        sendJson(res, 200, {
          id: body.id,
          url: `${still.mediaUrl}?v=${Date.now()}`,
          frame: still.frame,
          cached: still.cached
        });
        return;
      }
      if (pathname === '/api/tech-reels' && method === 'GET') {
        sendJson(res, 200, { reels: await listTechReels() });
        return;
      }
      if (pathname === '/api/tech-reels' && method === 'POST') {
        const body = z.object({ id: z.string(), reel: z.unknown() }).parse(await readJsonBody(req));
        sendJson(res, 201, { reel: await saveTechReel(body.id, body.reel, true) });
        return;
      }
      const match = pathname.match(/^\/api\/tech-reels\/([a-zA-Z0-9_-]+)(\/(render|attach))?$/);
      if (match) {
        const id = match[1]!;
        const action = match[3];
        if (!action && method === 'GET') {
          sendJson(res, 200, await techReelDetail(id));
          return;
        }
        if (!action && method === 'PUT') {
          sendJson(res, 200, { reel: await saveTechReel(id, await readJsonBody(req)) });
          return;
        }
        if (action === 'render' && method === 'POST') {
          const body = z
            .object({ provider: z.enum(['edge', 'elevenlabs']), silent: z.boolean().default(false), episodeId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional() })
            .parse(await readJsonBody(req));
          sendJson(res, 202, { job: await startTechReelRender(id, body.provider, body.silent, body.episodeId) });
          return;
        }
        if (action === 'attach' && method === 'POST') {
          const body = z.object({ episodeId: z.string().min(1).max(120) }).parse(await readJsonBody(req));
          sendJson(res, 200, await attachTechReelToEpisode(id, body.episodeId));
          return;
        }
      }
      sendJson(res, 404, { error: 'Motion studio route not found' });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Motion studio request failed' });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/episodes') {
    sendJson(res, 200, { episodes: await listEpisodes() });
    return;
  }

  if (method === 'GET' && pathname === '/api/episodes/template') {
    const topic = url.searchParams.get('topic')?.trim() || undefined;
    const bundle = buildScriptBundle(currentBrandId(), topic || '{{TOPIC}}', url.searchParams.get('format') === 'legacy' ? 'legacy' : 'default');
    sendJson(res, 200, {
      brandId: bundle.brandId,
      downloadStem: bundle.downloadStem,
      template: bundle.template,
      fieldGuide: bundle.fieldGuide,
      llmPrompt: bundle.llmPrompt,
      notes: bundle.notes
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/episodes/import') {
    try {
      const body = z
        .object({
          episode: z.unknown().optional(),
          dryRun: z.boolean().optional()
        })
        .passthrough()
        .parse(await readJsonBody(req));
      const raw =
        body.episode !== undefined
          ? body.episode
          : (() => {
              const { dryRun: _dryRun, ...rest } = body;
              return rest;
            })();
      const result = await importEpisodeJson(raw, {
        dryRun: body.dryRun === true,
        brandId: resolveBrandId(
          (typeof req.headers['x-pipeline'] === 'string' ? req.headers['x-pipeline'] : null) ||
            url.searchParams.get('pipeline')
        )
      });
      sendJson(res, body.dryRun ? 200 : 201, {
        ok: true,
        file: result.file,
        episode: result.episode,
        budget: result.budget,
        dryRun: result.dryRun,
        ...(result.idRenamedFrom ? { idRenamedFrom: result.idRenamedFrom } : {})
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Import failed',
        issues: formatImportIssues(error)
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/connections') {
    sendJson(res, 200, { connections: publishConnectionSetup() });
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/instagram-media') {
    const episodeId = url.searchParams.get('episodeId') || undefined;
    sendJson(res, 200, { hosting: instagramMediaHostingStatus(episodeId || undefined) });
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/instagram-auth') {
    try {
      sendJson(res, 200, instagramAuthSetup(currentBrandId()));
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Instagram auth setup failed' });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/instagram-auth/start') {
    try {
      const brandId = resolveBrandId(url.searchParams.get('pipeline') || currentBrandId());
      const setup = instagramAuthSetup(brandId);
      if (!setup.ready || !setup.authUrl) {
        sendText(
          res,
          400,
          `Instagram OAuth not configured. Add ${setup.missing.join(', ') || 'INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET'} to .env, then restart Desk.`
        );
        return;
      }
      res.writeHead(302, { Location: setup.authUrl });
      res.end();
    } catch (error) {
      sendText(res, 400, error instanceof Error ? error.message : 'Instagram auth start failed');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/instagram-oauth/callback') {
    try {
      const err = url.searchParams.get('error');
      const errDesc = url.searchParams.get('error_description');
      if (err) {
        sendText(res, 400, `OAuth error: ${err}${errDesc ? ` — ${errDesc}` : ''}`);
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        sendText(res, 400, 'Missing code in Instagram callback');
        return;
      }
      const oauthState = verifyInstagramOAuthState(url.searchParams.get('state'));
      const tokens = await completeInstagramOAuth(code);
      const saved = await persistInstagramLoginTokens({
        accessToken: tokens.accessToken,
        userId: tokens.userId,
        brandId: oauthState.brandId,
        ...(tokens.username ? { accountName: tokens.username } : {}),
        ...(tokens.expiresIn != null ? { expiresIn: tokens.expiresIn } : {})
      });
      const who = tokens.username ? `@${tokens.username}` : `user ${tokens.userId}`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html><head><title>Instagram connected</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:36rem;line-height:1.5">
  <h1>Instagram connected</h1>
  <p>Signed in as <strong>${who}</strong> for pipeline <strong>${saved.brandId}</strong>.</p>
  <p>Tokens saved to <code>${saved.envPath.replace(ROOT + '/', '')}</code> (not shared across pipelines).</p>
  <p>Return to Desk → Publish → <strong>Re-check connections</strong>.</p>
  <p><a href="/">Back to Desk</a></p>
  <script>try{window.opener&&window.opener.postMessage({type:'instagram-auth-ok',brandId:${JSON.stringify(saved.brandId)}},'*')}catch(e){}</script>
</body></html>`);
    } catch (error) {
      sendText(res, 500, error instanceof Error ? error.message : 'Instagram OAuth failed');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/youtube-auth/start') {
    try {
      const brandId = resolveBrandId(url.searchParams.get('pipeline') || currentBrandId());
      const setup = youtubeAuthSetup(brandId);
      if (!setup.ready || !setup.authUrl) {
        sendText(
          res,
          400,
          `YouTube OAuth not configured. Add ${setup.missing.join(', ') || 'YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET'} to .env, then restart Desk. Also add redirect URI: ${setup.redirectUri}`
        );
        return;
      }
      // Reuse EpicAstra/CLI redirect (YOUTUBE_REDIRECT_URI) — start sidecar listener if needed.
      await ensureYoutubeOAuthCallbackServer();
      res.writeHead(302, { Location: setup.authUrl });
      res.end();
    } catch (error) {
      sendText(res, 400, error instanceof Error ? error.message : 'YouTube auth start failed');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/publish/youtube-oauth/callback') {
    try {
      const err = url.searchParams.get('error');
      const errDesc = url.searchParams.get('error_description');
      if (err) {
        sendText(res, 400, `OAuth error: ${err}${errDesc ? ` — ${errDesc}` : ''}`);
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        sendText(res, 400, 'Missing code in YouTube callback');
        return;
      }
      const oauthState = verifyYoutubeOAuthState(url.searchParams.get('state'));
      const redirectUri = youtubeDeskRedirectUri();
      const tokens = await exchangeYoutubeAuthCode(code, redirectUri);
      if (!tokens.refresh_token) {
        sendText(
          res,
          500,
          'No refresh_token returned. Revoke this Google app at https://myaccount.google.com/permissions then Authorize YouTube again.'
        );
        return;
      }
      let accountName: string | undefined;
      if (tokens.access_token) {
        try {
          accountName = await fetchYoutubeChannelTitle(tokens.access_token);
        } catch {
          accountName = undefined;
        }
      }
      const filePath = persistYoutubeVaultTokens({
        brandId: oauthState.brandId,
        refreshToken: tokens.refresh_token,
        ...(accountName ? { accountName } : {}),
        ...(process.env.YOUTUBE_CLIENT_ID?.trim()
          ? { clientId: process.env.YOUTUBE_CLIENT_ID.trim() }
          : {}),
        ...(process.env.YOUTUBE_CLIENT_SECRET?.trim()
          ? { clientSecret: process.env.YOUTUBE_CLIENT_SECRET.trim() }
          : {})
      });
      const who = accountName || 'YouTube channel';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html><head><title>YouTube connected</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:36rem;line-height:1.5">
  <h1>YouTube connected</h1>
  <p>Signed in as <strong>${who}</strong> for pipeline <strong>${oauthState.brandId}</strong>.</p>
  <p>Refresh token saved to <code>${filePath.replace(ROOT + '/', '')}</code> (not shared across pipelines).</p>
  <p>Return to Desk → Publish → <strong>Re-check connections</strong>.</p>
  <p><a href="/">Back to Desk</a></p>
  <script>try{window.opener&&window.opener.postMessage({type:'youtube-auth-ok',brandId:${JSON.stringify(oauthState.brandId)}},'*')}catch(e){}</script>
</body></html>`);
    } catch (error) {
      sendText(res, 500, error instanceof Error ? error.message : 'YouTube OAuth failed');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/tts/voices') {
    try {
      const provider = (url.searchParams.get('provider') || 'elevenlabs').toLowerCase();
      if (provider === 'sarvam') {
        sendJson(res, 200, await listSarvamVoiceOptions());
        return;
      }
      const includeAccount = url.searchParams.get('account') !== '0';
      const forParam = (url.searchParams.get('for') || '').toLowerCase();
      const forBrand =
        forParam === 'tech' || forParam === 'mythology' || forParam === 'all'
          ? (forParam as 'tech' | 'mythology' | 'all')
          : undefined;
      sendJson(res, 200, await listElevenLabsVoiceOptions(includeAccount, forBrand ? { forBrand } : undefined));
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to list voices' });
    }
    return;
  }

  /** Free ElevenLabs sample audio (CDN) — no TTS character cost. */
  const voicePreviewMatch = pathname.match(/^\/api\/tts\/voices\/([^/]+)\/preview$/i);
  if (method === 'GET' && voicePreviewMatch) {
    try {
      const voiceId = decodeURIComponent(voicePreviewMatch[1]!);
      const { resolveElevenLabsVoicePreviewUrl } = await import('../lib/elevenlabsVoices.js');
      const previewUrl = await resolveElevenLabsVoicePreviewUrl(voiceId);
      if (!previewUrl) {
        sendJson(res, 404, { error: 'No free preview sample for this voice' });
        return;
      }
      const upstream = await fetch(previewUrl, { signal: AbortSignal.timeout(30000) });
      if (!upstream.ok) {
        sendJson(res, 502, { error: `Preview upstream ${upstream.status}` });
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      // Upstream sometimes returns text/plain for mp3/wav — sniff so <audio> will play.
      let contentType = upstream.headers.get('content-type') || '';
      if (!/^audio\//i.test(contentType)) {
        if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
          contentType = 'audio/wav';
        } else if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3') {
          contentType = 'audio/mpeg';
        } else if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) {
          contentType = 'audio/mpeg';
        } else {
          contentType = 'audio/mpeg';
        }
      }
      res.writeHead(200, {
        'content-type': contentType.split(';')[0]!.trim(),
        'content-length': buffer.length,
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*'
      });
      res.end(buffer);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to load voice preview'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/publish/connections/test') {
    const body = z
      .object({
        platforms: z
          .array(z.enum(['youtube', 'instagram', 'facebook']))
          .min(1)
          .optional()
      })
      .parse(await readJsonBody(req));
    sendJson(res, 200, {
      connections: await testPublishConnections(body.platforms, currentBrandId())
    });
    return;
  }

  const episodeMatch = pathname.match(/^\/api\/episodes\/([^/]+\.json)$/i);
  if (method === 'GET' && episodeMatch) {
    const file = decodeURIComponent(episodeMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      const language = url.searchParams.get('language');
      const packaging = await loadPackaging(
        detail.episode.id,
        language === 'hi' || language === 'en' ? language : undefined
      );
      sendJson(res, 200, { ...detail, packaging });
    } catch (error) {
      sendJson(res, 404, { error: error instanceof Error ? error.message : 'Not found' });
    }
    return;
  }

  const audioUploadMatch = pathname.match(/^\/api\/episodes\/([^/]+\.json)\/media\/audio$/i);
  if (method === 'POST' && audioUploadMatch) {
    let destination: string | undefined;
    try {
      const detail = await getEpisodeDetail(decodeURIComponent(audioUploadMatch[1]!));
      await assertEpisodeNotPublished(detail.episode.id, 'voice upload');
      if (String(req.headers['x-episode-id'] || '') !== detail.episode.id) throw new Error('Episode id mismatch');
      const filename = sanitizeUploadFilename(String(req.headers['x-filename'] || 'voice.mp3'));
      if (!/\.(mp3|wav)$/i.test(filename)) throw new Error('Upload an MP3 or WAV narration');
      const body = await readBinaryBody(req, 100 * 1024 * 1024);
      if (!body.length) throw new Error('Empty audio upload');
      const relative = `audio/${detail.episode.id}-uploaded-voice-${randomUUID()}${path.extname(filename)}`;
      destination = resolveInside(outputDir(), relative) || undefined;
      if (!destination) throw new Error('Invalid audio destination');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, body);
      const audio = await probeAudio(destination);
      if (!audio.sampleRate) throw new Error('This file does not contain a readable audio stream');
      await writeFile(`${destination}.source.json`, JSON.stringify({ provider: 'uploaded-voice', originalName: filename, episodeId: detail.episode.id }));
      sendJson(res, 201, { path: relative, url: `/api/media/${relative}`, name: filename, durationSeconds: audio.durationSeconds });
    } catch (error) {
      if (destination) await rm(destination, { force: true });
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Voice upload failed' });
    }
    return;
  }

  const episodeVideoUploadMatch = pathname.match(
    /^\/api\/episodes\/([^/]+\.json)\/media\/video$/i
  );
  if (method === 'POST' && episodeVideoUploadMatch) {
    const file = decodeURIComponent(episodeVideoUploadMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      await assertEpisodeNotPublished(detail.episode.id, 'video upload');
      const headerEpisodeId = String(req.headers['x-episode-id'] || '').trim();
      if (headerEpisodeId && headerEpisodeId !== detail.episode.id) {
        throw new Error(
          `Episode id mismatch: header "${headerEpisodeId}" vs script "${detail.episode.id}"`
        );
      }
      const filename = sanitizeUploadFilename(String(req.headers['x-filename'] || 'upload.mp4'));
      if (!/\.(mp4|mov|webm|m4v)$/i.test(filename)) {
        throw new Error('Only mp4 / mov / webm / m4v uploads are allowed');
      }
      const maxBytes = Number(process.env.EXTERNAL_VIDEO_MAX_BYTES || 500 * 1024 * 1024);
      const body = await readBinaryBody(req, Number.isFinite(maxBytes) ? maxBytes : 500 * 1024 * 1024);
      if (!body.length) throw new Error('Empty video upload');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeExt = path.extname(filename) || '.mp4';
      const destRel = `external/${detail.episode.id}/source-${stamp}${safeExt}`;
      assertExternalVideoPath(destRel, detail.episode.id);
      const destAbs = resolveInside(outputDir(), destRel);
      if (!destAbs) throw new Error('Invalid upload destination');
      await mkdir(path.dirname(destAbs), { recursive: true });
      await writeFile(destAbs, body);
      await writeFile(
        `${destAbs}.source.json`,
        `${JSON.stringify(
          {
            provider: 'upload',
            episodeId: detail.episode.id,
            episodeFile: file,
            originalName: filename,
            uploadedAt: new Date().toISOString(),
            bytes: body.length
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const relative = toOutputRelative(destAbs) || destRel;
      sendJson(res, 201, {
        ok: true,
        episodeId: detail.episode.id,
        path: relative,
        url: `/api/media/${relative}`,
        name: path.basename(relative)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Video upload failed'
      });
    }
    return;
  }

  const episodeClipUploadMatch = pathname.match(
    /^\/api\/episodes\/([^/]+\.json)\/media\/clip$/i
  );
  if (method === 'POST' && episodeClipUploadMatch) {
    const file = decodeURIComponent(episodeClipUploadMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      await assertEpisodeNotPublished(detail.episode.id, 'scene clip upload');
      const headerEpisodeId = String(req.headers['x-episode-id'] || '').trim();
      if (headerEpisodeId && headerEpisodeId !== detail.episode.id) {
        throw new Error(
          `Episode id mismatch: header "${headerEpisodeId}" vs script "${detail.episode.id}"`
        );
      }
      const sceneRaw = String(req.headers['x-scene-id'] || url.searchParams.get('scene') || '').trim();
      const sceneId = Number(sceneRaw);
      if (!sceneRaw || !Number.isInteger(sceneId) || sceneId < -1) {
        throw new Error('Choose a scene, opening hook (0), or ending (-1)');
      }
      if (!detail.visualTimeline.some((scene) => scene.id === sceneId)) {
        throw new Error(`Scene ${sceneId} is not in this episode`);
      }
      const filename = sanitizeUploadFilename(String(req.headers['x-filename'] || 'scene-clip.mp4'));
      if (!/\.(mp4|mov|webm|m4v)$/i.test(filename)) {
        throw new Error('Only mp4 / mov / webm / m4v uploads are allowed');
      }
      const maxBytes = Number(process.env.EXTERNAL_VIDEO_MAX_BYTES || 500 * 1024 * 1024);
      const body = await readBinaryBody(req, Number.isFinite(maxBytes) ? maxBytes : 500 * 1024 * 1024);
      if (!body.length) throw new Error('Empty clip upload');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeExt = path.extname(filename) || '.mp4';
      const slotName = sceneId === 0 ? 'hook' : sceneId === -1 ? 'ending' : String(sceneId);
      const destRel = `ai-video/${detail.episode.id}/clips/upload/scene-${slotName}-upload-${stamp}-${randomUUID().slice(0, 8)}${safeExt}`;
      const destAbs = resolveInside(outputDir(), destRel);
      if (!destAbs) throw new Error('Invalid upload destination');
      await mkdir(path.dirname(destAbs), { recursive: true });
      await writeFile(destAbs, body);
      await writeFile(
        `${destAbs}.source.json`,
        `${JSON.stringify(
          {
            provider: 'upload',
            kind: 'scene-clip',
            sceneId,
            episodeId: detail.episode.id,
            episodeFile: file,
            originalName: filename,
            uploadedAt: new Date().toISOString(),
            bytes: body.length
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const relative = toOutputRelative(destAbs) || destRel;
      sendJson(res, 201, {
        ok: true,
        episodeId: detail.episode.id,
        sceneId,
        path: relative,
        url: `/api/media/${relative}`,
        name: path.basename(relative)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Scene clip upload failed'
      });
    }
    return;
  }

  const episodeStillUploadMatch = pathname.match(
    /^\/api\/episodes\/([^/]+\.json)\/media\/still$/i
  );
  if (method === 'POST' && episodeStillUploadMatch) {
    const file = decodeURIComponent(episodeStillUploadMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      await assertEpisodeNotPublished(detail.episode.id, 'scene still upload');
      const headerEpisodeId = String(req.headers['x-episode-id'] || '').trim();
      if (headerEpisodeId && headerEpisodeId !== detail.episode.id) {
        throw new Error(
          `Episode id mismatch: header "${headerEpisodeId}" vs script "${detail.episode.id}"`
        );
      }
      const sceneRaw = String(req.headers['x-scene-id'] || url.searchParams.get('scene') || '').trim();
      const sceneId = Number(sceneRaw);
      if (!sceneRaw || !Number.isInteger(sceneId) || sceneId < -1) {
        throw new Error('Choose a scene, opening hook (0), or ending (-1)');
      }
      const knownScene =
        detail.visualTimeline.some((scene) => scene.id === sceneId) ||
        detail.episode.scenes.some((scene) => scene.id === sceneId) ||
        (sceneId === 0 && Boolean(detail.episode.spokenHook)) ||
        sceneId === -1;
      if (!knownScene) {
        throw new Error(`Scene ${sceneId} is not in this episode`);
      }
      const filename = sanitizeUploadFilename(String(req.headers['x-filename'] || 'scene-still.png'));
      if (!/\.(png|jpe?g|webp)$/i.test(filename)) {
        throw new Error('Only png / jpg / webp stills are allowed');
      }
      const maxBytes = Number(process.env.SCENE_STILL_MAX_BYTES || 25 * 1024 * 1024);
      const body = await readBinaryBody(req, Number.isFinite(maxBytes) ? maxBytes : 25 * 1024 * 1024);
      if (!body.length) throw new Error('Empty still upload');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeExt = path.extname(filename).toLowerCase() || '.png';
      const slotName = sceneId === 0 ? 'hook' : sceneId === -1 ? 'ending' : String(sceneId);
      const destRel = `images/${detail.episode.id}/scene-${slotName}-upload-${stamp}-${randomUUID().slice(0, 8)}${safeExt}`;
      const destAbs = resolveInside(outputDir(), destRel);
      if (!destAbs) throw new Error('Invalid upload destination');
      await mkdir(path.dirname(destAbs), { recursive: true });
      await writeFile(destAbs, body);
      await writeFile(
        `${destAbs}.source.json`,
        `${JSON.stringify(
          {
            provider: 'upload',
            kind: 'scene-still',
            sceneId,
            episodeId: detail.episode.id,
            episodeFile: file,
            originalName: filename,
            uploadedAt: new Date().toISOString(),
            bytes: body.length
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const relative = toOutputRelative(destAbs) || destRel;
      sendJson(res, 201, {
        ok: true,
        episodeId: detail.episode.id,
        sceneId,
        path: relative,
        url: `/api/media/${relative}`,
        name: path.basename(relative)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Scene still upload failed'
      });
    }
    return;
  }

  if (method === 'DELETE' && episodeMatch) {
    const file = decodeURIComponent(episodeMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      await assertEpisodeNotPublished(detail.episode.id, 'delete');
      const body = z
        .object({ keepAssets: z.boolean().optional() })
        .parse(await readJsonBody(req));
      const keepAssets =
        body.keepAssets === true || url.searchParams.get('keepAssets') === '1';
      const result = await deleteEpisode(file, { keepAssets });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Failed to delete episode'
      });
    }
    return;
  }

  const imagePromptsMatch = pathname.match(/^\/api\/episodes\/([^/]+)\/image-prompts$/);
  if (method === 'GET' && imagePromptsMatch) {
    const file = decodeURIComponent(imagePromptsMatch[1]!);
    try {
      sendJson(res, 200, await buildImagePromptsForEpisode(file));
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Failed to build image prompts'
      });
    }
    return;
  }

  if (method === 'PUT' && imagePromptsMatch) {
    const file = decodeURIComponent(imagePromptsMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      await assertEpisodeNotPublished(detail.episode.id, 'image prompt edits');
      const body = await readJsonBody(req);
      sendJson(res, 200, await saveVisualPrompts(file, body));
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Failed to save visual prompts'
      });
    }
    return;
  }

  const titlesMatch = pathname.match(/^\/api\/episodes\/([^/]+)\/packaging\/titles$/);
  if (method === 'POST' && titlesMatch) {
    try {
      const detail = await getEpisodeDetail(decodeURIComponent(titlesMatch[1]!));
      const body = z.object({ language: z.enum(['hi', 'en']), target: z.enum(['all', 'youtube', 'instagram', 'facebook']), sharedOnly: z.boolean().default(false) }).parse(await readJsonBody(req));
      const packaging = await applyJsonTitles(EpisodeSchema.parse(detail.episode), body.language, body.target, body.sharedOnly);
      sendJson(res, 200, { packaging });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Could not apply titles' });
    }
    return;
  }
  const packagingMatch = pathname.match(/^\/api\/episodes\/([^/]+)\/packaging$/);
  if (method === 'GET' && packagingMatch) {
    const file = decodeURIComponent(packagingMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      const language = url.searchParams.get('language');
      const packaging = await loadPackaging(
        detail.episode.id,
        language === 'hi' || language === 'en' ? language : undefined
      );
      if (!packaging) {
        sendJson(res, 404, { error: 'No packaging yet. Run npm run package.' });
        return;
      }
      sendJson(res, 200, { packaging });
    } catch (error) {
      sendJson(res, 404, { error: error instanceof Error ? error.message : 'Not found' });
    }
    return;
  }

  if (method === 'PUT' && packagingMatch) {
    const file = decodeURIComponent(packagingMatch[1]!);
    try {
      const detail = await getEpisodeDetail(file);
      // Packaging may still be edited after a partial publish (e.g. YouTube done, Meta pending).
      const body = PackagingPatchSchema.parse(await readJsonBody(req));
      const packaging = await updatePlatformPack(detail.episode.id, body.language, body.platform, {
        title: body.title,
        description: body.description,
        tags: body.tags,
        hashtags: body.hashtags,
        cta: body.cta
      });
      sendJson(res, 200, { packaging });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Invalid packaging patch'
      });
    }
    return;
  }

  const reviewMatch = pathname.match(/^\/api\/episodes\/([^/]+)\/review$/);
  if (method === 'PUT' && reviewMatch) {
    const file = decodeURIComponent(reviewMatch[1]!);
    try {
      const body = ReviewBodySchema.parse(await readJsonBody(req));
      await assertEpisodeNotPublished(body.episodeId, 'review edits');
      const review = await saveReview({
        episodeFile: file,
        episodeId: body.episodeId,
        claimVerdicts: body.claimVerdicts,
        approvals: body.approvals,
        reviewerNotes: body.reviewerNotes,
        ...(body.selected
          ? {
              selected: {
                ...(body.selected.sceneVisuals ? { sceneVisuals: body.selected.sceneVisuals } : {}),
                ...(body.selected.burnSubtitles !== undefined ? { burnSubtitles: body.selected.burnSubtitles } : {}),
                ...(body.selected.audio ? { audio: body.selected.audio } : {}),
                ...(body.selected.images ? { images: body.selected.images } : {}),
                ...(body.selected.clips ? { clips: body.selected.clips } : {}),
                ...(body.selected.final ? { final: body.selected.final } : {}),
                ...(body.selected.externalVideo
                  ? { externalVideo: body.selected.externalVideo }
                  : {})
              }
            }
          : {})
      });
      sendJson(res, 200, { review });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid review' });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs') {
    try {
      const body = JobBodySchema.parse(await readJsonBody(req));
      await assertJobAllowed(body.kind as JobKind, {
        ...(body.episodeFile !== undefined ? { episodeFile: body.episodeFile } : {}),
        ...(body.episodeId !== undefined ? { episodeId: body.episodeId } : {})
      });
      const result = await runJob(body.kind as JobKind, {
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.episodeFile !== undefined ? { episodeFile: body.episodeFile } : {}),
        ...(body.episodeId !== undefined ? { episodeId: body.episodeId } : {}),
        ...(body.provider !== undefined ? { provider: body.provider } : {}),
        ...(body.scene !== undefined ? { scene: body.scene } : {}),
        ...(body.scenes !== undefined ? { scenes: body.scenes } : {}),
        ...(body.feedback !== undefined ? { feedback: body.feedback } : {}),
        ...(body.action !== undefined ? { action: body.action } : {}),
        ...(body.platforms !== undefined ? { platforms: body.platforms } : {}),
        ...(body.dryRun !== undefined ? { dryRun: body.dryRun } : {}),
        ...(body.force !== undefined ? { force: body.force } : {}),
        ...(body.reuseAi !== undefined ? { reuseAi: body.reuseAi } : {}),
        ...(body.focus !== undefined ? { focus: body.focus } : {}),
        ...(body.count !== undefined ? { count: body.count } : {}),
        ...(body.imageProvider !== undefined ? { imageProvider: body.imageProvider } : {}),
        ...(body.skipCovers !== undefined ? { skipCovers: body.skipCovers } : {}),
        ...(body.videoPath !== undefined ? { videoPath: body.videoPath } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
        ...(body.requirePackaging !== undefined ? { requirePackaging: body.requirePackaging } : {}),
        ...(body.voiceId !== undefined ? { voiceId: body.voiceId } : {}),
        ...(body.voiceIdB !== undefined ? { voiceIdB: body.voiceIdB } : {}),
        ...(body.motion !== undefined ? { motion: body.motion } : {}),
        ...(body.ffmpegEffects !== undefined ? { ffmpegEffects: body.ffmpegEffects } : {}),
        ...(body.techEngine !== undefined ? { techEngine: body.techEngine } : {}),
        ...(body.audio !== undefined ? { audio: body.audio } : {}),
        ...(body.effects !== undefined ? { effects: body.effects } : {}),
        ...(body.elevenlabsSfx !== undefined ? { elevenlabsSfx: body.elevenlabsSfx } : {}),
        ...(body.bgm !== undefined ? { bgm: body.bgm } : {}),
        ...(body.frameVariant !== undefined ? { frameVariant: body.frameVariant } : {}),
        ...(body.metaFormats !== undefined ? { metaFormats: body.metaFormats } : {}),
        ...(body.scheduleAt !== undefined ? { scheduleAt: body.scheduleAt } : {})
      });
      sendJson(res, result.ok ? 200 : 500, result);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid job' });
    }
    return;
  }

  if ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/api/media/')) {
    await serveMedia(pathname, res, req);
    return;
  }

  if (method === 'GET' && pathname === '/api/schedules') {
    const episodeId = url.searchParams.get('episodeId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const schedules = await listSchedules({
      ...(episodeId ? { episodeId } : {}),
      ...(status === 'pending' ||
      status === 'running' ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled'
        ? { status }
        : {})
    });
    sendJson(res, 200, { schedules });
    return;
  }

  if (method === 'POST' && pathname === '/api/schedules/process-due') {
    try {
      const result = await processDueSchedules();
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to process schedules'
      });
    }
    return;
  }

  const scheduleCancelMatch = pathname.match(/^\/api\/schedules\/([^/]+)\/cancel$/);
  if (method === 'POST' && scheduleCancelMatch) {
    try {
      const id = decodeURIComponent(scheduleCancelMatch[1]!);
      const schedule = await cancelSchedule(id);
      sendJson(res, 200, { schedule });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Failed to cancel schedule'
      });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

/** Routes that must stay reachable without a Desk session (Meta/OAuth call them, not the operator). */
const PUBLIC_API = new Set(['/api/webhooks/meta', '/api/auth/login', '/api/auth/logout']);
const EXTERNAL_API = /^\/api\/(webhooks\/meta|publish\/(instagram|youtube)-oauth\/callback)$/;

function allowedHosts(): Set<string> {
  const extra = (process.env.DESK_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(['localhost', '127.0.0.1', '[::1]', HOST.toLowerCase(), ...extra]);
}

/**
 * Blocks DNS-rebinding (unknown Host header) and unauthenticated writes. Every
 * non-GET API call needs a valid Desk session, so a random web page cannot POST
 * to localhost and trigger jobs or publishes.
 */
function guardApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
  if (!EXTERNAL_API.test(url.pathname)) {
    const hostname = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (!allowedHosts().has(hostname)) {
      sendJson(res, 403, { error: 'Host not allowed. Add it to DESK_ALLOWED_HOSTS.' });
      return false;
    }
  }
  const method = req.method || 'GET';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || PUBLIC_API.has(url.pathname)) {
    return true;
  }
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!verifyDeskSession(header.startsWith('Bearer ') ? header.slice(7).trim() : '')) {
    sendJson(res, 401, { error: 'Sign in to the Desk first.' });
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const brandId: BrandId = resolveBrandId(
      (typeof req.headers['x-pipeline'] === 'string' ? req.headers['x-pipeline'] : null) ||
        url.searchParams.get('pipeline')
    );

    if (url.pathname.startsWith('/api/')) {
      if (!guardApi(req, res, url)) return;
      await runWithBrandAsync(brandId, () => handleApi(req, res, url));
      return;
    }

    const served = await serveStatic(url.pathname, res);
    if (!served) {
      sendText(
        res,
        503,
        'UI not built yet. Run: npm run ui:build\nThen open this URL again, or use npm run ui:dev during development.'
      );
    }
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error' });
  }
});

const generatedPassword = bootstrapDeskPassword();
if (generatedPassword) {
  console.log(
    `\nDesk login created. Email: any${process.env.DESK_AUTH_EMAIL ? ` (${process.env.DESK_AUTH_EMAIL})` : ''}  Password: ${generatedPassword}\n` +
      'Shown once. Set DESK_AUTH_PASSWORD_HASH (npm run desk:password) to choose your own.\n'
  );
}

server.listen(PORT, HOST, () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  console.log(`Mythology Factory review UI → http://${HOST}:${PORT}`);
  console.log(`API root ${here} · episodes from data/episodes · reviews in data/reviews`);
});

const schedulePollMs = Number(process.env.PUBLISH_SCHEDULE_POLL_MS || '60000');
if (Number.isFinite(schedulePollMs) && schedulePollMs >= 15_000) {
  setInterval(() => {
    void processDueSchedules()
      .then((result) => {
        if (result.processed.length) {
          console.log(`[schedules] processed ${result.processed.join(', ')}`);
        }
        for (const row of result.errors) {
          console.error(`[schedules] ${row.id}: ${row.error}`);
        }
      })
      .catch((error) => {
        console.error(
          `[schedules] poll failed: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }, schedulePollMs).unref?.();
  console.log(`Publish schedule poller every ${Math.round(schedulePollMs / 1000)}s`);
}
