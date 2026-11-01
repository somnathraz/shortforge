import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Episode } from '../schema/episode.js';
import type { PackagingLanguage } from '../schema/packaging.js';
import {
  type ProductionReport,
  finalRootDir,
  productionReportPath,
  writeProductionReport
} from '../lib/productionCost.js';
import {
  uploadYoutubeShort,
  youtubeConfigured,
  type YoutubePrivacy
} from '../providers/youtubeUpload.js';
import {
  facebookConfigured,
  instagramConfigured,
  publishFacebookReelAndStory,
  publishInstagramReelAndStory
} from '../providers/metaUpload.js';
import { isTechBrand, currentBrandId, getBrand, isBrandId, runWithBrandAsync, type BrandId } from '../lib/brands.js';
import {
  brandPublishProfiles,
  recordSeriesPublishDay,
  resolveBrandIdForPublish
} from '../lib/publishConnections.js';
import { loadPackaging, platformCaption } from './packageEpisode.js';
import { parseScheduleAt, toScheduleIso } from '../lib/publishSchedule.js';
import { createDeferredSchedule } from './publishSchedules.js';
import { loadPublishLedger, mergePublishLedgers } from '../lib/publishLedger.js';

export const PUBLISH_PLATFORMS = ['youtube', 'instagram', 'facebook'] as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

export type PlatformPublishResult = {
  platform: PublishPlatform;
  status: 'uploaded' | 'scheduled' | 'partial' | 'skipped' | 'dry_run' | 'failed';
  id?: string;
  url?: string;
  reason?: string;
  error?: string;
  titleUsed?: string;
  coverPath?: string;
  /** When status is scheduled — go-live time (ISO). */
  scheduledAt?: string | undefined;
  /** Deferred queue id when Instagram / Story will fire later. */
  scheduleId?: string | undefined;
  /** Meta: which formats landed (reel / story). */
  formats?: Array<{ kind: 'reel' | 'story'; id: string; url?: string | undefined }> | undefined;
};

export type PublishReport = {
  episodeId: string;
  publishedAt: string;
  dryRun: boolean;
  videoPath: string;
  packagingUsed: boolean;
  scheduledAt?: string;
  results: PlatformPublishResult[];
};

function publishRootDir(): string {
  return path.resolve(process.env.PUBLISH_DIR || 'output/publish');
}

function fallbackCaption(episode: Episode): { title: string; description: string; tags: string[] } {
  const isTech =
    isTechBrand(episode.brandId) || isTechBrand(currentBrandId());
  const keywordTags = episode.metadata.keywords.map((k) => `#${k.replace(/\s+/g, '')}`).join(' ');

  if (isTech) {
    const title = episode.titleEn || episode.titleHi;
    const description = [
      episode.titleEn || episode.hookHi,
      '',
      episode.metadata.descriptionHi || episode.ending.payoffHi,
      '',
      getBrand(isTechBrand(episode.brandId) ? episode.brandId! : currentBrandId()).ctaDefault,
      '',
      `#Reels #Tech #DSA ${keywordTags}`.trim()
    ].join('\n');
    return {
      title,
      description,
      tags: [...episode.metadata.keywords, 'tech', 'dsa', 'coding', 'interview'].slice(0, 15)
    };
  }

  const fictionNote = episode.fictionDisclosureRequired
    ? '\n\nयह मूल कल्पना / myth-inspired fiction है।'
    : '\n\nपारंपरिक कथा पर आधारित; स्रोत समीक्षा के बाद प्रकाशित।';
  const title = episode.titleHi || episode.titleEn;
  const description = [
    episode.hookHi,
    '',
    episode.metadata.descriptionHi,
    '',
    episode.ending.payoffHi,
    episode.ending.nextEpisodeTeaseHi,
    fictionNote,
    '',
    `#shorts #mythology ${keywordTags}`.trim()
  ].join('\n');
  return {
    title,
    description,
    tags: [...episode.metadata.keywords, 'mythology', 'shorts', 'hindi']
  };
}

