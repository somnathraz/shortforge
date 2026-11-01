import { z } from 'zod';
import { parseModelJson } from './parseModelJson.js';

type NvidiaResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

function assertChatModel(model: string): void {
  if (/(^|[/-])embed/i.test(model) || /embedding/i.test(model)) {
    throw new Error(
      `NVIDIA_MODEL="${model}" looks like an embedding model, not a chat model. Use a chat model such as nvidia/nemotron-3-super-120b-a12b, or --provider openrouter.`
    );
  }
}

export async function nvidiaStructuredChat<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is required when STORY_PROVIDER=nvidia');
  }

  const baseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
  const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
  assertChatModel(model);
  const timeoutMs = Number(process.env.NVIDIA_TIMEOUT_MS || '120000');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('NVIDIA_TIMEOUT_MS must be a positive number');
  }

  const jsonSchema = z.toJSONSchema(schema);
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `${user}\nReturn only one JSON object matching this schema:\n${JSON.stringify(jsonSchema)}`
    }
  ];
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
        stream: false,
        temperature: attempt === 1 ? 0.2 : 0
      })
    });

    const body = (await response.json()) as NvidiaResponse;
    if (!response.ok) {
      const detail = body.error?.message || response.statusText;
      if (response.status === 410) {
        throw new Error(
          `NVIDIA NIM returned 410 Gone for model "${model}". Hosted inference for this model/account is unavailable. Try a different NVIDIA_MODEL from build.nvidia.com, or use --provider openrouter (free) / --provider groq instead.`
        );
      }
      throw new Error(`NVIDIA NIM returned ${response.status}: ${detail}`);
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('NVIDIA NIM returned an empty response');

    try {
      return parseModelJson(schema, content);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      const reason = error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
        : error instanceof Error ? error.message : String(error);
      messages.push(
        { role: 'assistant', content },
        { role: 'user', content: `Correct the complete JSON. Validation errors: ${reason}` }
      );
    }
  }

  throw lastError;
}
