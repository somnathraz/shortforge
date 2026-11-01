#!/usr/bin/env node
/**
 * Publish APPROVED final Short to YouTube / Instagram / Facebook.
 * Hard gate: production report reviewStatus must be APPROVED.
 */
import '../lib/loadEnv.js';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { brandEpisodesDir, currentBrandId } from '../lib/brands.js';
import { EpisodeSchema } from '../schema/episode.js';
import { PackagingLanguageSchema } from '../schema/packaging.js';
import {
  PUBLISH_PLATFORMS,
  type PublishPlatform,
  publishEpisode
} from '../pipeline/publish.js';
import type { YoutubePrivacy } from '../providers/youtubeUpload.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function resolveEpisodePath(raw?: string): Promise<string> {
  if (!raw) {
    throw new Error(
      [
        'Usage: npm run publish -- --episode <id|path.json> [--platforms youtube,instagram,facebook]',
        '       [--language hi|en] [--schedule ISO] [--dry-run] [--force] [--privacy private|unlisted|public]',
        'Requires: npm run review -- --episode <id> --action APPROVE'
      ].join('\n')
    );
  }
  if (raw.endsWith('.json') || raw.includes('/') || raw.includes('\\')) {
    await access(raw);
    return path.resolve(raw);
  }
  const dir = brandEpisodesDir();
  const files = await readdir(dir);
  const needle = raw.toLowerCase();
  const byName = files.find((f) => f.toLowerCase().includes(needle) && f.endsWith('.json'));
  if (byName) return path.join(dir, byName);
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as { id?: string };
      if (parsed.id === raw) return path.join(dir, file);
    } catch {
      // continue
    }
  }
  throw new Error(
    `No episode matching "${raw}" in ${path.relative(process.cwd(), dir)} (${currentBrandId()})`
  );
}

async function main(): Promise<void> {
  const episodePath = await resolveEpisodePath(valueFor('--episode'));
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  const platformsRaw = valueFor('--platforms') || process.env.PUBLISH_PLATFORMS || 'youtube,instagram,facebook';
  const platforms = platformsRaw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean) as PublishPlatform[];
  for (const p of platforms) {
    if (!PUBLISH_PLATFORMS.includes(p)) {
      throw new Error(`Unknown platform "${p}". Use: ${PUBLISH_PLATFORMS.join(', ')}`);
    }
  }

  const privacyRaw = (valueFor('--privacy') || process.env.YOUTUBE_PRIVACY || 'private') as YoutubePrivacy;
  if (!['private', 'unlisted', 'public'].includes(privacyRaw)) {
    throw new Error('--privacy must be private|unlisted|public');
  }

  const dryRun = args.includes('--dry-run') || process.env.PUBLISH_DRY_RUN === 'true';
  const requirePackaging = args.includes('--require-packaging');
  const force = args.includes('--force') || process.env.PUBLISH_FORCE === 'true';
  const language = PackagingLanguageSchema.parse(
    valueFor('--language') || process.env.PACKAGING_LANGUAGE || process.env.DEFAULT_LANGUAGE || 'hi'
  );

  const formatsRaw = (valueFor('--meta-formats') || '').trim().toLowerCase();
  let metaFormats: { reel: boolean; story: boolean } | undefined;
  if (formatsRaw) {
    const parts = new Set(formatsRaw.split(/[,\s]+/).filter(Boolean));
    metaFormats = {
      reel: parts.has('reel') || parts.has('reels'),
      story: parts.has('story') || parts.has('stories')
    };
    if (!metaFormats.reel && !metaFormats.story) {
      throw new Error('--meta-formats must include reel and/or story');
    }
  }

  console.log(`Publish ${episode.id}${dryRun ? ' (dry-run)' : ''}${force ? ' (force)' : ''}`);
  console.log(`Platforms: ${platforms.join(', ')}`);
  const scheduleRaw = valueFor('--schedule') || valueFor('--schedule-at');
  if (scheduleRaw) console.log(`Schedule: ${scheduleRaw}`);
  if (metaFormats) {
    console.log(
      `Meta formats: ${[metaFormats.reel ? 'reel' : null, metaFormats.story ? 'story' : null]
        .filter(Boolean)
        .join(', ')}`
    );
  }

  const videoRaw = valueFor('--video');
  const report = await publishEpisode({
    episode,
    platforms,
    dryRun,
    force,
    privacy: privacyRaw,
    requirePackaging,
    language,
    episodeFile: path.basename(episodePath),
    ...(scheduleRaw ? { scheduleAt: scheduleRaw } : {}),
    ...(metaFormats ? { metaFormats } : {}),
    ...(videoRaw
      ? {
          videoPath: path.isAbsolute(videoRaw)
            ? videoRaw
            : path.resolve(process.cwd(), videoRaw.startsWith('output/') ? videoRaw : `output/${videoRaw}`)
        }
      : {})
  });

  console.log(`Packaging: ${report.packagingUsed ? 'yes' : 'fallback metadata'}`);
  if (report.scheduledAt) console.log(`Scheduled for: ${report.scheduledAt}`);
  for (const result of report.results) {
    if (result.status === 'uploaded') {
      console.log(`✓ ${result.platform}: ${result.url || result.id}${result.titleUsed ? ` — ${result.titleUsed}` : ''}`);
    } else if (result.status === 'scheduled') {
      console.log(
        `⏰ ${result.platform}: scheduled${result.scheduledAt ? ` @ ${result.scheduledAt}` : ''}${result.scheduleId ? ` (queue ${result.scheduleId})` : ''}${result.url ? ` — ${result.url}` : ''}${result.reason ? ` — ${result.reason}` : ''}`
      );
    } else if (result.status === 'dry_run') {
      console.log(
        `· ${result.platform}: ${result.reason}${result.titleUsed ? ` | title: ${result.titleUsed}` : ''}${result.coverPath ? ` | cover: ${result.coverPath}` : ''}`
      );
    } else if (result.status === 'skipped') {
      console.log(`– ${result.platform}: skipped — ${result.reason}`);
    } else {
      console.log(`✗ ${result.platform}: ${result.error}`);
    }
  }

  const failed = report.results.filter((r) => r.status === 'failed');
  if (failed.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
