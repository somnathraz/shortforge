/**
 * YouTube Data API v3 analytics reads (channel + videos).
 * Reuses the same OAuth refresh token as upload.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getYoutubeAccessToken } from './youtubeUpload.js';
import { loadPublishLedger } from '../lib/publishLedger.js';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export type YoutubeChannelStats = {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId?: string;
  fetchedAt: string;
};

export type YoutubeVideoStats = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  duration?: string;
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  privacyStatus?: string;
  url: string;
};

export type FactoryYoutubePublish = {
  episodeId: string;
  videoId: string;
  url?: string;
  titleUsed?: string;
  status: string;
  recordedAt?: string;
  stats?: YoutubeVideoStats;
};

async function youtubeGet<T>(
  accessToken: string,
  pathname: string,
  params: Record<string, string>
): Promise<T> {
  const url = `${YT_API}/${pathname}?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000)
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message || `YouTube API ${pathname} failed (${response.status})`);
  }
  return json;
}

function num(value: string | undefined): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchYoutubeChannelStats(): Promise<YoutubeChannelStats> {
  const accessToken = await getYoutubeAccessToken();
  const data = await youtubeGet<{
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        customUrl?: string;
        thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
      };
      statistics?: {
        subscriberCount?: string;
        viewCount?: string;
        videoCount?: string;
      };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  }>(accessToken, 'channels', {
    part: 'snippet,statistics,contentDetails',
    mine: 'true'
  });

  const item = data.items?.[0];
  if (!item?.id) throw new Error('No YouTube channel returned for this OAuth account');

  const thumb =
    item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url;
  return {
    id: item.id,
    title: item.snippet?.title || 'YouTube channel',
    ...(item.snippet?.customUrl ? { customUrl: item.snippet.customUrl } : {}),
    ...(thumb ? { thumbnailUrl: thumb } : {}),
    subscriberCount: num(item.statistics?.subscriberCount),
    viewCount: num(item.statistics?.viewCount),
    videoCount: num(item.statistics?.videoCount),
    ...(item.contentDetails?.relatedPlaylists?.uploads
      ? { uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads }
      : {}),
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchYoutubeVideoStats(ids: string[]): Promise<YoutubeVideoStats[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const accessToken = await getYoutubeAccessToken();
  const out: YoutubeVideoStats[] = [];

  // videos.list allows up to 50 ids per call
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const data = await youtubeGet<{
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
        contentDetails?: { duration?: string };
        status?: { privacyStatus?: string };
      }>;
    }>(accessToken, 'videos', {
      part: 'snippet,statistics,contentDetails,status',
      id: batch.join(',')
    });

    for (const item of data.items || []) {
      if (!item.id) continue;
      const thumb =
        item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url;
      out.push({
        id: item.id,
        title: item.snippet?.title || item.id,
        description: item.snippet?.description || '',
        publishedAt: item.snippet?.publishedAt || '',
        ...(item.contentDetails?.duration ? { duration: item.contentDetails.duration } : {}),
        ...(thumb ? { thumbnailUrl: thumb } : {}),
        viewCount: num(item.statistics?.viewCount),
        likeCount: num(item.statistics?.likeCount),
        commentCount: num(item.statistics?.commentCount),
        ...(item.status?.privacyStatus ? { privacyStatus: item.status.privacyStatus } : {}),
        url: `https://www.youtube.com/shorts/${item.id}`
      });
    }
  }

  return out;
}

export async function fetchYoutubeRecentUploads(limit = 25): Promise<YoutubeVideoStats[]> {
  const channel = await fetchYoutubeChannelStats();
  if (!channel.uploadsPlaylistId) {
    throw new Error('Channel has no uploads playlist id');
  }
  const accessToken = await getYoutubeAccessToken();
  const max = Math.min(Math.max(limit, 1), 50);
  const playlist = await youtubeGet<{
    items?: Array<{ contentDetails?: { videoId?: string } }>;
  }>(accessToken, 'playlistItems', {
    part: 'contentDetails',
    playlistId: channel.uploadsPlaylistId,
    maxResults: String(max)
  });
  const ids = (playlist.items || [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  return fetchYoutubeVideoStats(ids);
}

async function listPublishEpisodeIds(): Promise<string[]> {
  const root = path.resolve(process.env.PUBLISH_DIR || 'output/publish');
  try {
    const names = await readdir(root, { withFileTypes: true });
    return names.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

/** Factory-published YouTube videos from local publish ledger + live stats. */
export async function fetchFactoryYoutubeAnalytics(options?: {
  episodeId?: string;
  withStats?: boolean;
}): Promise<FactoryYoutubePublish[]> {
  const episodeIds = options?.episodeId
    ? [options.episodeId]
    : await listPublishEpisodeIds();
  const rows: FactoryYoutubePublish[] = [];

  for (const episodeId of episodeIds) {
    const ledger = await loadPublishLedger(episodeId);
    for (const item of ledger) {
      if (item.platform !== 'youtube') continue;
      if (item.status !== 'uploaded' && item.status !== 'scheduled') continue;
      if (!item.id) continue;
      rows.push({
        episodeId,
        videoId: item.id,
        ...(item.url ? { url: item.url } : {}),
        ...(item.titleUsed ? { titleUsed: item.titleUsed } : {}),
        status: item.status,
        ...(item.recordedAt ? { recordedAt: item.recordedAt } : {})
      });
    }
  }

  // Prefer newest first
  rows.sort((a, b) => String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));

  if (options?.withStats === false || !rows.length) return rows;

  const stats = await fetchYoutubeVideoStats(rows.map((row) => row.videoId));
  const byId = new Map(stats.map((item) => [item.id, item]));
  return rows.map((row) => {
    const live = byId.get(row.videoId);
    return live ? { ...row, stats: live } : row;
  });
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
