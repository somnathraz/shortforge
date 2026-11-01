import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { LEGACY_ENV_BRAND_ID, type BrandId, currentBrandId } from '../lib/brands.js';
import {
  getFacebookVaultEntry,
  getInstagramVaultEntry
} from '../lib/publishConnections.js';
import { resolveInstagramVideoPublicUrl } from '../lib/s3PublishMedia.js';
import { probeAudioDuration } from '../audio/ffprobe.js';

/** Instagram Stories reject videos longer than ~60s (Reels allow longer). */
const INSTAGRAM_STORY_MAX_SECONDS = Number(process.env.INSTAGRAM_STORY_MAX_SECONDS || '59.5');

export type MetaUploadInput = {
  videoPath: string;
  caption: string;
  title?: string;
  episodeId?: string;
  /** Per-job override; falls back to META_PUBLISH_REEL / META_PUBLISH_STORY. */
  publishFormats?: {
    reel?: boolean;
    story?: boolean;
  };
  /** Facebook Reel native schedule (unix seconds). Stories are not scheduled via Graph. */
  scheduledPublishTime?: Date | string | number;
};

export type MetaFormatKind = 'reel' | 'story';

export type MetaFormatResult = {
  kind: MetaFormatKind;
  id: string;
  url?: string;
};

export type MetaUploadResult = {
  platform: 'facebook' | 'instagram';
  id: string;
  url?: string;
  formats?: MetaFormatResult[];
  errors?: string[];
};

/** Instagram Login path (graph.instagram.com) vs Facebook Login / Page path (graph.facebook.com). */
export type InstagramAuthMode = 'instagram_login' | 'facebook_login';

