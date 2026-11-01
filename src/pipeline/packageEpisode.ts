import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Episode } from '../schema/episode.js';
import { publishingTitle } from '../lib/publishingTitles.js';
import {
  PackagingCopySchema,
  PackagingLanguageSchema,
  type EpisodePackaging,
  type PackagingCopy,
  type PackagingLanguage,
  type PackagingPlatformId,
  type PlatformPack
} from '../schema/packaging.js';
import { enrichVisualPrompt } from '../lib/characters.js';
import { isTechBrand, currentBrand, currentBrandId } from '../lib/brands.js';
import { brandPublishProfiles } from '../lib/publishConnections.js';
import { openRouterStructuredChat } from '../lib/openrouter.js';
import { groqStructuredChat } from '../lib/groq.js';
import { openAIStructuredChat } from '../lib/openai.js';
import { generateGeminiImage } from '../providers/geminiImage.js';
import { generatePollinationsImage } from '../providers/pollinations.js';

function activePackagingPlatforms(): PackagingPlatformId[] {
  const profiles = brandPublishProfiles(currentBrandId());
  return profiles.length ? profiles : (['youtube', 'instagram', 'facebook'] as PackagingPlatformId[]);
}

export type PackagingImageProvider = 'gemini' | 'pollinations' | 'none';
export type PackagingCopyProvider = 'openrouter' | 'groq' | 'openai' | 'seed' | 'blank';

const COVER_SPECS = {
  youtube: { aspectRatio: '16:9', width: 1280, height: 720, file: 'cover-youtube' },
  instagram: { aspectRatio: '9:16', width: 1080, height: 1920, file: 'cover-instagram' },
  facebook: { aspectRatio: '1:1', width: 1080, height: 1080, file: 'cover-facebook' }
} as const;

export function packagingRootDir(): string {
  return path.resolve(process.env.PACKAGING_DIR || 'output/packaging');
}

export function packagingPath(episodeId: string, language?: PackagingLanguage): string {
  return path.join(
    packagingRootDir(),
    episodeId,
    language ? `packaging.${language}.json` : 'packaging.json'
  );
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
}

/** Deterministic pack from episode fields — no LLM (avoids OpenRouter queue timeouts). */
export function seedPackagingCopy(episode: Episode, language: PackagingLanguage): PackagingCopy {
  const brand = currentBrand();
  const destinations = activePackagingPlatforms();
  const isTech = isTechBrand(brand.id) || isTechBrand(episode.brandId);
  const titleBase =
    language === 'en'
      ? episode.titleEn || episode.titleHi
      : episode.titleHi || episode.titleEn;
  const hook =
    language === 'en'
      ? episode.titleEn || episode.hookHi || episode.titleHi
      : episode.hookHi || episode.titleEn;
  const descBody =
    language === 'en' && isTech
      ? episode.metadata.descriptionHi ||
        episode.ending.payoffHi ||
        episode.titleEn ||
        episode.topic ||
        titleBase
      : episode.metadata.descriptionHi || episode.ending.payoffHi;
  const keywords = episode.metadata.keywords.length
    ? episode.metadata.keywords
    : isTech
      ? ['tech', 'dsa', 'coding', 'interview']
      : ['mythology', 'shorts', 'krishna', 'epic'];
  const tags = keywords.map((k) => clip(k, 40)).filter(Boolean).slice(0, 12);
  while (tags.length < 3) tags.push(isTech ? `tech${tags.length + 1}` : `mythology${tags.length + 1}`);
  const hashtags = tags
    .slice(0, 8)
    .map((tag) => `#${tag.replace(/^#/, '').replace(/\s+/g, '')}`)
    .filter((tag) => tag.length >= 2);
  while (hashtags.length < 3) {
    hashtags.push(isTech ? `#Tech${hashtags.length + 1}` : `#Mythology${hashtags.length + 1}`);
  }

  const followLine = brand.ctaDefault || (isTech ? 'Follow for daily tech shorts.' : 'Follow EpicAstra for more mythology Shorts.');
  const description = [isTech ? undefined : '#Shorts', hook, '', descBody, '', episode.ending.payoffHi, '', followLine]
    .filter(Boolean)
    .join('\n');

  const coverPrompt = clip(
    `${
      [...episode.scenes].sort((a, b) => b.importance - a.importance)[0]?.visualPrompt ||
      episode.scenes[0]?.visualPrompt ||
      (isTech
        ? 'Clean tech editorial diagram, high contrast, no text overlays'
        : 'Dramatic Indian mythology scene with readable faces')
    }. Bold cover composition, no text.`,
    500
  );

  const cta =
    language === 'en'
      ? isTech
        ? 'Save this for interview prep'
        : 'Watch till the end & follow EpicAstra'
      : isTech
        ? 'Save this for interview prep'
        : 'End tak dekho aur EpicAstra follow karo';

  const extras: Record<PackagingPlatformId, string[]> = {
    youtube: isTech ? ['#Shorts', '#Tech'] : ['#Shorts', '#Mythology'],
    instagram: isTech ? ['#Reels', '#Tech', '#DSA'] : ['#Reels', '#Mythology'],
    facebook: isTech ? ['#Reels', '#Tech'] : ['#FacebookReels']
  };

  const platform = (id: PackagingPlatformId, title: string, extraHashtags: string[]) => ({
    platform: id,
    title: clip(title, 100),
    description: clip(description, 5000),
    tags: tags.slice(0, 15),
    hashtags: [...hashtags, ...extraHashtags].slice(0, 20),
    cta,
    coverPrompt
  });

  return PackagingCopySchema.parse({
    sharedHookHi: clip(hook, 160),
    thumbnailTextHi: clip(episode.metadata.thumbnailTextHi || titleBase, 28),
    platforms: destinations.map((id) =>
      platform(id, publishingTitle(episode, language, id), extras[id])
    )
  });
}

