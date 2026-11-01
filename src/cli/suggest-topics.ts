#!/usr/bin/env node
/**
 * AI topic scout — suggests trendy Shorts topics.
 * Human still picks one, then: npm run story -- "…"
 *
 * Note: scores are AI estimates (season + audience), not live YouTube Analytics.
 */
import '../lib/loadEnv.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STORY_PROVIDERS, type StoryProvider } from '../pipeline/generateEpisode.js';
import { suggestTrendyTopics } from '../pipeline/suggestTopics.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) {
    const parts: string[] = [];
    for (let i = index + 1; i < args.length; i += 1) {
      const token = args[i]!;
      if (token.startsWith('--')) break;
      parts.push(token);
    }
    if (parts.length) return parts.join(' ');
  }
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const provider = (valueFor('--provider') || process.env.STORY_PROVIDER || 'openrouter') as StoryProvider;
  if (!STORY_PROVIDERS.includes(provider)) {
    throw new Error(`--provider must be one of: ${STORY_PROVIDERS.join(', ')}`);
  }
  const count = Number(valueFor('--count') || '8');
  const focus = valueFor('--focus');

  console.log('Scouting Shorts topics (AI estimate — not live YouTube rankings)…');
  const batch = await suggestTrendyTopics({
    provider: provider === 'ollama' || provider === 'nvidia' ? 'openrouter' : provider,
    count,
    ...(focus ? { focus } : {})
  });

  const outDir = path.resolve(process.env.TOPICS_DIR || 'data/topics');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${batch.asOf}-topics.json`);
  await writeFile(outPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');

  console.log(`\nAs of ${batch.asOf}`);
  if (batch.notes) console.log(batch.notes);
  console.log('');
  for (const [index, idea] of batch.ideas.entries()) {
    console.log(
      `${index + 1}. [trend ${idea.trendScore}/10 · visual ${idea.visualPotential}/10 · ${idea.kind} · risk ${idea.sourceRisk}]`
    );
    console.log(`   ${idea.topic}`);
    console.log(`   Hook: ${idea.hookHi}`);
    console.log(`   Why now: ${idea.whyTrendy}`);
    console.log('');
  }

  console.log(`Saved: ${outPath}`);
  console.log('Pick one, then:');
  console.log(`  npm run story -- --provider openrouter --kind canonical "<topic>"`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