export type InstagramCredentials = {
  mode: InstagramAuthMode;
  token: string;
  userId: string;
  graphBase: string;
};

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function envFlag(name: string, defaultValue = true): boolean {
  const raw = trimEnv(name);
  if (!raw) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

function facebookGraphBase(): string {
  const version = trimEnv('META_GRAPH_VERSION') || 'v21.0';
  return `https://graph.facebook.com/${version}`;
}

function graphVersion(): string {
  return trimEnv('META_GRAPH_VERSION') || 'v21.0';
}

function withGraphVersion(baseRaw: string, version: string): string {
  const base = baseRaw.replace(/\/$/, '');
  if (/\/v\d+\.\d+$/i.test(base)) return base;
  return `${base}/${version}`;
}

function metaUploadTimeoutMs(): number {
  return Number(process.env.META_UPLOAD_TIMEOUT_MS || '900000');
}

function publishReelEnabled(input?: MetaUploadInput): boolean {
  if (input?.publishFormats?.reel !== undefined) return input.publishFormats.reel;
  return envFlag('META_PUBLISH_REEL', true);
}

function publishStoryEnabled(input?: MetaUploadInput): boolean {
  if (input?.publishFormats?.story !== undefined) return input.publishFormats.story;
  return envFlag('META_PUBLISH_STORY', true);
}

export function resolveInstagramCredentials(
  brandId: BrandId = currentBrandId()
): InstagramCredentials | null {
  const vault = getInstagramVaultEntry(brandId);
  if (vault?.accessToken && vault.userId) {
    if (vault.mode === 'facebook_login') {
      return {
        mode: 'facebook_login',
        token: vault.accessToken,
        userId: vault.userId,
        graphBase: facebookGraphBase()
      };
    }
    const version = trimEnv('INSTAGRAM_GRAPH_VERSION') || trimEnv('META_GRAPH_VERSION') || 'v21.0';
    const apiBase = trimEnv('INSTAGRAM_API_BASE') || 'https://graph.instagram.com';
    return {
      mode: 'instagram_login',
      token: vault.accessToken,
      userId: vault.userId,
      graphBase: withGraphVersion(apiBase, version)
    };
  }

  // Legacy .env fallback belongs to the original pipeline only — never reuse it for others.
  if (brandId === LEGACY_ENV_BRAND_ID) {
    const igToken = trimEnv('INSTAGRAM_ACCESS_TOKEN');
    const igUserId = trimEnv('INSTAGRAM_USER_ID');
    if (igToken && igUserId) {
      const version = trimEnv('INSTAGRAM_GRAPH_VERSION') || trimEnv('META_GRAPH_VERSION') || 'v21.0';
      const apiBase = trimEnv('INSTAGRAM_API_BASE') || 'https://graph.instagram.com';
      return {
        mode: 'instagram_login',
        token: igToken,
        userId: igUserId,
        graphBase: withGraphVersion(apiBase, version)
      };
    }

    const metaToken = trimEnv('META_ACCESS_TOKEN') || trimEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
    const businessId = trimEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID');
    if (metaToken && businessId) {
      return {
        mode: 'facebook_login',
        token: metaToken,
        userId: businessId,
        graphBase: facebookGraphBase()
      };
    }
  }

  return null;
}

export type FacebookCredentials = {
  token: string;
  pageId: string;
};

export function resolveFacebookCredentials(
  brandId: BrandId = currentBrandId()
): FacebookCredentials | null {
  const vault = getFacebookVaultEntry(brandId);
  if (vault?.accessToken && vault.pageId) {
    return { token: vault.accessToken, pageId: vault.pageId };
  }

  // Legacy .env Page token belongs to the original pipeline only.
  if (brandId === LEGACY_ENV_BRAND_ID) {
    const token = trimEnv('META_ACCESS_TOKEN') || trimEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
    const pageId = trimEnv('FACEBOOK_PAGE_ID');
    if (token && pageId) return { token, pageId };
  }
  return null;
}

function metaToken(brandId: BrandId = currentBrandId()): string {
  const creds = resolveFacebookCredentials(brandId);
  if (!creds) {
    throw new Error(
      `Facebook Page token missing for pipeline "${brandId}". Authorize/store META_ACCESS_TOKEN + FACEBOOK_PAGE_ID in data/connections/${brandId}.json`
    );
  }
  return creds.token;
}

function facebookPageId(brandId: BrandId = currentBrandId()): string {
  const creds = resolveFacebookCredentials(brandId);
  if (!creds) {
    throw new Error(`FACEBOOK_PAGE_ID missing for pipeline "${brandId}"`);
  }
  return creds.pageId;
}

export function facebookConfigured(brandId: BrandId = currentBrandId()): boolean {
  return resolveFacebookCredentials(brandId) !== null;
}

export function instagramConfigured(brandId: BrandId = currentBrandId()): boolean {
  return resolveInstagramCredentials(brandId) !== null;
}

async function resolvePublicVideoUrl(
  input: MetaUploadInput,
  required: boolean
): Promise<string | undefined> {
  try {
    const resolved = await resolveInstagramVideoPublicUrl(input.videoPath, input.episodeId);
    if (resolved.source === 's3') {
      console.log(
        resolved.reused
          ? `Meta media reused on S3: ${resolved.url}`
          : `Meta media hosted on S3: ${resolved.url}`
      );
    } else {
      console.log(`Meta media URL from env: ${resolved.url}`);
    }
    return resolved.url;
  } catch (error) {
    if (required) throw error;
    return undefined;
  }
}

async function resolveFfmpegBin(): Promise<string> {
  const configured = process.env.FFMPEG_BIN?.trim();
  if (configured) return configured;
  return 'ffmpeg';
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-1500) || `ffmpeg exited ${code}`));
    });
  });
}

/**
 * Instagram Stories max ~60s. Trim a local story cut when the Short is longer
 * (full file is still used for Reels).
 */
