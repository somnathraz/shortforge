import { z } from 'zod';
import { structuredChatCompletions } from './chatCompletions.js';

export async function groqStructuredChat<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  return structuredChatCompletions(
    {
      name: 'Groq',
      apiKey: process.env.GROQ_API_KEY?.trim() || '',
      apiKeyEnv: 'GROQ_API_KEY',
      baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || '120000')
    },
    schema,
    system,
    user
  );
}
