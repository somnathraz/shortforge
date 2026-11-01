import { z } from 'zod';

/** Pull one JSON object out of messy model output (fences, prose, think tags). */
export function extractJsonObject(content: string): string {
  const cleaned = content
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

export function parseModelJson<T extends z.ZodTypeAny>(schema: T, content: string): z.infer<T> {
  const jsonText = extractJsonObject(content);
  try {
    return schema.parse(JSON.parse(jsonText));
  } catch (error) {
    const preview = content.replace(/\s+/g, ' ').slice(0, 160);
    if (error instanceof SyntaxError) {
      throw new Error(`${error.message}. Model output preview: ${preview}`);
    }
    throw error;
  }
}