export async function prepareInstagramStoryVideo(videoPath: string): Promise<{
  path: string;
  trimmed: boolean;
  sourceSeconds: number;
  storySeconds: number;
}> {
  const absolute = path.resolve(videoPath);
  const sourceSeconds = await probeAudioDuration(absolute);
  if (sourceSeconds <= INSTAGRAM_STORY_MAX_SECONDS + 0.05) {
    return {
      path: absolute,
      trimmed: false,
      sourceSeconds,
      storySeconds: sourceSeconds
    };
  }

  const outDir = path.join(path.dirname(absolute), 'meta-story');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `${path.basename(absolute, path.extname(absolute))}-story60s.mp4`
  );

  try {
    const existing = await probeAudioDuration(outPath);
    if (existing > 0 && existing <= INSTAGRAM_STORY_MAX_SECONDS + 0.25) {
      return {
        path: outPath,
        trimmed: true,
        sourceSeconds,
        storySeconds: existing
      };
    }
  } catch {
    // create fresh cut
  }

  const ffmpeg = await resolveFfmpegBin();
  // Re-encode for Stories: H.264 + AAC, 9:16 friendly, ≤60s.
  await runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    absolute,
    '-t',
    String(INSTAGRAM_STORY_MAX_SECONDS),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outPath
  ]);
  const storySeconds = await probeAudioDuration(outPath);
  console.log(
    `Instagram Story cut: ${sourceSeconds.toFixed(1)}s Short → ${storySeconds.toFixed(1)}s (Stories max ~60s)`
  );
  return { path: outPath, trimmed: true, sourceSeconds, storySeconds };
}

