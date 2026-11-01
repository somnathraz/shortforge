import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { outputDir } from './paths.js';
import type { Episode } from '../schema/episode.js';
import { publishingTitle } from '../lib/publishingTitles.js';
import { currentBrandId } from '../lib/brands.js';
import { brandPublishProfiles } from '../lib/publishConnections.js';

type PackPlatform = 'youtube' | 'instagram' | 'facebook';

function brandPackPlatforms(): PackPlatform[] {
  const profiles = brandPublishProfiles(currentBrandId());
  return profiles.length ? profiles : (['youtube', 'instagram', 'facebook'] as PackPlatform[]);
}

/** Apply titles together in one save; descriptions, covers and other languages stay intact. */
export async function applyJsonTitles(episode: Episode, language: 'hi' | 'en', target: 'all' | 'youtube' | 'instagram' | 'facebook', sharedOnly: boolean): Promise<PackagingView> {
  const loaded = await readRawPackaging(episode.id, language);
  if (!loaded) throw new Error('Create a delivery pack first. Seed from episode uses no AI.');
  const platforms = target === 'all' ? brandPackPlatforms() : [target];
  for (const platform of platforms) {
    const title = publishingTitle(episode, language, platform, sharedOnly);
    if (title.length < 3 || title.length > 100) throw new Error(`${platform} title must be 3–100 characters`);
    if (!loaded.raw.platforms[platform]) throw new Error(`Missing ${platform} pack`);
    loaded.raw.platforms[platform]!.title = title;
  }
  const dir = packagingDir(episode.id);
  const json = `${JSON.stringify(loaded.raw, null, 2)}\n`;
  await writeFile(packagingJsonPath(episode.id, language), json, 'utf8');
  await writeFile(path.join(dir, 'packaging.json'), json, 'utf8');
  for (const platform of platforms) {
    const text = `${buildPasteText(loaded.raw.platforms[platform]!)}\n`;
    await writeFile(path.join(dir, `${platform}.${language}.txt`), text, 'utf8');
    await writeFile(path.join(dir, `${platform}.txt`), text, 'utf8');
  }
  return (await loadPackaging(episode.id, language))!;
}

export type PlatformPackView = {
  platform: 'youtube' | 'instagram' | 'facebook';
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  cta: string;
  coverAspect: string;
  coverUrl?: string;
  pasteText: string;
};

export type PackagingView = {
  episodeId: string;
  createdAt: string;
  language: 'hi' | 'en';
  imageProvider: string;
  sharedHookHi: string;
  thumbnailTextHi: string;
  platforms: PlatformPackView[];
  files: string[];
};

type RawPlatformPack = {
  platform: 'youtube' | 'instagram' | 'facebook';
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  cta: string;
  coverPrompt?: string;
  coverAspect: string;
  coverPath?: string;
};

type RawPackaging = {
  episodeId: string;
  createdAt: string;
  language?: 'hi' | 'en';
  imageProvider: string;
  sharedHookHi: string;
  thumbnailTextHi: string;
  platforms: Record<string, RawPlatformPack>;
};

export type PlatformPackPatch = {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  cta: string;
};

function packagingDir(episodeId: string): string {
  return path.join(outputDir(), 'packaging', episodeId);
}

function packagingJsonPath(episodeId: string, language: 'hi' | 'en'): string {
  return path.join(packagingDir(episodeId), `packaging.${language}.json`);
}

function toPublic(absolute: string): string | undefined {
  const root = outputDir();
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return undefined;
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  return `/api/media/${relative}`;
}

function buildPasteText(pack: {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  cta: string;
}): string {
  return [
    `TITLE: ${pack.title}`,
    '',
    'DESCRIPTION:',
    pack.description,
    '',
    `CTA: ${pack.cta}`,
    '',
    `TAGS: ${pack.tags.join(', ')}`,
    `HASHTAGS: ${pack.hashtags.join(' ')}`
  ].join('\n');
}