/** Empty shells so the UI can collect custom title/description/tags. */
export function blankPackagingCopy(episode: Episode): PackagingCopy {
  const isTech = isTechBrand(currentBrandId());
  const coverPrompt = clip(
    `${
      episode.scenes[0]?.visualPrompt ||
      (isTech ? 'Tech editorial cover diagram' : 'Indian mythology cover scene')
    }. No text in image.`,
    500
  );
  const emptyPlatform = (platform: PackagingPlatformId) => ({
    platform,
    title: 'TODO title',
    description:
      'TODO description — replace this with your custom caption before publish. Keep at least twenty characters.',
    tags: ['todo', 'custom', 'pack'],
    hashtags: isTech ? ['#TODO', '#Tech', '#Reels'] : ['#TODO', '#Custom', '#Shorts'],
    cta: 'TODO CTA',
    coverPrompt
  });
  return PackagingCopySchema.parse({
    sharedHookHi: 'TODO shared hook',
    thumbnailTextHi: 'TODO thumb',
    platforms: activePackagingPlatforms().map(emptyPlatform)
  });
}

async function generateCopy(
  episode: Episode,
  provider: string,
  language: PackagingLanguage
): Promise<PackagingCopy> {
  if (provider === 'seed') return seedPackagingCopy(episode, language);
  if (provider === 'blank') return blankPackagingCopy(episode);

  const destinations = activePackagingPlatforms();
  const isTech =
    isTechBrand(currentBrandId()) || isTechBrand(episode.brandId);
  const languageRule =
    language === 'en'
      ? 'Write all audience-facing title, description, CTA, shared hook, and thumbnail text in natural English.'
      : [
          'Write all audience-facing title, description, CTA, shared hook, and thumbnail text in Hinglish:',
          'Hindi meaning and spoken rhythm, but written ONLY in English/Latin letters (Roman script).',
          'Example style: "Hanuman ne apni shaktiyan kyun bhool gaye?" / "Raat bhar chhupa raha ek raaz…"',
          'Do NOT use Devanagari (no Hindi script characters). Mix common English words naturally (power, secret, sister, birth) like real Shorts creators.',
          'Keep names readable in Roman: Krishna, Yogmaya, Hanuman, Kansa.'
        ].join(' ');
  const system = isTech
    ? `
You are a senior Instagram Reels growth editor for a tech education channel (DSA, system design, coding interviews).
Write packaging that stops the scroll and makes engineers save/share.

Return copy for exactly these platforms: ${destinations.join(', ')}.

Voice & attraction rules:
- ${languageRule}
- Titles must feel curiosity-heavy and practical: a gotcha, a visual mental model, or an interview trap.
- Prefer patterns like: "Why O(n²) kills your API…", "The array trick interviewers love…", "Big-O in 60 seconds…".
- Description: hook in line 1, teach one crisp insight in 2–4 short lines, soft CTA (save / follow for daily tech shorts).
- No mythology, no EpicAstra branding, no scripture references.
- Hashtags mix tech + interview + Reels intent.

Platform rules:
- Instagram: caption-first; strong first line; richer hashtags array.
${destinations.includes('youtube') ? '- YouTube title max ~70 chars; end with #Shorts when present.\n' : ''}${destinations.includes('facebook') ? '- Facebook: conversational; fewer hashtags.\n' : ''}- coverPrompt: English visual brief — clean tech editorial diagram, high contrast, NO text/watermark/logo.
- platforms array must include ${destinations.join(', ')} exactly once each.

thumbnailTextHi / sharedHookHi: ultra-short scroll-stoppers (few words), same language rules as above.
`
    : `
You are a senior Shorts growth editor for an Indian mythology YouTube / Reels / Facebook channel.
Your job is NOT dry summary copy. Write packaging that stops the scroll, creates suspense, and makes people tap.

Return copy for exactly these platforms: ${destinations.join(', ')}.

Voice & attraction rules:
- ${languageRule}
- Titles must feel curiosity-heavy and suspenseful: a secret, a twist, a forbidden question, or an unfinished revelation.
- Prefer Hinglish patterns like: "Kisi ne nahi bataya…", "Woh raat jab…", "Kyun bhool gaye…?", "Usse pehle kya hua…?", "Woh behen jo…".
- For English packs, use: "Nobody told you…", "The night when…", "Why did … forget…?".
- Avoid flat encyclopedia titles. Avoid spoilers that kill the twist in the first half of the title.
- Description must hook in line 1, build mystery in 2–4 short lines, then CTA: ask viewers to SEND it to one specific devotee who has not heard this katha, plus a low-friction devotional comment (the jaikara), then follow. No guilt or superstition share-bait, no like/subscribe spam.
- Keep cultural names accurate. Do not invent scripture quotes or fake "shlokas".
- Emotional, cinematic, oral-storyteller tone — not academic. Sound like a viral mythology Shorts caption.
- Discovery tags may include English keywords; hashtags mix mythology + emotion + Shorts intent (Roman only for Hinglish packs).

Platform rules:
- YouTube title max ~70 chars (hard max 100). Punchy, searchable, suspenseful. Always end the YouTube title with #Shorts (leave room for it).
- YouTube description: start with #Shorts on its own line, then hook → tease → payoff hint (no full spoiler) → CTA.
- Instagram: caption-first; strong first line; richer hashtags array.
- Facebook: slightly conversational; fewer hashtags; still suspenseful opener.
- coverPrompt: English visual brief — dramatic mythology moment, readable face, NO text/watermark/logo in the image.
- Include fiction disclosure in descriptions when storyKind is ORIGINAL_MYTH_FICTION.
- platforms array must include ${destinations.join(', ')} exactly once each.

thumbnailTextHi / sharedHookHi: ultra-short scroll-stoppers (few words), same language rules as above.
`;

  const user = `
Episode material (use this truth; rewrite for attraction, do not invent new plot):
id: ${episode.id}
kind: ${episode.storyKind}
titleHi: ${episode.titleHi}
titleEn: ${episode.titleEn}
hookHi: ${episode.hookHi}
descriptionHi: ${episode.metadata.descriptionHi}
thumbnailTextHi: ${episode.metadata.thumbnailTextHi}
keywords: ${episode.metadata.keywords.join(', ')}
payoff: ${episode.ending.payoffHi}
tease: ${episode.ending.nextEpisodeTeaseHi}
fictionDisclosureRequired: ${episode.fictionDisclosureRequired}
hero visual (highest importance scene): ${
    [...episode.scenes].sort((a, b) => b.importance - a.importance)[0]?.visualPrompt ||
    episode.scenes[0]?.visualPrompt
  }

Write platform packaging that maximizes curiosity and watch-through for Shorts.
${
  language === 'hi'
    ? 'CRITICAL: Output Hinglish in Roman/English letters only — zero Devanagari characters in title, description, CTA, hooks, tags, or hashtags.'
    : ''
}
`;

  const chat =
    provider === 'groq'
      ? groqStructuredChat
      : provider === 'openai'
        ? openAIStructuredChat
        : openRouterStructuredChat;

  try {
    return PackagingCopySchema.parse(await chat(PackagingCopySchema, system, user));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /timed out|aborted due to timeout|TimeoutError|empty response|hit max_tokens|reasoning/i.test(
        message
      )
    ) {
      console.warn(
        `Packaging LLM failed (${provider}): ${message}\nFalling back to seed pack from episode titles (no AI).`
      );
      return seedPackagingCopy(episode, language);
    }
    throw error;
  }
}