async function waitForIgContainer(
  graphBase: string,
  creationId: string,
  token: string
): Promise<void> {
  const deadline = Date.now() + Number(process.env.INSTAGRAM_PROCESS_TIMEOUT_MS || '300000');
  while (Date.now() < deadline) {
    const statusRes = await fetch(
      `${graphBase}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(30_000) }
    );
    const statusJson = (await statusRes.json()) as {
      status_code?: string;
      status?: string;
      error?: { message?: string };
    };
    if (!statusRes.ok) {
      throw new Error(`Instagram status failed: ${statusJson.error?.message || statusRes.statusText}`);
    }
    const code = statusJson.status_code;
    if (code === 'FINISHED' || code === 'PUBLISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      const detail = statusJson.status ? ` — ${statusJson.status}` : '';
      throw new Error(
        `Instagram media processing failed with status ${code}${detail}. ` +
          'Common causes: video longer than Stories allow (~60s), S3 URL not publicly downloadable (403), wrong codec, or Instagram could not fetch video_url.'
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Instagram media processing timed out before FINISHED');
}

async function publishIgContainer(
  creds: InstagramCredentials,
  creationId: string
): Promise<string> {
  const publish = await fetch(
    `${creds.graphBase}/${creds.userId}/media_publish?` +
      new URLSearchParams({ creation_id: creationId, access_token: creds.token }),
    { method: 'POST', signal: AbortSignal.timeout(120_000) }
  );
  const published = (await publish.json()) as { id?: string; error?: { message?: string } };
  if (!publish.ok || !published.id) {
    throw new Error(`Instagram publish failed: ${published.error?.message || publish.statusText}`);
  }
  return published.id;
}

async function createIgVideoContainer(input: {
  creds: InstagramCredentials;
  mediaType: 'REELS' | 'STORIES';
  videoUrl: string;
  caption?: string;
}): Promise<string> {
  const params = new URLSearchParams({
    media_type: input.mediaType,
    video_url: input.videoUrl,
    access_token: input.creds.token
  });
  if (input.mediaType === 'REELS') {
    if (input.caption) params.set('caption', input.caption);
    params.set('share_to_feed', process.env.INSTAGRAM_SHARE_TO_FEED === 'false' ? 'false' : 'true');
  }

  const create = await fetch(`${input.creds.graphBase}/${input.creds.userId}/media?${params}`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000)
  });
  const created = (await create.json()) as { id?: string; error?: { message?: string } };
  if (!create.ok || !created.id) {
    throw new Error(
      `Instagram ${input.mediaType} container create failed: ${created.error?.message || create.statusText}`
    );
  }
  return created.id;
}

/** Upload a Reel/video to a Facebook Page from a local file (legacy feed video). */
export async function uploadFacebookPageVideo(input: MetaUploadInput): Promise<MetaUploadResult> {
  const pageId = facebookPageId();
  const token = metaToken();
  const bytes = await readFile(input.videoPath);
  const form = new FormData();
  form.set('access_token', token);
  form.set('description', input.caption);
  if (input.title) form.set('title', input.title.slice(0, 255));
  form.set('published', process.env.FACEBOOK_PUBLISH_IMMEDIATELY === 'false' ? 'false' : 'true');
  form.set(
    'source',
    new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }),
    'short.mp4'
  );

  const response = await fetch(`${facebookGraphBase()}/${pageId}/videos`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(metaUploadTimeoutMs())
  });
  const json = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !json.id) {
    throw new Error(`Facebook upload failed: ${json.error?.message || response.statusText}`);
  }
  return {
    platform: 'facebook',
    id: json.id,
    url: `https://www.facebook.com/${pageId}/videos/${json.id}`,
    formats: [{ kind: 'reel', id: json.id, url: `https://www.facebook.com/${pageId}/videos/${json.id}` }]
  };
}

async function waitForFacebookVideoReady(videoId: string, token: string): Promise<void> {
  const deadline = Date.now() + Number(process.env.FACEBOOK_PROCESS_TIMEOUT_MS || '300000');
  while (Date.now() < deadline) {
    const statusRes = await fetch(
      `${facebookGraphBase()}/${videoId}?fields=status&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(30_000) }
    );
    const statusJson = (await statusRes.json()) as {
      status?: {
        video_status?: string;
        processing_phase?: { status?: string; error?: { message?: string } };
        uploading_phase?: { status?: string };
        publishing_phase?: { status?: string; publish_status?: string };
      };
      error?: { message?: string };
    };
    if (!statusRes.ok) {
      throw new Error(`Facebook video status failed: ${statusJson.error?.message || statusRes.statusText}`);
    }
    const videoStatus = statusJson.status?.video_status;
    const processing = statusJson.status?.processing_phase?.status;
    const publishing = statusJson.status?.publishing_phase?.publish_status;
    if (videoStatus === 'error' || processing === 'error') {
      const detail = statusJson.status?.processing_phase?.error?.message || videoStatus || 'error';
      throw new Error(`Facebook video processing failed: ${detail}`);
    }
    if (
      videoStatus === 'ready' ||
      videoStatus === 'upload_complete' ||
      processing === 'complete' ||
      publishing === 'published'
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export async function uploadFacebookReel(input: MetaUploadInput): Promise<MetaFormatResult> {
  const pageId = facebookPageId();
  const token = metaToken();
  const version = graphVersion();
  const publicUrl = await resolvePublicVideoUrl(input, false);

  const start = await fetch(`${facebookGraphBase()}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: token }),
    signal: AbortSignal.timeout(60_000)
  });
  const started = (await start.json()) as {
    video_id?: string;
    upload_url?: string;
    error?: { message?: string };
  };
  if (!start.ok || !started.video_id) {
    throw new Error(`Facebook Reel start failed: ${started.error?.message || start.statusText}`);
  }
  const videoId = started.video_id;
  const uploadUrl =
    started.upload_url || `https://rupload.facebook.com/video-upload/${version}/${videoId}`;

  if (publicUrl) {
    const put = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_url: publicUrl
      },
      signal: AbortSignal.timeout(metaUploadTimeoutMs())
    });
    const putJson = (await put.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!put.ok || putJson.success === false) {
      throw new Error(
        `Facebook Reel hosted upload failed: ${putJson.error?.message || put.statusText || put.status}`
      );
    }
  } else {
    const fileStat = await stat(input.videoPath);
    const bytes = await readFile(input.videoPath);
    const put = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        offset: '0',
        file_size: String(fileStat.size),
        'content-type': 'application/octet-stream'
      },
      body: bytes,
      signal: AbortSignal.timeout(metaUploadTimeoutMs())
    });
    if (!put.ok) {
      const text = await put.text();
      throw new Error(`Facebook Reel binary upload failed ${put.status}: ${text.slice(0, 400)}`);
    }
  }

  await waitForFacebookVideoReady(videoId, token).catch(() => {
    // finish still attempted; Meta may finish processing during publish
  });

  const finishParams = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    description: input.caption,
    access_token: token
  });
  if (input.title) finishParams.set('title', input.title.slice(0, 255));

  const scheduledUnix = (() => {
    if (input.scheduledPublishTime == null) return undefined;
    if (typeof input.scheduledPublishTime === 'number') return Math.floor(input.scheduledPublishTime);
    const ms = new Date(input.scheduledPublishTime).getTime();
    if (Number.isNaN(ms)) throw new Error('Invalid Facebook scheduledPublishTime');
    return Math.floor(ms / 1000);
  })();

  if (scheduledUnix) {
    finishParams.set('video_state', 'SCHEDULED');
    finishParams.set('scheduled_publish_time', String(scheduledUnix));
  } else {
    finishParams.set(
      'video_state',
      process.env.FACEBOOK_PUBLISH_IMMEDIATELY === 'false' ? 'DRAFT' : 'PUBLISHED'
    );
  }
  const finish = await fetch(`${facebookGraphBase()}/${pageId}/video_reels?${finishParams}`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000)
  });
  const finished = (await finish.json()) as {
    success?: boolean;
    post_id?: string;
    message?: string;
    error?: { message?: string };
  };
  if (!finish.ok || finished.success === false) {
    throw new Error(
      `Facebook Reel finish failed: ${finished.error?.message || finished.message || finish.statusText}`
    );
  }

  const id = finished.post_id || videoId;
  return {
    kind: 'reel',
    id,
    url: `https://www.facebook.com/reel/${id}`
  };
}

