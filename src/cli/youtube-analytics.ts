#!/usr/bin/env node
/**
 * Multi-platform analytics CLI (YouTube Data API + Meta Graph).
 *
 *   npm run analytics:channel
 *   npm run analytics:videos -- --limit 20
 *   npm run analytics:video -- --id VIDEO_ID
 *   npm run analytics:factory
 *   npm run analytics:factory -- --platform instagram
 *   npm run analytics:factory -- --episode why-bhishma-lowered-his-bow --platform facebook
 */
import '../lib/loadEnv.js';
import {
  fetchFactoryPublishes,
  type AnalyticsPlatform
} from '../providers/multiPlatformAnalytics.js';
import {
  fetchYoutubeChannelStats,
  fetchYoutubeRecentUploads,
  fetchYoutubeVideoStats,
  formatCount
} from '../providers/youtubeAnalytics.js';
import {
  fetchFacebookPageStats,
  fetchInstagramAccountStats
} from '../providers/metaAnalytics.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function command(): string {
  const positional = args.find((argument) => !argument.startsWith('-'));
  return (positional || process.env.ANALYTICS_COMMAND || 'channel').toLowerCase();
}

function platformFilter(): AnalyticsPlatform {
  const raw = (valueFor('--platform') || 'all').toLowerCase();
  if (raw === 'youtube' || raw === 'instagram' || raw === 'facebook' || raw === 'all') {
    return raw;
  }
  throw new Error('--platform must be all|youtube|instagram|facebook');
}

async function main(): Promise<void> {
  const kind = command();

  if (kind === 'channel') {
    const platform = platformFilter();
    if (platform === 'youtube' || platform === 'all') {
      const channel = await fetchYoutubeChannelStats();
      console.log(`YouTube: ${channel.title}${channel.customUrl ? ` (${channel.customUrl})` : ''}`);
      console.log(`  Subscribers: ${formatCount(channel.subscriberCount)}`);
      console.log(`  Views: ${formatCount(channel.viewCount)}`);
      console.log(`  Videos: ${formatCount(channel.videoCount)}`);
    }
    if (platform === 'instagram' || platform === 'all') {
      const ig = await fetchInstagramAccountStats();
      if (ig) {
        console.log(`Instagram: @${ig.username || ig.name}`);
        console.log(`  Followers: ${formatCount(ig.followersCount)}`);
        if (ig.mediaCount != null) console.log(`  Media: ${formatCount(ig.mediaCount)}`);
      } else if (platform === 'instagram') {
        console.log('Instagram not configured.');
      }
    }
    if (platform === 'facebook' || platform === 'all') {
      const fb = await fetchFacebookPageStats();
      if (fb) {
        console.log(`Facebook: ${fb.name}`);
        console.log(`  Followers: ${formatCount(fb.followersCount)}`);
      } else if (platform === 'facebook') {
        console.log('Facebook not configured.');
      }
    }
    return;
  }

  if (kind === 'videos') {
    const limit = Number(valueFor('--limit') || '25');
    const videos = await fetchYoutubeRecentUploads(limit);
    console.log(`Recent YouTube uploads (${videos.length}):\n`);
    for (const video of videos) {
      console.log(
        `${video.id}  views=${formatCount(video.viewCount)}  likes=${formatCount(video.likeCount)}  comments=${formatCount(video.commentCount)}`
      );
      console.log(`  ${video.title}`);
      console.log(`  ${video.url}\n`);
    }
    return;
  }

  if (kind === 'video') {
    const id = valueFor('--id');
    if (!id) throw new Error('Usage: npm run analytics:video -- --id VIDEO_ID');
    const [video] = await fetchYoutubeVideoStats([id]);
    if (!video) throw new Error(`Video not found: ${id}`);
    console.log(JSON.stringify(video, null, 2));
    return;
  }

  if (kind === 'factory') {
    const episodeId = valueFor('--episode');
    const platform = platformFilter();
    const rows = await fetchFactoryPublishes({
      ...(episodeId ? { episodeId } : {}),
      platform,
      withStats: true
    });
    if (!rows.length) {
      console.log(`No ${platform === 'all' ? '' : platform + ' '}uploads found in output/publish.`);
      return;
    }
    console.log(`Factory publishes (${rows.length}) · platform=${platform}\n`);
    for (const row of rows) {
      console.log(
        `[${row.platform}] ${row.episodeId}  ${row.videoId || '-'}  ${row.status}` +
          (row.kind ? `  ${row.kind}` : '') +
          (row.viewCount != null ? `  views=${formatCount(row.viewCount)}` : '') +
          (row.likeCount != null ? ` likes=${formatCount(row.likeCount)}` : '') +
          (row.commentCount != null ? ` comments=${formatCount(row.commentCount)}` : '') +
          (row.error ? `  ERROR=${row.error}` : '')
      );
      console.log(`  ${row.titleUsed || '(no title)'}`);
      console.log(`  ${row.url || ''}\n`);
    }
    return;
  }

  throw new Error(`Unknown command "${kind}". Use channel | videos | video | factory`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
