// Private local process boundary for the hosted product. Uses the same engine
// as Desk/CLI; never starts publishing, media generation, or writes episodes.
import '../lib/loadEnv.js';
import { z } from 'zod';
import { listBrands, getBrand, runWithBrandAsync } from '../lib/brands.js';
import { generateEpisode } from '../pipeline/generateEpisode.js';
import { suggestTrendyTopics } from '../pipeline/suggestTopics.js';
import { spokenHookText } from '../schema/voiceCast.js';

const inputSchema = z.object({
  operation: z.enum(['profiles', 'topics', 'script']),
  pipelineId: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/).optional(),
  message: z.string().min(3).max(1200).optional(),
  topic: z.string().min(3).max(180).optional(),
  provider: z.enum(['openrouter', 'openai', 'gemini']).optional(),
  profileBrief: z.string().max(6000).optional()
}).strict();
async function main() {
  let input = '';
  for await (const chunk of process.stdin) { input += String(chunk); if (Buffer.byteLength(input) > 10000) throw new Error(); }
  const request = inputSchema.parse(JSON.parse(input));
  if (request.operation === 'profiles') return { templates: listBrands().map(b => ({ id: b.id, label: b.label, description: b.blurb, kind: b.kind, language: b.defaultLanguage })) };
  if (!request.pipelineId || !request.message || !request.provider) throw new Error();
  const { message, provider } = request;
  const brand = getBrand(request.pipelineId);
  return runWithBrandAsync(brand.id, async () => {
    if (request.operation === 'topics') {
      const batch = await suggestTrendyTopics({ provider, focus: message, count: 5, ...(request.profileBrief ? { profileBrief: request.profileBrief } : {}) });
      return { topics: batch.ideas.slice(0, 4).map((idea, index) => ({ id: 'direction-' + index, title: idea.topic, angle: (idea.seriesAngle + ' — ' + idea.whyTrendy).slice(0,220), duration: '30–45 sec' })) };
    }
    if (!request.topic) throw new Error();
    const episode = await generateEpisode(request.topic, undefined, provider, brand.kind === 'tech' ? 'tech' : 'auto', brand.id, request.profileBrief || '');
    return { episode, script: { title: brand.defaultLanguage === 'hi' ? episode.titleHi : episode.titleEn, hook: spokenHookText(episode.spokenHook), sections: episode.scenes.map(s => ({ label: 'Scene ' + s.id, text: s.narrationHi })), outro: episode.ending.payoffHi } };
  });
}
// Provider libraries may log progress; keep stdout exclusively machine-readable.
console.log = () => {};
console.warn = () => {};
console.error = () => {};
try { const result = await main(); process.stdout.write(JSON.stringify(result)); }
catch { process.stderr.write('FACTORY_ENGINE_FAILED\n'); process.exitCode = 1; }
