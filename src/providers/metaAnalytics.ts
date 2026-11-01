/**
 * Facebook Page + Instagram media analytics (Graph API).
 * Best-effort: some Reel object ids cannot be read as singular Video nodes.
 */
import {
  facebookConfigured,
  instagramConfigured,
  resolveInstagramCredentials
} from './metaUpload.js';

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function facebookGraphBase(): string {
  const version = trimEnv('META_GRAPH_VERSION') || 'v21.0';
  return `https://graph.facebook.com/${version}`;
}

function facebookPageToken(): string {
  const token = trimEnv('META_ACCESS_TOKEN') || trimEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!token) throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN / META_ACCESS_TOKEN required');
  return token;
}

async function graphGet<T>(
  url: string
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: json.error?.message || `Graph request failed (${response.status})`
    };
  }
  return { ok: true, data: json };
}

export type MetaAccountStats = {
  platform: 'facebook' | 'instagram';
  id: string;
  name: string;
  username?: string;
  followersCount: number;
  mediaCount?: number;
  fetchedAt: string;
};

export type MetaMediaStats = {
  platform: 'facebook' | 'instagram';
  id: string;
  kind?: 'reel' | 'story' | 'video';
  title?: string;
  caption?: string;
  permalink?: string;
  publishedAt?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  reach?: number;
  shares?: number;
  saved?: number;
  fetchedAt: string;
  error?: string;
};

/** Pull reel/story/video ids out of ledger strings like `reel:123,story:456`. */
export function extractMetaMediaIds(
  rawId: string | undefined,
  formats?: Array<{ kind: 'reel' | 'story'; id: string; url?: string | undefined }>
): Array<{ id: string; kind?: 'reel' | 'story' | 'video' }> {
  const out: Array<{ id: string; kind?: 'reel' | 'story' | 'video' }> = [];
  const seen = new Set<string>();

  const push = (id: string, kind?: 'reel' | 'story' | 'video') => {
    const clean = id.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push({ id: clean, ...(kind ? { kind } : {}) });
  };

  for (const format of formats || []) {
    if (format.id) push(format.id, format.kind);
  }

  if (rawId) {
    for (const part of rawId.split(',')) {
      const trimmed = part.trim();
      const match = /^(reel|story|video):(.+)$/i.exec(trimmed);
      if (match) {
        push(match[2]!, match[1]!.toLowerCase() as 'reel' | 'story' | 'video');
      } else if (/^\d+$/.test(trimmed)) {
        push(trimmed);
      }
    }
  }

  return out;
}

