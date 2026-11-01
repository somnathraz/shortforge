import '../lib/loadEnv.js';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { loadBudget } from '../config/budget.js';
import { assertBudgetPolicy } from '../guards/episode.js';
import {
  generateEpisode,
  STORY_PROVIDERS,
  type RequestedStoryKind,
  type StoryProvider
} from '../pipeline/generateEpisode.js';
import { mockEpisode } from '../providers/mock.js';
import { slugify } from '../utils/slug.js';
import { nextUniqueEpisodeId, resolveEpisodeId } from '../lib/episodeIdentity.js';
import { isTechBrand,
  brandEpisodesDir,
  isBrandId,
  resolveBrandId,
  runWithBrandAsync,
  type BrandId
} from '../lib/brands.js';

const args = process.argv.slice(2);
const mockIndex = args.indexOf('--mock');
const useMock = mockIndex >= 0;
if (useMock) args.splice(mockIndex, 1);
const providerIndex = args.findIndex((argument) => argument === '--provider' || argument.startsWith('--provider='));
let provider = (process.env.STORY_PROVIDER || 'ollama') as StoryProvider;
if (providerIndex >= 0) {
  const option = args[providerIndex]!;
  if (option.includes('=')) {
    provider = option.slice(option.indexOf('=') + 1) as StoryProvider;
    args.splice(providerIndex, 1);
  } else {
    const value = args[providerIndex + 1];
    if (!value) {
      console.error('--provider requires gemini, ollama, nvidia, openai, openrouter, or groq');
      process.exit(1);
    }
    provider = value as StoryProvider;
    args.splice(providerIndex, 2);
  }
}
if (!STORY_PROVIDERS.includes(provider)) {
  console.error(`Unsupported provider: ${provider}. Use ${STORY_PROVIDERS.join(', ')}.`);
  process.exit(1);
}

const brandIndex = args.findIndex((argument) => argument === '--brand' || argument.startsWith('--brand='));
let brandId: BrandId = resolveBrandId(process.env.ACTIVE_BRAND);
if (brandIndex >= 0) {
  const option = args[brandIndex]!;
  let value: string | undefined;
  if (option.includes('=')) {
    value = option.slice(option.indexOf('=') + 1);
    args.splice(brandIndex, 1);
  } else {
    value = args[brandIndex + 1];
    if (!value) {
      console.error('--brand requires epicastra or tech-instagram');
      process.exit(1);
    }
    args.splice(brandIndex, 2);
  }
  if (!isBrandId(value)) {
    console.error(`Unsupported brand: ${value}`);
    process.exit(1);
  }
  brandId = value;
}

const kindIndex = args.findIndex((argument) => argument === '--kind' || argument.startsWith('--kind='));
let requestedKind = (
  isTechBrand(brandId) ? 'tech' : process.env.DEFAULT_STORY_KIND || 'canonical'
) as RequestedStoryKind;
if (kindIndex >= 0) {
  const option = args[kindIndex]!;
  if (option.includes('=')) {
    requestedKind = option.slice(option.indexOf('=') + 1) as RequestedStoryKind;
    args.splice(kindIndex, 1);
  } else {
    const value = args[kindIndex + 1];
    if (!value) {
      console.error('--kind requires canonical, lesser-known, fiction, auto, or tech');
      process.exit(1);
    }
    requestedKind = value as RequestedStoryKind;
    args.splice(kindIndex, 2);
  }
}
if (!['canonical', 'lesser-known', 'fiction', 'auto', 'tech'].includes(requestedKind)) {
  console.error(`Unsupported story kind: ${requestedKind}`);
  process.exit(1);
}
const topic = args.join(' ').trim();

if (!topic) {
  console.error(
    'Usage: npm run story -- [--mock] [--provider gemini|ollama|nvidia|openai|openrouter|groq] [--brand epicastra|tech-instagram] [--kind canonical|lesser-known|fiction|auto|tech] "Your topic"'
  );
  process.exit(1);
}

console.log(
  `Generating episode for: ${topic} (${useMock ? 'mock' : provider}, ${requestedKind}, brand=${brandId})`
);

try {
  let episode = await runWithBrandAsync(brandId, () =>
    generateEpisode(
      topic,
      useMock ? async (value) => mockEpisode(value) : undefined,
      provider,
      requestedKind,
      brandId
    )
  );
  const dir = brandEpisodesDir(brandId);
  await mkdir(dir, { recursive: true });
  const preferredId = resolveEpisodeId({
    id: episode.id,
    titleEn: episode.titleEn,
    topic: episode.topic
  });
  if (preferredId !== episode.id) {
    console.log(`Replacing placeholder id: ${episode.id} → ${preferredId}`);
    episode = { ...episode, id: preferredId };
  }
  const uniqueId = await nextUniqueEpisodeId(episode.id, dir);
  if (uniqueId !== episode.id) {
    console.log(`Keeping this as a separate draft: ${episode.id} → ${uniqueId}`);
    episode = { ...episode, id: uniqueId };
  }

  const file = `${Date.now()}-${slugify(topic)}.json`;
  const output = path.join(dir, file);
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
  const report = assertBudgetPolicy(episode, await loadBudget());

  console.log(`\nCreated: ${output}`);
  console.log(`Title: ${episode.titleHi}`);
  console.log(`Brand: ${episode.brandId || brandId} · ${episode.storyKind}`);
  console.log(`Scenes: ${episode.scenes.length}`);
  console.log(
    `Paid motion: ${report.paidMotionScenes} scenes / ${report.paidMotionSeconds}s / estimated ₹${report.estimatedCostInr}`
  );
  console.log(`Source review: ${episode.sourceReview.status}`);
} catch (error) {
  console.error('\nGeneration failed.');
  if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`- ${issue.path.join('.') || 'root'}: ${issue.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
    if (error.message.includes('fetch failed')) console.error('Is Ollama running? Try: ollama serve');
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
