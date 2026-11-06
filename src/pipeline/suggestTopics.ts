import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { groqStructuredChat } from '../lib/groq.js';
import { openRouterStructuredChat } from '../lib/openrouter.js';
import { openAIStructuredChat } from '../lib/openai.js';
import { geminiStructuredChat } from '../lib/gemini.js';
import { STORY_PROVIDERS, type StoryProvider } from './generateEpisode.js';
import { currentBrand } from '../lib/brands.js';

export const TopicIdeaSchema = z.object({
  topic: z.string().min(8).max(120),
  kind: z.enum(['CANONICAL_MYTHOLOGY', 'LESSER_KNOWN_MYTHOLOGY', 'ORIGINAL_MYTH_FICTION', 'TECH_EDUCATION']),
  hookHi: z.string().min(8).max(160),
  whyTrendy: z.string().min(8).max(240),
  trendScore: z.number().min(1).max(10),
  visualPotential: z.number().min(1).max(10),
  sourceRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  seriesAngle: z.string().min(3).max(120)
});

export const TopicBatchSchema = z.object({
  asOf: z.string().min(4),
  notes: z.string().min(1),
  ideas: z.array(TopicIdeaSchema).min(5).max(12)
});

export type TopicBatch = z.infer<typeof TopicBatchSchema>;

type ChannelUniverse = {
  channelPositioning?: string;
  initialMix?: {
    canonicalMythologyPercent?: number;
    lesserKnownMythologyPercent?: number;
    originalFictionPercent?: number;
  };
  editorialRules?: string[];
};

async function loadChannel(): Promise<ChannelUniverse> {
  try {
    return JSON.parse(
      await readFile(path.resolve(currentBrand().universeFile), 'utf8')
    ) as ChannelUniverse;
  } catch {
    return {};
  }
}

function monthContext(date = new Date()): string {
  const month = date.toLocaleString('en-IN', { month: 'long' });
  const year = date.getFullYear();
  return `${month} ${year}`;
}

export async function suggestTrendyTopics(options: {
  provider?: StoryProvider;
  count?: number;
  focus?: string;
  profileBrief?: string;
}): Promise<TopicBatch> {
  const provider = options.provider || (process.env.STORY_PROVIDER as StoryProvider) || 'openrouter';
  if (!STORY_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const count = Math.min(12, Math.max(5, options.count ?? 8));
  const channel = await loadChannel();
  const asOf = new Date().toISOString().slice(0, 10);
  const mix = channel.initialMix || {
    canonicalMythologyPercent: 60,
    lesserKnownMythologyPercent: 25,
    originalFictionPercent: 15
  };

  const brand = currentBrand();
  const system = brand.kind === 'tech' ? `
You are the topic scout for ${brand.label}: ${brand.blurb}.
Suggest one-concept tech education Shorts, 30–45 seconds each, based on the user's focus.
Use English topics and English hooks in hookHi. Do not imply live trend research.
Use TECH_EDUCATION as the kind marker.
Avoid invented technical facts and copying published scripts. Return the requested structured JSON.
` : `
You are the topic scout for a Hindi YouTube Shorts channel about Indian mythology.

Channel: ${channel.channelPositioning || 'Cinematic Indian mythology Shorts'}
Mix target: ~${mix.canonicalMythologyPercent}% canonical, ~${mix.lesserKnownMythologyPercent}% lesser-known, ~${mix.originalFictionPercent}% original fiction.

RULES
- Suggest topics that work as ONE 30-45 second Short (one mystery / one moment / one "why").
- Prefer curiosity hooks Indians search or share (festivals, famous characters, surprising "why" questions).
- Do NOT copy other YouTube titles/scripts verbatim.
- Canonical topics must be real traditional subjects (not invented as scripture).
- Fiction topics must be clearly original myth-inspired.
- trendScore is your best estimate of Shorts shareability NOW (not a guarantee).
- sourceRisk HIGH = hard to verify / disputed; prefer LOW/MEDIUM for publish.
- Every idea needs a strong Hindi hook line (hookHi).
- Avoid whole epics; pick one beat.
`;

  const user = `
Today's date context: ${monthContext()} (asOf ${asOf}).
${options.focus ? `Focus / seed: ${options.focus}` : 'Focus: broad Indian mythology audience in India + diaspora.'}

Propose exactly ${count} topic ideas ranked by trendScore (highest first).
Balance the channel mix. Include at least one festival/seasonally timely idea if relevant this month.
Return structured JSON only.
`;

  const chat =
    provider === 'gemini'
      ? geminiStructuredChat
      : provider === 'openrouter'
      ? openRouterStructuredChat
      : provider === 'groq'
        ? groqStructuredChat
        : provider === 'openai'
          ? openAIStructuredChat
          : openRouterStructuredChat;

  if (provider === 'ollama' || provider === 'nvidia') {
    // Prefer cloud structured providers for topic scouting quality.
    console.warn(`Provider ${provider} is weak for topic scouting; using OpenRouter instead.`);
  }

  const batch = TopicBatchSchema.parse(await chat(TopicBatchSchema, system + (options.profileBrief ? '\nCreator profile creative guidelines:\n' + options.profileBrief : ''), user));
  return {
    ...batch,
    asOf,
    ideas: batch.ideas.slice(0, count).sort((a, b) => b.trendScore - a.trendScore)
  };
}
