/** Provider-specific fields live here, never in the episode schema or renderer.
 * Verified against fal's model API pages on 2026-09-25; see docs/video-experiments.md.
 */
export type ModelSpec = {
  endpoint: string;
  durations: readonly number[];
  input: (prompt: string, duration: number) => Record<string, unknown>;
};
export const MODELS = {
  kling: {
    endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    durations: [5, 10],
    input: (prompt, duration) => ({ prompt, duration: String(duration), cfg_scale: 0.5,
      negative_prompt: 'blur, distortions, face morphing, extra limbs, flicker, text, watermark' })
  },
  ltx: {
    endpoint: 'fal-ai/ltx-2.3/image-to-video/fast',
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    input: (prompt, duration) => ({ prompt, duration, resolution: '1080p',
      aspect_ratio: '9:16', fps: 25, generate_audio: false })
  }
} satisfies Record<string, ModelSpec>;
export type ModelName = keyof typeof MODELS;
export function modelNamed(name: string): ModelName {
  if (!Object.hasOwn(MODELS, name)) throw new Error(`Unknown model ${name}; choose ${Object.keys(MODELS).join(' | ')}`);
  return name as ModelName;
}
export function generationDuration(model: ModelName, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Clip duration must be positive');
  const duration = MODELS[model].durations.find(d => d + 1e-8 >= seconds);
  if (!duration) throw new Error(`${model} cannot generate ${seconds}s in one request`);
  return duration;
}