export async function uploadFacebookStory(input: MetaUploadInput): Promise<MetaFormatResult> {
  const pageId = facebookPageId();
  const token = metaToken();
  const publicUrl = await resolvePublicVideoUrl(input, true);

  const start = await fetch(
    `${facebookGraphBase()}/${pageId}/video_stories?` +
      new URLSearchParams({ upload_phase: 'start', access_token: token }),
    { method: 'POST', signal: AbortSignal.timeout(60_000) }
  );
  const started = (await start.json()) as {
    video_id?: string;
    upload_url?: string;
    error?: { message?: string };
  };
  if (!start.ok || !started.video_id || !started.upload_url) {
    throw new Error(`Facebook Story start failed: ${started.error?.message || start.statusText}`);
  }

  const put = await fetch(started.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_url: publicUrl!
    },
    signal: AbortSignal.timeout(metaUploadTimeoutMs())
  });
  const putJson = (await put.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (!put.ok || putJson.success === false) {
    throw new Error(
      `Facebook Story upload failed: ${putJson.error?.message || put.statusText || put.status}`
    );
  }

  await waitForFacebookVideoReady(started.video_id, token).catch(() => undefined);

  const finish = await fetch(
    `${facebookGraphBase()}/${pageId}/video_stories?` +
      new URLSearchParams({
        upload_phase: 'finish',
        video_id: started.video_id,
        access_token: token
      }),
    { method: 'POST', signal: AbortSignal.timeout(120_000) }
  );
  const finished = (await finish.json()) as {
    success?: boolean;
    post_id?: string;
    error?: { message?: string };
  };
  if (!finish.ok || finished.success === false) {
    throw new Error(`Facebook Story finish failed: ${finished.error?.message || finish.statusText}`);
  }

  const id = finished.post_id || started.video_id;
  return {
    kind: 'story',
    id,
    url: `https://www.facebook.com/stories/${pageId}`
  };
}

/**
 * Publish Facebook Page Reel + Story (default both).
 * Toggle with META_PUBLISH_REEL / META_PUBLISH_STORY.
 */
export async function publishFacebookReelAndStory(input: MetaUploadInput): Promise<MetaUploadResult> {
  if (!publishReelEnabled(input) && !publishStoryEnabled(input)) {
    throw new Error('Both Reel and Story publishing are disabled for Facebook');
  }

  const formats: MetaFormatResult[] = [];
  const errors: string[] = [];

  if (publishReelEnabled(input)) {
    try {
      formats.push(await uploadFacebookReel(input));
      console.log(`Facebook Reel published: ${formats.at(-1)?.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`reel: ${message}`);
      console.error(`Facebook Reel failed: ${message}`);
    }
  }

  if (publishStoryEnabled(input)) {
    if (input.scheduledPublishTime != null) {
      errors.push(
        'story: Facebook Stories cannot be scheduled via Graph API — queue Story for deferred publish or post now'
      );
    } else {
      try {
        formats.push(await uploadFacebookStory(input));
        console.log(`Facebook Story published: ${formats.at(-1)?.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`story: ${message}`);
        console.error(`Facebook Story failed: ${message}`);
      }
    }
  }

  if (!formats.length) {
    throw new Error(errors.join(' | ') || 'Facebook publish produced no formats');
  }

  const reel = formats.find((f) => f.kind === 'reel');
  return {
    platform: 'facebook',
    id: formats.map((f) => `${f.kind}:${f.id}`).join(','),
    ...(reel?.url ? { url: reel.url } : formats[0]?.url ? { url: formats[0].url } : {}),
    formats,
    ...(errors.length ? { errors } : {})
  };
}