async function renderCover(options: {
  platform: keyof typeof COVER_SPECS;
  coverPrompt: string;
  thumbnailTextHi: string;
  outputBase: string;
  imageProvider: PackagingImageProvider;
}): Promise<string | undefined> {
  if (options.imageProvider === 'none') return undefined;
  const isTech = isTechBrand(currentBrandId());
  const spec = COVER_SPECS[options.platform];
  const coverBrief = isTech
    ? `${options.coverPrompt}. Cover art for ${options.platform}, clean tech editorial diagram, high contrast, no mythology, no heritage frame, leave clear empty upper space for later title overlay`
    : `${options.coverPrompt}. Cover art for ${options.platform}, bold readable mythology scene, leave clear empty upper space for later title overlay`;
  const { prompt } = await enrichVisualPrompt(coverBrief);
  const ext = options.imageProvider === 'gemini' ? 'png' : 'jpg';
  const outputPath = `${options.outputBase}/${spec.file}.${ext}`;
  const style = isTech
    ? {
        frameWeight: 'none' as const,
        camera: 'vertical cover composition, diagram centered, clear top safe area, no logos',
        episode: { brandId: currentBrandId(), storyKind: 'TECH_EDUCATION' as const }
      }
    : {
        frameVariant: 'HERITAGE_CLASSIC' as const,
        frameWeight: 'strong' as const,
        camera: 'vertical cover composition, hero subject centered, clear top safe area'
      };

  if (options.imageProvider === 'gemini') {
    return generateGeminiImage({
      visualPrompt: prompt,
      outputPath,
      aspectRatio: spec.aspectRatio,
      style
    });
  }

  return generatePollinationsImage({
    visualPrompt: prompt,
    outputPath,
    width: spec.width,
    height: spec.height,
    seed: Number(`${Date.now()}`.slice(-6)),
    style
  });
}

