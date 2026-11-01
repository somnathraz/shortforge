import { z } from 'zod';

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function outputText(body: OpenAIResponse): string | undefined {
  if (body.output_text) return body.output_text;
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return undefined;
}

export async function openAIStructuredChat<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is required when STORY_PROVIDER=openai');
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || '120000');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('OPENAI_TIMEOUT_MS must be positive');

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: process.env.OPENAI_STORY_MODEL || 'gpt-5.6-sol',
      store: false,
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'low' },
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'mythology_episode',
          strict: true,
          schema: z.toJSONSchema(schema)
        }
      }
    })
  });

  const body = (await response.json()) as OpenAIResponse;
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${body.error?.message || response.statusText}`);
  const content = outputText(body);
  if (!content) throw new Error('OpenAI returned an empty structured response');
  return schema.parse(JSON.parse(content));
}
