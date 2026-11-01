#!/usr/bin/env node
/**
 * Generate platform packaging: titles, descriptions, tags/hashtags, cover images.
 * Output: output/packaging/<episodeId>/
 */
import '../lib/loadEnv.js';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { brandEpisodesDir, currentBrandId } from '../lib/brands.js';
import { EpisodeSchema } from '../schema/episode.js';
import { PackagingLanguageSchema } from '../schema/packaging.js';
import { packageEpisode, type PackagingImageProvider } from '../pipeline/packageEpisode.js';

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
        'Usage: npm run package -- --episode <id|path.json>',
        '       [--copy-provider openrouter|groq|openai|seed|blank]',
        '       [--language hi|en]',
        '       [--image-provider gemini|pollinations|none]',
        '       [--skip-covers]'
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
  const copyProvider = valueFor('--copy-provider');
  const imageRaw = valueFor('--image-provider');
  const imageProvider = (imageRaw ||
    (args.includes('--skip-covers') ? 'none' : undefined)) as PackagingImageProvider | undefined;
  const language = PackagingLanguageSchema.parse(
    valueFor('--language') || process.env.PACKAGING_LANGUAGE || process.env.DEFAULT_LANGUAGE || 'hi'
  );

  const packaging = await packageEpisode({
    episode,
    language,
    skipCovers: args.includes('--skip-covers'),
    ...(copyProvider ? { copyProvider } : {}),
    ...(imageProvider ? { imageProvider } : {})
  });

  console.log('\nPlatform packs:');
  for (const platform of ['youtube', 'instagram', 'facebook'] as const) {
    const pack = packaging.platforms[platform];
    console.log(`\n[${platform}] ${pack.title}`);
    console.log(`  tags: ${pack.tags.slice(0, 6).join(', ')}…`);
    console.log(`  cover: ${pack.coverPath || 'skipped'}`);
  }
  console.log('\nNext: npm run review … then npm run publish');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
