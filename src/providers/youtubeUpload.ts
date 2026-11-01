import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrandId } from '../lib/brands.js';
import { LEGACY_ENV_BRAND_ID, currentBrandId, getBrand } from '../lib/brands.js';
import {
  getYoutubeVaultEntry,
  persistYoutubePlaylistId,
  signYoutubeOAuthState
} from '../lib/publishConnections.js';

const execFileAsync = promisify(execFile);

export type YoutubeCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountName?: string;
};

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Shared Google OAuth client (one Cloud project) + per-brand refresh token from vault. */
export function resolveYoutubeCredentials(
  brandId: BrandId = currentBrandId()
): YoutubeCredentials | null {
  const vault = getYoutubeVaultEntry(brandId);
  const clientId = vault?.clientId || trimEnv('YOUTUBE_CLIENT_ID');
  const clientSecret = vault?.clientSecret || trimEnv('YOUTUBE_CLIENT_SECRET');
  // Env refresh token is EpicAstra legacy only — never reuse it for tech-instagram.
  const refreshToken =
    vault?.refreshToken ||
    (brandId === LEGACY_ENV_BRAND_ID ? trimEnv('YOUTUBE_REFRESH_TOKEN') : undefined);

  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    ...(vault?.accountName ? { accountName: vault.accountName } : {})
  };
}

export function youtubeDeskRedirectUri(): string {
  // Prefer the same URI already registered for EpicAstra / CLI (avoids redirect_uri_mismatch).
  return (
    trimEnv('YOUTUBE_DESK_REDIRECT_URI') ||
    trimEnv('YOUTUBE_REDIRECT_URI') ||
    'http://localhost:8765/oauth2callback'
  );
}

export function youtubeAuthSetup(brandId: BrandId = currentBrandId()): {
  ready: boolean;
  missing: string[];
  redirectUri: string;
  brandId: BrandId;
  authUrl?: string;
} {
  const missing: string[] = [];
  if (!trimEnv('YOUTUBE_CLIENT_ID')) missing.push('YOUTUBE_CLIENT_ID');
  if (!trimEnv('YOUTUBE_CLIENT_SECRET')) missing.push('YOUTUBE_CLIENT_SECRET');
  const redirectUri = youtubeDeskRedirectUri();
  if (missing.length) {
    return { ready: false, missing, redirectUri, brandId };
  }
  return {
    ready: true,
    missing: [],
    redirectUri,
    brandId,
    authUrl: youtubeAuthUrl({ brandId, redirectUri })
  };
}

export type YoutubePrivacy = 'private' | 'unlisted' | 'public';

export type YoutubeUploadInput = {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  privacy?: YoutubePrivacy;
  categoryId?: string;
  madeForKids?: boolean;
  /**
   * When set, YouTube keeps the Short private until this UTC time (RFC3339).
   * privacyStatus is forced to private while scheduled.
   */
  publishAt?: Date | string;
};

export type YoutubeUploadResult = {
  platform: 'youtube';
  videoId: string;
  url: string;
  privacy: YoutubePrivacy;
  title: string;
  playlistId?: string;
  playlistUrl?: string;
};

/** Force Shorts classification signals — YouTube has no separate Shorts upload API. */
export function ensureYoutubeShortsMetadata(input: {
  title: string;
  description: string;
  tags?: string[];
}): { title: string; description: string; tags: string[] } {
  const hasShortsTag = (text: string) => /#\s*shorts\b/i.test(text);
  let title = input.title.replace(/\s+/g, ' ').trim();
  if (!hasShortsTag(title)) {
    const suffix = ' #Shorts';
    const max = 100 - suffix.length;
    title = `${title.slice(0, max).trimEnd()}${suffix}`;
  }

  let description = input.description.trim();
  if (!hasShortsTag(description)) {
    description = `#Shorts\n\n${description}`.slice(0, 5000);
  }

  const tags = [...(input.tags || [])];
  for (const tag of ['Shorts', 'shorts', 'YouTubeShorts', 'mythology']) {
    if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }

  return { title: title.slice(0, 100), description: description.slice(0, 5000), tags: tags.slice(0, 15) };
}