export async function packageEpisode(options: {
  episode: Episode;
  copyProvider?: string;
  imageProvider?: PackagingImageProvider;
  skipCovers?: boolean;
  language?: PackagingLanguage;
}): Promise<EpisodePackaging> {
  const copyProvider = options.copyProvider || process.env.STORY_PROVIDER || 'openrouter';
  const language = PackagingLanguageSchema.parse(
    options.language || process.env.PACKAGING_LANGUAGE || process.env.DEFAULT_LANGUAGE || 'hi'
  );
  const imageProvider: PackagingImageProvider = options.skipCovers
    ? 'none'
    : options.imageProvider ||
      (process.env.PACKAGING_IMAGE_PROVIDER as PackagingImageProvider) ||
      (process.env.IMAGE_PROVIDER as PackagingImageProvider) ||
      'pollinations';

  if (imageProvider !== 'none' && imageProvider !== 'gemini' && imageProvider !== 'pollinations') {
    throw new Error('imageProvider must be gemini | pollinations | none');
  }

  const outDir = path.join(packagingRootDir(), options.episode.id);
  await mkdir(outDir, { recursive: true });

  const destinations = activePackagingPlatforms();
  console.log(
    `Packaging copy (${copyProvider}, ${language === 'hi' ? 'Hinglish' : 'English'}, ${destinations.join('+')})…`
  );
  const copy = await generateCopy(options.episode, copyProvider, language);
  // Keep only destinations for this pipeline (LLM may still emit all three).
  copy.platforms = copy.platforms.filter((pack) => destinations.includes(pack.platform));
  if (copy.platforms.length < destinations.length && copyProvider !== 'blank') {
    const seeded = seedPackagingCopy(options.episode, language);
    const have = new Set(copy.platforms.map((pack) => pack.platform));
    for (const pack of seeded.platforms) {
      if (!have.has(pack.platform)) copy.platforms.push(pack);
    }
  }
  // Explicit JSON titles are editorial decisions, not suggestions to the LLM.
  if (copyProvider !== 'blank') {
    const titles = options.episode.publishingTitles?.[language];
    for (const pack of copy.platforms) {
      if (titles?.[pack.platform] || titles?.shared) {
        pack.title = publishingTitle(options.episode, language, pack.platform);
      }
    }
  }

  const byPlatform = Object.fromEntries(copy.platforms.map((p) => [p.platform, p])) as Partial<
    Record<PackagingPlatformId, (typeof copy.platforms)[number]>
  >;

  for (const key of destinations) {
    if (!byPlatform[key]) throw new Error(`Packaging missing platform: ${key}`);
  }

  const packs: EpisodePackaging['platforms'] = {};
  for (const platform of destinations) {
    packs[platform] = {
      ...byPlatform[platform]!,
      coverAspect: COVER_SPECS[platform].aspectRatio
    };
  }

  if (imageProvider !== 'none') {
    console.log(`Cover images (${imageProvider})…`);
    for (const platform of destinations) {
      const pack = packs[platform]!;
      const coverPath = await renderCover({
        platform,
        coverPrompt: pack.coverPrompt,
        thumbnailTextHi: copy.thumbnailTextHi,
        outputBase: outDir,
        imageProvider
      });
      if (coverPath) {
        packs[platform] = { ...pack, coverPath };
        console.log(`  ${platform}: ${coverPath}`);
      }
    }
  }

  const packaging: EpisodePackaging = {
    episodeId: options.episode.id,
    createdAt: new Date().toISOString(),
    language,
    imageProvider,
    sharedHookHi: copy.sharedHookHi,
    thumbnailTextHi: copy.thumbnailTextHi,
    platforms: packs
  };

  const json = `${JSON.stringify(packaging, null, 2)}\n`;
  const jsonPath = packagingPath(options.episode.id);
  await writeFile(jsonPath, json, 'utf8');
  await writeFile(packagingPath(options.episode.id, language), json, 'utf8');

  // Human-readable per-platform text files
  for (const platform of destinations) {
    const pack = packs[platform]!;
    const text = [
      `TITLE: ${pack.title}`,
      '',
      'DESCRIPTION:',
      pack.description,
      '',
      `CTA: ${pack.cta}`,
      '',
      `TAGS: ${pack.tags.join(', ')}`,
      `HASHTAGS: ${pack.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`,
      '',
      `COVER: ${pack.coverPath || '(not generated)'}`,
      `ASPECT: ${pack.coverAspect}`
    ].join('\n');
    await writeFile(path.join(outDir, `${platform}.txt`), `${text}\n`, 'utf8');
    await writeFile(path.join(outDir, `${platform}.${language}.txt`), `${text}\n`, 'utf8');
  }

  console.log(`Saved: ${jsonPath}`);
  return packaging;
}

