/**
 * Cross-platform factory publish analytics (YouTube + Instagram + Facebook).
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadPublishLedger } from '../lib/publishLedger.js';
import {
  extractMetaMediaIds,
  fetchFacebookMediaStats,
  fetchFacebookPageStats,
  fetchInstagramAccountStats,
  fetchInstagramMediaStats,
  type MetaAccountStats,
  type MetaMediaStats
} from './metaAnalytics.js';
import {
  fetchYoutubeChannelStats,
  fetchYoutubeRecentUploads,
  fetchYoutubeVideoStats,
  type YoutubeChannelStats,
  type YoutubeVideoStats
} from './youtubeAnalytics.js';

export type AnalyticsPlatform = 'all' | 'youtube' | 'instagram' | 'facebook';

export type FactoryPublishRow = {
  platform: 'youtube' | 'instagram' | 'facebook';
  episodeId: string;
  status: string;
  videoId?: string;
  url?: string;
  titleUsed?: string;
  recordedAt?: string;
  kind?: 'reel' | 'story' | 'video' | 'short';
  /** Normalized metrics for the dashboard table */
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  reach?: number;
  youtubeStats?: YoutubeVideoStats;
  metaStats?: MetaMediaStats;
  error?: string;
};

async function listPublishEpisodeIds(): Promise<string[]> {
  const root = path.resolve(process.env.PUBLISH_DIR || 'output/publish');
  try {
    const names = await readdir(root, { withFileTypes: true });
    return names.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

function matchesPlatform(
  platform: string,
  filter: AnalyticsPlatform
): platform is 'youtube' | 'instagram' | 'facebook' {
  if (filter === 'all') {
    return platform === 'youtube' || platform === 'instagram' || platform === 'facebook';
  }
  return platform === filter;
}

export async function fetchFactoryPublishes(options?: {
  episodeId?: string;
  platform?: AnalyticsPlatform;
  withStats?: boolean;
}): Promise<FactoryPublishRow[]> {
  const filter = options?.platform || 'all';
  const withStats = options?.withStats !== false;
  const episodeIds = options?.episodeId ? [options.episodeId] : await listPublishEpisodeIds();
  const rows: FactoryPublishRow[] = [];

  for (const episodeId of episodeIds) {
    const ledger = await loadPublishLedger(episodeId);
    for (const item of ledger) {
      if (!matchesPlatform(item.platform, filter)) continue;
      if (item.status !== 'uploaded' && item.status !== 'scheduled') continue;

      if (item.platform === 'youtube') {
        if (!item.id) continue;
        rows.push({
          platform: 'youtube',
          episodeId,
          status: item.status,
          videoId: item.id,
          ...(item.url ? { url: item.url } : {}),
          ...(item.titleUsed ? { titleUsed: item.titleUsed } : {}),
          ...(item.recordedAt ? { recordedAt: item.recordedAt } : {}),
          kind: 'short'
        });
        continue;
      }

      const mediaIds = extractMetaMediaIds(item.id, item.formats);
      if (!mediaIds.length) {
        rows.push({
          platform: item.platform,
          episodeId,
          status: item.status,
          ...(item.id ? { videoId: item.id } : {}),
          ...(item.url ? { url: item.url } : {}),
          ...(item.titleUsed ? { titleUsed: item.titleUsed } : {}),
          ...(item.recordedAt ? { recordedAt: item.recordedAt } : {})
        });
        continue;
      }

      for (const media of mediaIds) {
        // Stories expire — still list them, stats may fail.
        const formatUrl = item.formats?.find((f) => f.id === media.id)?.url || item.url;
        rows.push({
          platform: item.platform,
          episodeId,
          status: item.status,
          videoId: media.id,
          ...(formatUrl ? { url: formatUrl } : {}),
          ...(item.titleUsed ? { titleUsed: item.titleUsed } : {}),
          ...(item.recordedAt ? { recordedAt: item.recordedAt } : {}),
          ...(media.kind ? { kind: media.kind } : {})
        });
      }
    }
  }

  rows.sort((a, b) => String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));
  if (!withStats || !rows.length) return rows;

  const youtubeIds = [
    ...new Set(rows.filter((row) => row.platform === 'youtube' && row.videoId).map((row) => row.videoId!))
  ];
  const youtubeStats = youtubeIds.length ? await fetchYoutubeVideoStats(youtubeIds) : [];
  const youtubeById = new Map(youtubeStats.map((item) => [item.id, item]));

  const enriched: FactoryPublishRow[] = [];
  for (const row of rows) {
    if (row.platform === 'youtube' && row.videoId) {
      const stats = youtubeById.get(row.videoId);
      enriched.push(
        stats
          ? {
              ...row,
              youtubeStats: stats,
              viewCount: stats.viewCount,
              likeCount: stats.likeCount,
              commentCount: stats.commentCount,
              titleUsed: row.titleUsed || stats.title,
              url: row.url || stats.url
            }
          : row
      );
      continue;
    }

    if (!row.videoId) {
      enriched.push(row);
      continue;
    }

    try {
      const metaStats =
        row.platform === 'instagram'
          ? await fetchInstagramMediaStats(row.videoId, row.kind === 'story' || row.kind === 'reel' ? row.kind : undefined)
          : await fetchFacebookMediaStats(row.videoId, row.kind === 'story' || row.kind === 'reel' ? row.kind : undefined);
      const titleUsed =
        row.titleUsed || metaStats.title || (metaStats.caption ? metaStats.caption.slice(0, 80) : undefined);
      const url = row.url || metaStats.permalink;
      enriched.push({
        ...row,
        metaStats,
        ...(metaStats.error ? { error: metaStats.error } : {}),
        ...(metaStats.viewCount != null ? { viewCount: metaStats.viewCount } : {}),
        ...(metaStats.likeCount != null ? { likeCount: metaStats.likeCount } : {}),
        ...(metaStats.commentCount != null ? { commentCount: metaStats.commentCount } : {}),
        ...(metaStats.reach != null ? { reach: metaStats.reach } : {}),
        ...(titleUsed ? { titleUsed } : {}),
        ...(url ? { url } : {})
      });
    } catch (error) {
      enriched.push({
        ...row,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return enriched;
}

export type MultiPlatformOverview = {
  platform: AnalyticsPlatform;
  youtube?: {
    channel: YoutubeChannelStats;
    recentVideos: YoutubeVideoStats[];
  };
  facebook?: { page: MetaAccountStats };
  instagram?: { account: MetaAccountStats };
  factoryPublishes: FactoryPublishRow[];
  totals: {
    publishCount: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    byPlatform: Record<
      string,
      { publishCount: number; viewCount: number; likeCount: number; commentCount: number }
    >;
  };
  fetchedAt: string;
  warnings?: string[];
};

function emptyPlatformTotals() {
  return { publishCount: 0, viewCount: 0, likeCount: 0, commentCount: 0 };
}

export async function fetchMultiPlatformOverview(
  platform: AnalyticsPlatform = 'all'
): Promise<MultiPlatformOverview> {
  const factoryPublishes = await fetchFactoryPublishes({ platform, withStats: true });

  const byPlatform: MultiPlatformOverview['totals']['byPlatform'] = {
    youtube: emptyPlatformTotals(),
    instagram: emptyPlatformTotals(),
    facebook: emptyPlatformTotals()
  };

  let viewCount = 0;
  let likeCount = 0;
  let commentCount = 0;
  for (const row of factoryPublishes) {
    const bucket = byPlatform[row.platform] || emptyPlatformTotals();
    bucket.publishCount += 1;
    bucket.viewCount += row.viewCount || 0;
    bucket.likeCount += row.likeCount || 0;
    bucket.commentCount += row.commentCount || 0;
    byPlatform[row.platform] = bucket;
    viewCount += row.viewCount || 0;
    likeCount += row.likeCount || 0;
    commentCount += row.commentCount || 0;
  }

  const overview: MultiPlatformOverview = {
    platform,
    factoryPublishes,
    totals: {
      publishCount: factoryPublishes.length,
      viewCount,
      likeCount,
      commentCount,
      byPlatform
    },
    fetchedAt: new Date().toISOString()
  };

  if (platform === 'all' || platform === 'youtube') {
    try {
      const [channel, recentVideos] = await Promise.all([
        fetchYoutubeChannelStats(),
        fetchYoutubeRecentUploads(12)
      ]);
      overview.youtube = { channel, recentVideos };
    } catch (error) {
      if (platform === 'youtube' && !factoryPublishes.length) throw error;
    }
  }

  if (platform === 'all' || platform === 'facebook') {
    try {
      const page = await fetchFacebookPageStats();
      if (page) overview.facebook = { page };
    } catch {
      // optional
    }
  }

  if (platform === 'all' || platform === 'instagram') {
    try {
      const account = await fetchInstagramAccountStats();
      if (account) overview.instagram = { account };
    } catch {
      // optional
    }
  }

  return overview;
}
