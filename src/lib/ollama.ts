import './loadEnv.js';
import { z } from 'zod';

const model = process.env.OLLAMA_MODEL || 'qwen3:4b';
const host = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || '180000');

type OllamaResponse = {
  message?: { content?: string };
  error?: string;
};

export async function structuredChat<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(schema);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('OLLAMA_TIMEOUT_MS must be a positive number');
  }

  const messages = [
    { role: 'system', content: `${system}\n/no_think` },
    { role: 'user', content: user }
  ];
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        messages,
        format: jsonSchema,
        stream: false,
        think: false,
        keep_alive: 0,
        options: { temperature: attempt === 1 ? 0.2 : 0, num_predict: 1800 }
      })
    });

    const body = (await response.json()) as OllamaResponse;
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${body.error || response.statusText}`);
    }
    if (!body.message?.content) throw new Error('Ollama returned an empty response');

    try {
      return schema.parse(JSON.parse(body.message.content));
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      const reason = error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
        : error instanceof Error ? error.message : String(error);
      messages.push(
        { role: 'assistant', content: body.message.content },
        {
          role: 'user',
          content: `The draft failed validation: ${reason}. Return a corrected complete JSON object. Recalculate every startSecond and ensure targetDurationSeconds exactly equals the sum of scene durations. /no_think`
        }
      );
    }
  }

  throw lastError;
}