export async function loadPackaging(
  episodeId: string,
  language?: PackagingLanguage
): Promise<EpisodePackaging | undefined> {
  const candidates = language
    ? [packagingPath(episodeId, language), packagingPath(episodeId)]
    : [packagingPath(episodeId)];
  for (const candidate of candidates) {
    try {
      const raw = await import('node:fs/promises').then((fs) => fs.readFile(candidate, 'utf8'));
      const parsed = JSON.parse(raw) as EpisodePackaging & { language?: PackagingLanguage };
      const normalized = { ...parsed, language: parsed.language || ('hi' as const) };
      if (!language || normalized.language === language) return normalized;
    } catch {
      // Try the backwards-compatible packaging.json fallback.
    }
  }
  return undefined;
}

export async function requirePackaging(episodeId: string): Promise<EpisodePackaging> {
  await access(packagingPath(episodeId));
  const pack = await loadPackaging(episodeId);
  if (!pack) throw new Error(`Missing packaging for ${episodeId}`);
  return pack;
}

export function platformCaption(pack: PlatformPack): { title: string; description: string; tags: string[] } {
  const hashtagLine = pack.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const description = `${pack.description.trim()}\n\n${pack.cta}\n\n${hashtagLine}`;
  return {
    title: pack.title,
    description,
    tags: [...pack.tags]
  };
}
