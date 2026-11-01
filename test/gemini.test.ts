import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { geminiStructuredChat } from '../src/lib/gemini.js';

test('Gemini adapter sends structured-output schema and validates the response', async () => {
  const previousKey = process.env.GOOGLE_AI_API_KEY;
  const previousModel = process.env.GOOGLE_TEXT_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GOOGLE_AI_API_KEY = 'test-key';
  process.env.GOOGLE_TEXT_MODEL = 'gemini-test-model';

  let requestUrl = '';
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"answer":"जय हनुमान","score":9}' }] } }]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const schema = z.object({ answer: z.string(), score: z.number().int().min(1).max(10) });
    const result = await geminiStructuredChat(schema, 'System', 'User');
    assert.deepEqual(result, { answer: 'जय हनुमान', score: 9 });
    assert.match(requestUrl, /gemini-test-model:generateContent$/);
    const generationConfig = requestBody?.generationConfig as {
      responseFormat?: { text?: { mimeType?: string; schema?: Record<string, unknown> } };
    };
    assert.equal(generationConfig.responseFormat?.text?.mimeType, 'application/json');
    assert.equal(generationConfig.responseFormat?.text?.schema?.$schema, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
    else process.env.GOOGLE_AI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GOOGLE_TEXT_MODEL;
    else process.env.GOOGLE_TEXT_MODEL = previousModel;
  }
});

test('Gemini adapter fails clearly when no Google key is configured', async () => {
  const previousGoogleKey = process.env.GOOGLE_AI_API_KEY;
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      geminiStructuredChat(z.object({ ok: z.boolean() }), 'System', 'User'),
      /GOOGLE_AI_API_KEY/
    );
  } finally {
    if (previousGoogleKey !== undefined) process.env.GOOGLE_AI_API_KEY = previousGoogleKey;
    if (previousGeminiKey !== undefined) process.env.GEMINI_API_KEY = previousGeminiKey;
  }
});