export async function uploadInstagramReel(input: MetaUploadInput): Promise<MetaUploadResult> {
  const format = await uploadInstagramFormat(input, 'REELS');
  return {
    platform: 'instagram',
    id: format.id,
    ...(format.url ? { url: format.url } : {}),
    formats: [format]
  };
}

export async function uploadInstagramStory(input: MetaUploadInput): Promise<MetaFormatResult> {
  return uploadInstagramFormat(input, 'STORIES');
}

async function uploadInstagramFormat(
  input: MetaUploadInput,
  mediaType: 'REELS' | 'STORIES'
): Promise<MetaFormatResult> {
  const creds = resolveInstagramCredentials();
  if (!creds) {
    throw new Error(
      `Instagram not configured for pipeline "${currentBrandId()}". Authorize Instagram in Desk (saves data/connections/<brand>.json), or set INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID for legacy epicastra.`
    );
  }

  let videoPath = input.videoPath;
  if (mediaType === 'STORIES') {
    const prepared = await prepareInstagramStoryVideo(input.videoPath);
    videoPath = prepared.path;
  }

  const publicUrl = await resolvePublicVideoUrl({ ...input, videoPath }, true);
  if (!publicUrl) {
    throw new Error('Instagram publish requires a public video URL (S3 or PUBLISH_VIDEO_PUBLIC_URL)');
  }

  const creationId = await createIgVideoContainer({
    creds,
    mediaType,
    videoUrl: publicUrl,
    ...(mediaType === 'REELS' ? { caption: input.caption } : {})
  });
  await waitForIgContainer(creds.graphBase, creationId, creds.token);
  const id = await publishIgContainer(creds, creationId);

  return {
    kind: mediaType === 'REELS' ? 'reel' : 'story',
    id,
    url:
      mediaType === 'REELS'
        ? `https://www.instagram.com/reel/${id}/`
        : `https://www.instagram.com/stories/`
  };
}

/**
 * Publish Instagram Reel + Story (default both).
 * Toggle with META_PUBLISH_REEL / META_PUBLISH_STORY.
 */
export async function publishInstagramReelAndStory(input: MetaUploadInput): Promise<MetaUploadResult> {
  if (!publishReelEnabled(input) && !publishStoryEnabled(input)) {
    throw new Error('Both Reel and Story publishing are disabled for Instagram');
  }

  const formats: MetaFormatResult[] = [];
  const errors: string[] = [];

  if (publishReelEnabled(input)) {
    try {
      formats.push(await uploadInstagramFormat(input, 'REELS'));
      console.log(`Instagram Reel published: ${formats.at(-1)?.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`reel: ${message}`);
      console.error(`Instagram Reel failed: ${message}`);
    }
  }

  if (publishStoryEnabled(input)) {
    try {
      formats.push(await uploadInstagramFormat(input, 'STORIES'));
      console.log(`Instagram Story published: ${formats.at(-1)?.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`story: ${message}`);
      console.error(`Instagram Story failed: ${message}`);
    }
  }

  if (!formats.length) {
    throw new Error(errors.join(' | ') || 'Instagram publish produced no formats');
  }

  const reel = formats.find((f) => f.kind === 'reel');
  return {
    platform: 'instagram',
    id: formats.map((f) => `${f.kind}:${f.id}`).join(','),
    ...(reel?.url ? { url: reel.url } : formats[0]?.url ? { url: formats[0].url } : {}),
    formats,
    ...(errors.length ? { errors } : {})
  };
}
