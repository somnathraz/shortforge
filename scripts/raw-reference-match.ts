#!/usr/bin/env node
/**
 * One-shot: generate with a concrete prompt only (no EpicAstra / heritage wrapper).
 * Used to find a target look before updating the pipeline.
 */
import '../src/lib/loadEnv.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
if (!apiKey) throw new Error('GOOGLE_AI_API_KEY missing');
const model = process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image';

const prompt = `Ultra-detailed vertical 9:16 cinematic Indian mythology digital painting, matching high-end Instagram myth reels.

Composition (exact beat):
- Upper left: colossal four-armed blue-skinned Lord Vishnu seated on an ornate golden throne among soft golden-white clouds. Yellow pitambara dhoti, deep blue silk shawl with gold embroidery, massive jeweled crown, layered gold necklaces, armlets, bracelets with sharp metallic micro-detail. Four arms: pink lotus, white shankha conch, golden gada mace, and one foot extended forward.
- From Vishnu's right big toe, a brilliant luminous pillar of white-blue sacred water pours downward with glowing foam, fine mist droplets, and translucent turbulence.
- Lower center: Goddess Ganga emerging from churning water, fair skin, long flowing dark hair, white sari with blue-and-gold border, heavy gold crown and jewelry, looking upward with devotion, one arm reaching toward the descending stream.
- Background: floating celestial golden palaces with multi-tier spires and cascading waterfalls on cloud islands; smaller Devas/attendants on a golden balcony holding chauris.
- Foreground water with pink lotus blossoms and soft mist where the stream hits.

Look & quality:
- Glossy modern mythological illustration, extreme jewelry filigree, silk fabric weave, photoreal water physics, warm ethereal god-light from the water stream as key light, rich saturated golds/blues/yellows, deep cinematic depth, razor-sharp faces, no blur.
- Full-bleed scene, NO border frame, NO text, NO logos, NO watermarks, NO UI, NO captions, NO EpicAstra wordmark, NO manuscript frame.

Negative: cartoon, anime, plastic doll skin, flat calendar print, blurry jewelry, extra limbs, western angel wings, modern objects, phone UI, play button.`;

async function main(): Promise<void> {
  const outDir = path.resolve('output/images/epicastra-ganga-avataran-dialogue-v2');
  await mkdir(outDir, { recursive: true });
  const stamp = Date.now();
  const outPng = path.join(outDir, `demo-raw-reference-match-${stamp}.png`);
  const outCanon = path.join(outDir, 'demo-raw-reference-match.png');
  const outPrompt = path.join(outDir, 'demo-raw-reference-match.prompt.txt');

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '9:16' }
      }
    })
  });
  const body = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
  };
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${body.error?.message || response.statusText}`);
  }
  const parts = body.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) throw new Error('No image bytes in response');

  const buf = Buffer.from(imagePart.inlineData.data, 'base64');
  await writeFile(outPng, buf);
  await writeFile(outCanon, buf);
  await writeFile(outPrompt, `${prompt}\n`);
  await writeFile(
    `${outCanon}.source.json`,
    `${JSON.stringify(
      {
        kind: 'raw-reference-match',
        note: 'Bypassed EpicAstra style stack — concrete prompt only',
        provider: 'gemini',
        model,
        generatedAt: new Date().toISOString(),
        promptFile: 'demo-raw-reference-match.prompt.txt',
        versioned: path.basename(outPng)
      },
      null,
      2
    )}\n`
  );

  console.log(`Model: ${model}`);
  console.log(`Wrote: ${outCanon}`);
  console.log(`Prompt: ${outPrompt}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