async function readRawPackaging(
  episodeId: string,
  language?: 'hi' | 'en'
): Promise<{ raw: RawPackaging; jsonPath: string } | null> {
  const dir = packagingDir(episodeId);
  const candidates = language
    ? [packagingJsonPath(episodeId, language), path.join(dir, 'packaging.json')]
    : [path.join(dir, 'packaging.json')];
  for (const jsonPath of candidates) {
    try {
      await access(jsonPath);
      const candidate: RawPackaging = JSON.parse(await readFile(jsonPath, 'utf8')) as RawPackaging;
      const candidateLanguage = candidate.language || 'hi';
      if (!language || candidateLanguage === language) {
        return { raw: candidate, jsonPath };
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function loadPackaging(
  episodeId: string,
  language?: 'hi' | 'en'
): Promise<PackagingView | null> {
  const loaded = await readRawPackaging(episodeId, language);
  if (!loaded) return null;
  const { raw } = loaded;

  const files = (await readdir(packagingDir(episodeId))).sort();
  const allowed = new Set(brandPackPlatforms());
  const platforms: PlatformPackView[] = [];
  for (const key of ['youtube', 'instagram', 'facebook'] as const) {
    if (!allowed.has(key)) continue;
    const pack = raw.platforms[key];
    if (!pack) continue;
    let coverUrl: string | undefined;
    if (pack.coverPath) {
      const absolute = path.isAbsolute(pack.coverPath)
        ? pack.coverPath
        : path.resolve(pack.coverPath);
      coverUrl = toPublic(absolute);
    } else {
      const guess = files.find((name) => name.startsWith(`cover-${key}.`));
      if (guess) coverUrl = toPublic(path.join(packagingDir(episodeId), guess));
    }
    platforms.push({
      platform: key,
      title: pack.title,
      description: pack.description,
      tags: pack.tags,
      hashtags: pack.hashtags,
      cta: pack.cta,
      coverAspect: pack.coverAspect,
      ...(coverUrl ? { coverUrl } : {}),
      pasteText: buildPasteText(pack)
    });
  }

  return {
    episodeId: raw.episodeId,
    createdAt: raw.createdAt,
    language: raw.language || 'hi',
    imageProvider: raw.imageProvider,
    sharedHookHi: raw.sharedHookHi,
    thumbnailTextHi: raw.thumbnailTextHi,
    platforms,
    files
  };
}

/** Persist custom title/description/tags for one platform (used by Publish UI). */
export async function updatePlatformPack(
  episodeId: string,
  language: 'hi' | 'en',
  platform: 'youtube' | 'instagram' | 'facebook',
  patch: PlatformPackPatch
): Promise<PackagingView> {
  const title = patch.title.trim();
  const description = patch.description.trim();
  const cta = patch.cta.trim();
  const tags = patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const hashtags = patch.hashtags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .slice(0, 30);

  if (title.length < 3 || title.length > 100) {
    throw new Error('Title must be 3–100 characters');
  }
  if (description.length < 20 || description.length > 5000) {
    throw new Error('Description must be 20–5000 characters');
  }
  if (cta.length < 3 || cta.length > 120) {
    throw new Error('CTA must be 3–120 characters');
  }
  if (tags.length < 1) throw new Error('Add at least one tag');
  if (hashtags.length < 1) throw new Error('Add at least one hashtag');

  const loaded = await readRawPackaging(episodeId, language);
  if (!loaded) {
    throw new Error(`No packaging for ${episodeId} (${language}). Run package first.`);
  }

  const existing = loaded.raw.platforms[platform];
  if (!existing) {
    throw new Error(`No ${platform} pack in packaging.${language}.json`);
  }

  const nextPack: RawPlatformPack = {
    ...existing,
    title,
    description,
    tags,
    hashtags,
    cta
  };
  const nextRaw: RawPackaging = {
    ...loaded.raw,
    language,
    platforms: {
      ...loaded.raw.platforms,
      [platform]: nextPack
    }
  };

  await mkdir(packagingDir(episodeId), { recursive: true });
  const primaryPath = packagingJsonPath(episodeId, language);
  await writeFile(primaryPath, `${JSON.stringify(nextRaw, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(packagingDir(episodeId), 'packaging.json'),
    `${JSON.stringify(nextRaw, null, 2)}\n`,
    'utf8'
  );

  const view = await loadPackaging(episodeId, language);
  if (!view) throw new Error('Failed to reload packaging after save');
  return view;
}
