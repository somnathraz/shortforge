import { z } from 'zod';
import { parseModelJson } from './parseModelJson.js';

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export type ChatCompletionsConfig = {
  name: string;
  apiKey: string;
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
  maxTokens?: number;
  /** Merged into the chat/completions JSON body (e.g. OpenRouter reasoning controls). */
  bodyExtras?: Record<string, unknown>;
};

export async function structuredChatCompletions<T extends z.ZodTypeAny>(
  config: ChatCompletionsConfig,
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  if (!config.apiKey) {
    throw new Error(
      `${config.apiKeyEnv} is missing or empty. Set it in .env (project root) and save the file before running.`
    );
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error(`${config.name} timeout must be a positive number`);
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
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
        ...config.extraHeaders
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: config.maxTokens ?? 4096,
        stream: false,
        temperature: attempt === 1 ? 0.2 : 0,
        ...(config.bodyExtras || {})
      })
    }).catch((error: unknown) => {
      const name = error instanceof Error ? error.name : '';
      const message = error instanceof Error ? error.message : String(error);
      if (name === 'TimeoutError' || /aborted due to timeout|timed? ?out/i.test(message)) {
        throw new Error(
          `${config.name} timed out after ${Math.round(config.timeoutMs / 1000)}s ` +
            `(model ${config.model}). Free/queued models often stall on packaging JSON. ` +
            `Raise ${config.name === 'OpenRouter' ? 'OPENROUTER_TIMEOUT_MS' : 'the provider timeout'}, ` +
            `switch copy provider to groq/openai, or use Custom blank pack.`
        );
      }
      throw error instanceof Error ? error : new Error(message);
    });

    const body = (await response.json()) as ChatResponse & {
      choices?: Array<{
        message?: { content?: string | null; reasoning?: string | null };
        finish_reason?: string;
      }>;
      usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
    };
    if (!response.ok) {
      throw new Error(`${config.name} returned ${response.status}: ${body.error?.message || response.statusText}`);
    }
    let content = body.choices?.[0]?.message?.content?.trim() || '';
    if (!content) {
      const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens;
      const finish = body.choices?.[0]?.finish_reason;
      throw new Error(
        `${config.name} returned an empty response` +
          (reasoningTokens
            ? ` (model spent ~${reasoningTokens} tokens on reasoning` +
              (finish === 'length' ? ', hit max_tokens' : '') +
              ` — raise max_tokens or set OPENROUTER_REASONING_EFFORT=low / switch model)`
            : '')
      );
    }

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