async function loadApprovedReport(episodeId: string): Promise<ProductionReport> {
  const reportPath = productionReportPath(episodeId);
  await access(reportPath);
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as ProductionReport;
  if (report.reviewStatus !== 'APPROVED') {
    throw new Error(
      `Publish blocked: reviewStatus is ${report.reviewStatus}. Run: npm run review -- --episode ${episodeId} --action APPROVE`
    );
  }
  const ledger = mergePublishLedgers(
    await loadPublishLedger(episodeId),
    report.publish?.results || []
  );
  if (ledger.length) {
    report.publish = {
      lastAt: report.publish?.lastAt || ledger.at(-1)?.recordedAt || report.createdAt,
      dryRun: report.publish?.dryRun || false,
      results: ledger,
      ...(report.publish?.reportPath ? { reportPath: report.publish.reportPath } : {})
    };
  }
  return report;
}

function previousSuccessfulUpload(
  production: ProductionReport,
  platform: PublishPlatform,
  videoPath: string
): { id?: string; url?: string } | null {
  const results = production.publish?.results;
  if (!results?.length) return null;
  const hit = [...results]
    .reverse()
    .find(
      (item) =>
        item.platform === platform &&
        (!item.videoPath || path.resolve(item.videoPath) === path.resolve(videoPath)) &&
        (item.status === 'uploaded' || item.status === 'scheduled') &&
        (item.id || item.url || item.scheduleId || item.scheduledAt)
    );
  if (!hit) return null;
  return {
    ...(hit.id ? { id: hit.id } : {}),
    ...(hit.url ? { url: hit.url } : {})
  };
}

export async function publishEpisode(options: {
  episode: Episode;
  platforms: PublishPlatform[];
  dryRun?: boolean;
  privacy?: YoutubePrivacy;
  videoPath?: string;
  requirePackaging?: boolean;
  language?: PackagingLanguage;
  force?: boolean;
  /** Override META_PUBLISH_REEL / META_PUBLISH_STORY for this run. */
  metaFormats?: { reel: boolean; story: boolean };
  /** When set, schedule go-live (native YT/FB Reel; deferred queue for IG / FB Story). */
  scheduleAt?: string | Date;
  /** Episode JSON basename — required when deferring Instagram / FB Story. */
  episodeFile?: string;
}): Promise<PublishReport> {
  const brandId: BrandId = resolveBrandIdForPublish(
    isBrandId(options.episode.brandId) ? options.episode.brandId : undefined
  );
  return runWithBrandAsync(brandId, () => publishEpisodeForBrand(options, brandId));
}