export async function fetchFacebookPageStats(): Promise<MetaAccountStats | null> {
  if (!facebookConfigured()) return null;
  const pageId = trimEnv('FACEBOOK_PAGE_ID')!;
  const token = facebookPageToken();
  const result = await graphGet<{
    id?: string;
    name?: string;
    fan_count?: number;
    followers_count?: number;
  }>(
    `${facebookGraphBase()}/${encodeURIComponent(pageId)}?` +
      new URLSearchParams({
        fields: 'id,name,fan_count,followers_count',
        access_token: token
      })
  );
  if (!result.ok) throw new Error(result.error);
  return {
    platform: 'facebook',
    id: result.data.id || pageId,
    name: result.data.name || 'Facebook Page',
    followersCount: Number(result.data.followers_count || result.data.fan_count || 0),
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchInstagramAccountStats(): Promise<MetaAccountStats | null> {
  if (!instagramConfigured()) return null;
  const creds = resolveInstagramCredentials();
  if (!creds) return null;
  const result = await graphGet<{
    id?: string;
    username?: string;
    name?: string;
    followers_count?: number;
    media_count?: number;
  }>(
    `${creds.graphBase}/${encodeURIComponent(creds.userId)}?` +
      new URLSearchParams({
        fields: 'id,username,name,followers_count,media_count',
        access_token: creds.token
      })
  );
  if (!result.ok) throw new Error(result.error);
  return {
    platform: 'instagram',
    id: result.data.id || creds.userId,
    name: result.data.name || result.data.username || 'Instagram',
    ...(result.data.username ? { username: result.data.username } : {}),
    followersCount: Number(result.data.followers_count || 0),
    ...(result.data.media_count != null ? { mediaCount: Number(result.data.media_count) } : {}),
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchInstagramMediaStats(
  mediaId: string,
  kind?: 'reel' | 'story' | 'video'
): Promise<MetaMediaStats> {
  const creds = resolveInstagramCredentials();
  if (!creds) throw new Error('Instagram not configured');
  const fetchedAt = new Date().toISOString();
  const media = await graphGet<{
    id?: string;
    caption?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
    media_product_type?: string;
  }>(
    `${creds.graphBase}/${encodeURIComponent(mediaId)}?` +
      new URLSearchParams({
        fields: 'id,caption,permalink,timestamp,like_count,comments_count,media_product_type',
        access_token: creds.token
      })
  );
  if (!media.ok) {
    return {
      platform: 'instagram',
      id: mediaId,
      ...(kind ? { kind } : {}),
      fetchedAt,
      error: media.error
    };
  }

  let viewCount: number | undefined;
  let reach: number | undefined;
  let shares: number | undefined;
  let saved: number | undefined;
  const insights = await graphGet<{
    data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
  }>(
    `${creds.graphBase}/${encodeURIComponent(mediaId)}/insights?` +
      new URLSearchParams({
        metric: 'views,reach,saved,shares,total_interactions',
        access_token: creds.token
      })
  );
  if (insights.ok) {
    for (const row of insights.data.data || []) {
      const value = Number(row.values?.[0]?.value || 0);
      if (row.name === 'views') viewCount = value;
      if (row.name === 'reach') reach = value;
      if (row.name === 'shares') shares = value;
      if (row.name === 'saved') saved = value;
    }
  }

  const inferredKind =
    kind ||
    (media.data.media_product_type === 'REELS'
      ? 'reel'
      : media.data.media_product_type === 'STORY'
        ? 'story'
        : 'video');

  return {
    platform: 'instagram',
    id: media.data.id || mediaId,
    kind: inferredKind,
    ...(media.data.caption ? { caption: media.data.caption, title: media.data.caption.slice(0, 80) } : {}),
    ...(media.data.permalink ? { permalink: media.data.permalink } : {}),
    ...(media.data.timestamp ? { publishedAt: media.data.timestamp } : {}),
    ...(viewCount != null ? { viewCount } : {}),
    likeCount: Number(media.data.like_count || 0),
    commentCount: Number(media.data.comments_count || 0),
    ...(reach != null ? { reach } : {}),
    ...(shares != null ? { shares } : {}),
    ...(saved != null ? { saved } : {}),
    fetchedAt
  };
}

export async function fetchFacebookMediaStats(
  mediaId: string,
  kind?: 'reel' | 'story' | 'video'
): Promise<MetaMediaStats> {
  const token = facebookPageToken();
  const fetchedAt = new Date().toISOString();
  const result = await graphGet<{
    id?: string;
    description?: string;
    title?: string;
    created_time?: string;
    permalink_url?: string;
    views?: number;
    length?: number;
  }>(
    `${facebookGraphBase()}/${encodeURIComponent(mediaId)}?` +
      new URLSearchParams({
        fields: 'id,description,title,created_time,permalink_url,views,length',
        access_token: token
      })
  );

  if (!result.ok) {
    return {
      platform: 'facebook',
      id: mediaId,
      ...(kind ? { kind } : {}),
      fetchedAt,
      error: result.error
    };
  }

  const permalink = result.data.permalink_url
    ? result.data.permalink_url.startsWith('http')
      ? result.data.permalink_url
      : `https://www.facebook.com${result.data.permalink_url}`
    : undefined;

  return {
    platform: 'facebook',
    id: result.data.id || mediaId,
    kind: kind || 'video',
    ...(result.data.title || result.data.description
      ? {
          title: (result.data.title || result.data.description || '').slice(0, 80),
          caption: result.data.description
        }
      : {}),
    ...(permalink ? { permalink } : {}),
    ...(result.data.created_time ? { publishedAt: result.data.created_time } : {}),
    ...(result.data.views != null ? { viewCount: Number(result.data.views) } : {}),
    fetchedAt
  };
}