async function assertVerticalShort(videoPath: string): Promise<void> {
  const skip = process.env.YOUTUBE_SKIP_SHORTS_PROBE === 'true';
  if (skip) return;
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,duration:format=duration',
        '-of',
        'json',
        videoPath
      ],
      { timeout: 30_000 }
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number; duration?: string }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const width = Number(stream?.width || 0);
    const height = Number(stream?.height || 0);
    const duration = Number(stream?.duration || parsed.format?.duration || 0);
    if (width > 0 && height > 0 && width >= height) {
      throw new Error(
        `YouTube Shorts require a vertical video (9:16). Got ${width}x${height}. Re-export as vertical Short.`
      );
    }
    // Shorts allow up to ~3 min now; keep a soft guard so landscape long-form never slips through.
    const maxSeconds = Number(process.env.YOUTUBE_SHORTS_MAX_SECONDS || '180');
    if (duration > maxSeconds + 0.5) {
      throw new Error(
        `Clip is ${duration.toFixed(1)}s — too long for Shorts (max ${maxSeconds}s). Trim before upload.`
      );
    }
  } catch (error) {
    if (error instanceof Error && /vertical video|too long for Shorts/.test(error.message)) {
      throw error;
    }
    // ffprobe missing — still upload with #Shorts metadata.
  }
}

export async function getYoutubeAccessToken(
  brandId: BrandId = currentBrandId()
): Promise<string> {
  return refreshAccessToken(brandId);
}

async function refreshAccessToken(brandId: BrandId = currentBrandId()): Promise<string> {
  const creds = resolveYoutubeCredentials(brandId);
  if (!creds) {
    throw new Error(
      `YouTube OAuth missing for pipeline "${brandId}". Set YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET in .env, then Authorize YouTube for this pipeline (see docs/publish-setup.md)`
    );
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(60_000)
  });
  const json = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(`YouTube token refresh failed: ${json.error_description || json.error || response.statusText}`);
  }
  return json.access_token;
}

export async function uploadYoutubeShort(
  input: YoutubeUploadInput & { brandId?: BrandId }
): Promise<YoutubeUploadResult> {
  await assertVerticalShort(input.videoPath);
  const shortsMeta = ensureYoutubeShortsMetadata({
    title: input.title,
    description: input.description,
    ...(input.tags ? { tags: input.tags } : {})
  });

  const accessToken = await refreshAccessToken(input.brandId || currentBrandId());
  const publishAtRaw = input.publishAt
    ? input.publishAt instanceof Date
      ? input.publishAt.toISOString()
      : new Date(input.publishAt).toISOString()
    : undefined;
  if (publishAtRaw && Number.isNaN(Date.parse(publishAtRaw))) {
    throw new Error('YouTube publishAt must be a valid ISO datetime');
  }
  const privacy = publishAtRaw
    ? 'private'
    : input.privacy || (process.env.YOUTUBE_PRIVACY as YoutubePrivacy) || 'private';
  const fileStat = await stat(input.videoPath);
  const bytes = await readFile(input.videoPath);

  const metadata = {
    snippet: {
      title: shortsMeta.title,
      description: shortsMeta.description,
      tags: shortsMeta.tags,
      categoryId: input.categoryId || process.env.YOUTUBE_CATEGORY_ID || '24'
    },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: input.madeForKids ?? false,
      ...(publishAtRaw ? { publishAt: publishAtRaw, privacyStatus: 'private' as const } : {})
    }
  };

  const initUrl =
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  const init = await fetch(initUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(fileStat.size),
      'x-upload-content-type': 'video/mp4'
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(60_000)
  });

  if (!init.ok) {
    const errText = await init.text();
    throw new Error(`YouTube upload init failed ${init.status}: ${errText.slice(0, 500)}`);
  }

  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'video/mp4',
      'content-length': String(fileStat.size)
    },
    body: bytes,
    signal: AbortSignal.timeout(Number(process.env.YOUTUBE_UPLOAD_TIMEOUT_MS || '900000'))
  });

  const result = (await put.json()) as { id?: string; error?: { message?: string } };
  if (!put.ok || !result.id) {
    throw new Error(`YouTube upload failed: ${result.error?.message || put.statusText}`);
  }

  const brandId = input.brandId || currentBrandId();
  let playlistId: string | undefined;
  let playlistUrl: string | undefined;
  try {
    const playlist = await ensureYoutubeSeriesPlaylist(brandId, accessToken);
    if (playlist?.playlistId) {
      await addVideoToYoutubePlaylist(accessToken, playlist.playlistId, result.id);
      playlistId = playlist.playlistId;
      playlistUrl = playlist.playlistUrl;
    }
  } catch (error) {
    // Upload succeeded — playlist attach is best-effort (log via thrown message on result).
    console.warn(
      `[youtube] playlist attach skipped: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    platform: 'youtube',
    videoId: result.id,
    url: `https://www.youtube.com/shorts/${result.id}`,
    privacy,
    title: shortsMeta.title,
    ...(playlistId ? { playlistId } : {}),
    ...(playlistUrl ? { playlistUrl } : {})
  };
}

