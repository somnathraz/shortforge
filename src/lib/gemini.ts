import { z } from 'zod';

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function jsonSchemaForGemini(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  // `$schema` describes the meta-schema and is not part of Gemini's accepted
  // response schema subset.
  const { $schema: _metaSchema, ...supportedSchema } = jsonSchema;
  return supportedSchema;
}

function responseText(body: GeminiResponse): string | undefined {
  const parts = body.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || '').join('').trim();
  return text || undefined;
}

/** Google Gemini structured-output adapter used by every factory LLM surface. */
export async function geminiStructuredChat<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string
): Promise<z.infer<T>> {
  const apiKey = (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY)?.trim();
  if (!apiKey) {
    throw new Error(
      'GOOGLE_AI_API_KEY (or GEMINI_API_KEY) is required when the LLM provider is gemini'
    );
  }

  const model = (process.env.GOOGLE_TEXT_MODEL || 'gemini-3.8-flash').trim();
  const timeoutMs = Number(process.env.GOOGLE_TEXT_TIMEOUT_MS || '120000');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('GOOGLE_TEXT_TIMEOUT_MS must be positive');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          responseFormat: {
            text: {
              mimeType: 'application/json',
              schema: jsonSchemaForGemini(schema)
            }
          }
        }
      })
    }
  );

  const body = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(
      `Gemini returned ${response.status}: ${body.error?.message || response.statusText}`
    );
  }

  const content = responseText(body);
  if (!content) {
    const reason =
      body.promptFeedback?.blockReason || body.candidates?.[0]?.finishReason || 'empty response';
    throw new Error(`Gemini returned no structured output (${reason})`);
  }

  try {
    return schema.parse(JSON.parse(content) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Gemini returned invalid JSON: ${error.message}`);
    }
    throw error;
  }
}