async function publishEpisodeForBrand(
  options: {
    episode: Episode;
    platforms: PublishPlatform[];
    dryRun?: boolean;
    privacy?: YoutubePrivacy;
    videoPath?: string;
    requirePackaging?: boolean;
    language?: PackagingLanguage;
    force?: boolean;
    metaFormats?: { reel: boolean; story: boolean };
    scheduleAt?: string | Date;
    episodeFile?: string;
  },
  brandId: BrandId
): Promise<PublishReport> {
  const production = await loadApprovedReport(options.episode.id);
  const videoPath = path.resolve(
    options.videoPath || production.finalVideo || path.join(finalRootDir(), `${options.episode.id}.mp4`)
  );
  await access(videoPath);

  const scheduleDate = options.scheduleAt
    ? options.scheduleAt instanceof Date
      ? parseScheduleAt(options.scheduleAt.toISOString())
      : parseScheduleAt(options.scheduleAt)
    : undefined;
  const scheduleIso = scheduleDate ? toScheduleIso(scheduleDate) : undefined;

  const packaging = await loadPackaging(options.episode.id, options.language);
  if (options.requirePackaging && !packaging) {
    throw new Error(
      `Packaging required. Run: npm run package -- --episode ${options.episode.id}`
    );
  }
  if (!packaging) {
    console.warn('No packaging.json found — using episode metadata fallback. Prefer: npm run package');
  }

  const dryRun = options.dryRun === true || process.env.PUBLISH_DRY_RUN === 'true';
  const force = options.force === true || process.env.PUBLISH_FORCE === 'true';
  const fallback = fallbackCaption(options.episode);
  const results: PlatformPublishResult[] = [];
  const deferredPlatforms: PublishPlatform[] = [];
  let deferFacebookStory = false;
  const allowedPlatforms = new Set(brandPublishProfiles(brandId));

  for (const platform of options.platforms) {
    if (!allowedPlatforms.has(platform)) {
      results.push({
        platform,
        status: 'skipped',
        reason: `Platform ${platform} is not enabled for pipeline ${getBrand(brandId).label}`
      });
      continue;
    }
    const pack = packaging?.platforms[platform];
    const caption = pack ? platformCaption(pack) : fallback;
    const coverPath = pack?.coverPath;

    if (!dryRun && !force && !scheduleIso) {
      const previous = previousSuccessfulUpload(production, platform, videoPath);
      if (previous) {
        console.log(
          `Skip ${platform}: already uploaded${previous.url ? ` (${previous.url})` : previous.id ? ` (${previous.id})` : ''}. Use --force to republish.`
        );
        results.push({
          platform,
          status: 'skipped',
          reason: `Already uploaded${previous.url ? `: ${previous.url}` : ''}. Pass --force to upload again.`,
          titleUsed: caption.title,
          ...(previous.id ? { id: previous.id } : {}),
          ...(previous.url ? { url: previous.url } : {}),
          ...(coverPath ? { coverPath } : {})
        });
        continue;
      }
    }

    if (platform === 'youtube') {
      if (dryRun) {
        results.push({
          platform,
          status: 'dry_run',
          titleUsed: caption.title,
          ...(coverPath ? { coverPath } : {}),
          ...(scheduleIso ? { scheduledAt: scheduleIso } : {}),
          reason: youtubeConfigured(brandId)
            ? scheduleIso
              ? `Would schedule YouTube Short for ${scheduleIso} (private until then)`
              : `Would upload as YouTube Short (#Shorts) — ${options.privacy || process.env.YOUTUBE_PRIVACY || 'private'}`
            : `Would upload Short (credentials not set yet for ${brandId})`
        });
        continue;
      }
      if (!youtubeConfigured(brandId)) {
        results.push({
          platform,
          status: 'skipped',
          reason: `YouTube OAuth not configured for pipeline ${brandId}`
        });
        continue;
      }
      try {
        const uploaded = await uploadYoutubeShort({
          brandId,
          videoPath,
          title: caption.title,
          description: caption.description,
          tags: caption.tags,
          ...(options.privacy ? { privacy: options.privacy } : {}),
          ...(scheduleDate ? { publishAt: scheduleDate } : {})
        });
        if (isTechBrand(brandId) && !dryRun && uploaded.videoId) {
          try {
            recordSeriesPublishDay({
              brandId,
              episodeId: options.episode.id,
              ...(uploaded.playlistId ? { playlistId: uploaded.playlistId } : {}),
              playlistTitle: 'DSA 90 Days'
            });
          } catch (error) {
            console.warn(
              `[series] day tracker update skipped: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
        results.push({
          platform,
          status: scheduleIso ? 'scheduled' : 'uploaded',
          id: uploaded.videoId,
          url: uploaded.url,
          titleUsed: uploaded.title,
          ...(scheduleIso ? { scheduledAt: scheduleIso } : {}),
          ...(coverPath ? { coverPath } : {}),
          ...(uploaded.playlistUrl ? { reason: `Added to playlist ${uploaded.playlistUrl}` } : {})
        });
      } catch (error) {
        results.push({
          platform,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      continue;
    }

    if (platform === 'facebook') {
      const wantReel = options.metaFormats?.reel !== false;
      const wantStory = options.metaFormats?.story !== false;
      if (dryRun) {
        results.push({
          platform,
          status: 'dry_run',
          titleUsed: caption.title,
          ...(coverPath ? { coverPath } : {}),
          ...(scheduleIso ? { scheduledAt: scheduleIso } : {}),
          reason: facebookConfigured(brandId)
            ? scheduleIso
              ? `Would schedule Facebook Reel for ${scheduleIso}${wantStory ? '; Story deferred to queue' : ''}`
              : `Would publish Facebook ${[
                  wantReel ? 'Reel' : null,
                  wantStory ? 'Story' : null
                ]
                  .filter(Boolean)
                  .join(' + ') || 'formats'}`
            : 'Would upload (credentials not set yet)'
        });
        continue;
      }
      if (!facebookConfigured(brandId)) {
        results.push({
          platform,
          status: 'skipped',
          reason: `Facebook Page token missing for pipeline ${brandId} (data/connections/${brandId}.json)`
        });
        continue;
      }
      try {
        if (scheduleDate) {
          if (wantReel) {
            const uploaded = await publishFacebookReelAndStory({
              videoPath,
              caption: caption.description,
              title: caption.title,
              episodeId: options.episode.id,
              publishFormats: { reel: true, story: false },
              scheduledPublishTime: scheduleDate
            });
            results.push({
              platform,
              status: uploaded.errors?.length ? 'partial' : 'scheduled',
              id: uploaded.id,
              titleUsed: caption.title,
              scheduledAt: scheduleIso,
              ...(uploaded.url ? { url: uploaded.url } : {}),
              ...(coverPath ? { coverPath } : {}),
              ...(uploaded.formats ? { formats: uploaded.formats } : {}),
              ...(uploaded.errors?.length ? { error: `partial: ${uploaded.errors.join('; ')}` } : {})
            });
          }
          if (wantStory) {
            deferredPlatforms.push('facebook');
            deferFacebookStory = true;
          }
          if (!wantReel && wantStory) {
            results.push({
              platform,
              status: 'scheduled',
              titleUsed: caption.title,
              scheduledAt: scheduleIso,
              reason: 'Facebook Story queued for deferred publish (Graph cannot schedule Stories)',
              ...(coverPath ? { coverPath } : {})
            });
          }
        } else {
          const uploaded = await publishFacebookReelAndStory({
            videoPath,
            caption: caption.description,
            title: caption.title,
            episodeId: options.episode.id,
            ...(options.metaFormats ? { publishFormats: options.metaFormats } : {})
          });
          results.push({
            platform,
            status: uploaded.errors?.length ? 'partial' : 'uploaded',
            id: uploaded.id,
            titleUsed: caption.title,
            ...(uploaded.url ? { url: uploaded.url } : {}),
            ...(coverPath ? { coverPath } : {}),
            ...(uploaded.formats ? { formats: uploaded.formats } : {}),
            ...(uploaded.errors?.length ? { error: `partial: ${uploaded.errors.join('; ')}` } : {})
          });
        }
      } catch (error) {
        results.push({
          platform,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      continue;
    }

    if (platform === 'instagram') {
      if (dryRun) {
        results.push({
          platform,
          status: 'dry_run',
          titleUsed: caption.title,
          ...(coverPath ? { coverPath } : {}),
          ...(scheduleIso ? { scheduledAt: scheduleIso } : {}),
          reason: instagramConfigured(brandId)
            ? scheduleIso
              ? `Would queue Instagram for deferred publish at ${scheduleIso}`
              : `Would publish Instagram ${[
                  options.metaFormats?.reel !== false ? 'Reel' : null,
                  options.metaFormats?.story !== false ? 'Story' : null
                ]
                  .filter(Boolean)
                  .join(' + ') || 'formats'} (needs public video URL / S3)`
            : 'Would publish (credentials not set yet)'
        });
        continue;
      }
      if (!instagramConfigured(brandId)) {
        results.push({
          platform,
          status: 'skipped',
          reason: `Instagram not connected for pipeline ${brandId} — Authorize Instagram in Desk`
        });
        continue;
      }
      if (scheduleDate) {
        deferredPlatforms.push('instagram');
        results.push({
          platform,
          status: 'scheduled',
          titleUsed: caption.title,
          scheduledAt: scheduleIso,
          reason:
            'Instagram has no native schedule API — queued for automatic publish at the scheduled time',
          ...(coverPath ? { coverPath } : {})
        });
        continue;
      }
      try {
        const uploaded = await publishInstagramReelAndStory({
          videoPath,
          caption: `${caption.title}\n\n${caption.description}`,
          episodeId: options.episode.id,
          ...(options.metaFormats ? { publishFormats: options.metaFormats } : {})
        });
        results.push({
          platform,
          status: uploaded.errors?.length ? 'partial' : 'uploaded',
          id: uploaded.id,
          titleUsed: caption.title,
          ...(uploaded.url ? { url: uploaded.url } : {}),
          ...(coverPath ? { coverPath } : {}),
          ...(uploaded.formats ? { formats: uploaded.formats } : {}),
          ...(uploaded.errors?.length ? { error: `partial: ${uploaded.errors.join('; ')}` } : {})
        });
      } catch (error) {
        results.push({
          platform,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (scheduleDate && deferredPlatforms.length && !dryRun) {
    if (!options.episodeFile?.trim()) {
      throw new Error(
        'episodeFile is required to queue Instagram / Facebook Story schedules (pass the episode JSON basename)'
      );
    }
    const uniqueDeferred = [...new Set(deferredPlatforms)];
    for (const platform of uniqueDeferred) {
      const queued = await createDeferredSchedule({
        episodeId: options.episode.id,
        episodeFile: path.basename(options.episodeFile),
        platforms: [platform],
        scheduledAt: scheduleDate,
        ...(options.language ? { language: options.language } : {}),
        ...(options.privacy ? { privacy: options.privacy } : {}),
        ...(platform === 'facebook' && deferFacebookStory
          ? { metaFormats: { reel: false, story: true } }
          : options.metaFormats
            ? { metaFormats: options.metaFormats }
            : {}),
        videoPath,
        requirePackaging: options.requirePackaging === true,
        force,
        note:
          platform === 'instagram'
            ? 'Deferred Instagram publish (no native schedule API)'
            : 'Deferred Facebook Story publish (Graph cannot schedule Stories)'
      });
      for (const result of results) {
        if (result.status === 'scheduled' && result.platform === platform && !result.scheduleId) {
          result.scheduleId = queued.id;
        }
      }
      console.log(`Queued deferred publish ${queued.id} for ${platform} at ${scheduleIso}`);
    }
  }

  const report: PublishReport = {
    episodeId: options.episode.id,
    publishedAt: new Date().toISOString(),
    dryRun,
    videoPath,
    packagingUsed: Boolean(packaging),
    ...(scheduleIso ? { scheduledAt: scheduleIso } : {}),
    results
  };

  const outDir = path.join(publishRootDir(), options.episode.id);
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `publish-${Date.now()}.json`);
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  await writeProductionReport({
    ...production,
    publish: {
      lastAt: report.publishedAt,
      dryRun,
      results: mergePublishHistory(production.publish?.results, results, videoPath),
      reportPath: outPath
    }
  });

  return report;
}

export function mergePublishHistory(
  previous: NonNullable<ProductionReport['publish']>['results'] | undefined,
  current: PlatformPublishResult[],
  videoPath?: string
): NonNullable<ProductionReport['publish']>['results'] {
  const recordedAt = new Date().toISOString();
  const appended = current.map((item) => ({
      platform: item.platform,
      status: item.status,
      recordedAt,
      ...(item.id ? { id: item.id } : {}),
      ...(item.url ? { url: item.url } : {}),
      ...(item.reason ? { reason: item.reason } : {}),
      ...(item.error ? { error: item.error } : {}),
      ...(item.titleUsed ? { titleUsed: item.titleUsed } : {}),
      ...(item.coverPath ? { coverPath: item.coverPath } : {}),
      ...(item.scheduledAt ? { scheduledAt: item.scheduledAt } : {}),
      ...(item.scheduleId ? { scheduleId: item.scheduleId } : {}),
      ...(item.formats ? { formats: item.formats } : {}),
      ...(videoPath ? { videoPath } : {})
    }));
  // This is a ledger, not one mutable row per platform. Keeping earlier upload
  // IDs prevents a later dry-run or failed Meta attempt from erasing history.
  return [...(previous || []), ...appended].slice(-100);
}