export async function createYoutubePlaylist(
  accessToken: string,
  title: string,
  description = 'DSA series Shorts — auto-added by Mythology Factory'
): Promise<{ playlistId: string; playlistUrl: string }> {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus: 'public' }
      }),
      signal: AbortSignal.timeout(30_000)
    }
  );
  const json = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!response.ok || !json.id) {
    throw new Error(json.error?.message || `YouTube playlist create failed (${response.status})`);
  }
  return {
    playlistId: json.id,
    playlistUrl: `https://www.youtube.com/playlist?list=${json.id}`
  };
}

export async function addVideoToYoutubePlaylist(
  accessToken: string,
  playlistId: string,
  videoId: string
): Promise<void> {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId }
        }
      }),
      signal: AbortSignal.timeout(30_000)
    }
  );
  if (!response.ok) {
    const json = (await response.json()) as { error?: { message?: string } };
    throw new Error(json.error?.message || `YouTube playlistItems.insert failed (${response.status})`);
  }
}

/** Resolve brand playlist id, or create "DSA 90 Days" once and store it in the vault. */
export async function ensureYoutubeSeriesPlaylist(
  brandId: BrandId,
  accessToken?: string
): Promise<{ playlistId: string; playlistUrl: string; playlistTitle: string } | null> {
  const brand = getBrand(brandId);
  const vault = getYoutubeVaultEntry(brandId);
  const title =
    vault?.playlistTitle ||
    brand.youtubePlaylistTitle;
  const existingId = vault?.playlistId || brand.youtubePlaylistId;
  if (existingId) {
    return {
      playlistId: existingId,
      playlistUrl: `https://www.youtube.com/playlist?list=${existingId}`,
      playlistTitle: title || 'DSA 90 Days'
    };
  }
  if (!title) return null;

  const token = accessToken || (await refreshAccessToken(brandId));
  const created = await createYoutubePlaylist(token, title);
  persistYoutubePlaylistId({
    brandId,
    playlistId: created.playlistId,
    playlistTitle: title
  });
  return {
    playlistId: created.playlistId,
    playlistUrl: created.playlistUrl,
    playlistTitle: title
  };
}

/** One-time helper: exchange auth code for refresh token. */
export async function exchangeYoutubeAuthCode(
  code: string,
  redirectUri?: string
): Promise<{ refresh_token?: string; access_token?: string }> {
  const clientId = trimEnv('YOUTUBE_CLIENT_ID');
  const clientSecret = trimEnv('YOUTUBE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET required');

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri || trimEnv('YOUTUBE_REDIRECT_URI') || 'http://localhost:8765/oauth2callback',
    grant_type: 'authorization_code'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(60_000)
  });
  const json = (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(`YouTube code exchange failed: ${json.error_description || json.error || response.statusText}`);
  }
  return json;
}

export function youtubeAuthUrl(options?: {
  brandId?: BrandId;
  redirectUri?: string;
}): string {
  const clientId = trimEnv('YOUTUBE_CLIENT_ID');
  if (!clientId) throw new Error('YOUTUBE_CLIENT_ID required');
  const brandId = options?.brandId || currentBrandId();
  const redirectUri =
    options?.redirectUri ||
    trimEnv('YOUTUBE_REDIRECT_URI') ||
    'http://localhost:8765/oauth2callback';
  const redirect = encodeURIComponent(redirectUri);
  // upload + channel manage + Analytics/Reporting (AVD, retention, bulk reports)
  const scope = encodeURIComponent(
    [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ].join(' ')
  );
  const state = encodeURIComponent(signYoutubeOAuthState({ brandId }));
  return (
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${redirect}&response_type=code&access_type=offline&prompt=consent&scope=${scope}` +
    `&state=${state}`
  );
}

export function youtubeConfigured(brandId: BrandId = currentBrandId()): boolean {
  return Boolean(resolveYoutubeCredentials(brandId));
}

/** Fetch channel title for the authorized account (used after OAuth + connection tests). */
export async function fetchYoutubeChannelTitle(
  accessToken: string
): Promise<string | undefined> {
  const channelResponse = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000)
    }
  );
  const channel = (await channelResponse.json()) as {
    items?: Array<{ snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  if (!channelResponse.ok) {
    throw new Error(channel.error?.message || 'YouTube channel check failed');
  }
  return channel.items?.[0]?.snippet?.title;
}
