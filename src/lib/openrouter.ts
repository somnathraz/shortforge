import { z } from 'zod';
import { structuredChatCompletions } from './chatCompletions.js';

function openRouterBodyExtras(): Record<string, unknown> | undefined {
  // Reasoning models (e.g. Nemotron free) can burn the whole max_tokens budget on
  // "thinking" and return empty/truncated packaging JSON. Prefer low effort by default.
  const effort = (process.env.OPENROUTER_REASONING_EFFORT || 'low').trim().toLowerCase();
  if (!effort || effort === 'off' || effort === 'none' || effort === 'false') {
    return { reasoning: { effort: 'low', exclude: true } };
  }
  if (['low', 'medium', 'high', 'minimal'].includes(effort)) {
    return { reasoning: { effort } };
  }
  return undefined;
}

export async function openRouterStructuredChat<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  const extras = openRouterBodyExtras();
  return structuredChatCompletions(
    {
      name: 'OpenRouter',
      apiKey: process.env.OPENROUTER_API_KEY?.trim() || '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
      model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
      // Packaging JSON is large; reasoning models need headroom beyond 4k.
      maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS || '16384'),
      timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS || '120000'),
      extraHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://github.com/mythology-factory',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'mythology-factory'
      },
      ...(extras ? { bodyExtras: extras } : {})
    },
    schema,
    system,
    user
  );
}
