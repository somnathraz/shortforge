import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BgmMood } from '../schema/audioPlan.js';

const MOOD_PROMPTS: Record<BgmMood, string> = {
  divine_mystery:
    'Instrumental only, no vocals. Soft sacred Indian-inspired ambient drone with gentle temple bells and mystical pads. Calm, spiritual, mysterious. Suitable under Hindi mythology narration.',
  dark_mystery:
    'Instrumental only, no vocals. Dark suspenseful ambient underscore, low rumble, tense atmosphere, cinematic mystery. Quiet bed for narration.',
  epic_battle:
    'Instrumental only, no vocals. Epic war drums and heroic cinematic percussion, intense but not overpowering. Shorts-friendly battle underscore.',
  emotional:
    'Instrumental only, no vocals. Soft emotional cinematic pad with gentle strings, tender and heartfelt. Quiet under voiceover.',
  revelation:
    'Instrumental only, no vocals. Majestic reveal underscore, rising hope and awe, cinematic ambient. Instrumental bed for a mythology payoff.'
};

/**
 * ElevenLabs Music — hero Reels only (paid). Saves under assets/audio/bgm/hero/ or episode output.
 * Requires music permission on the API key.
 */
export async function composeElevenLabsMusic(options: {
  prompt: string;
  musicLengthMs: number;
  outputPath: string;
  modelId?: string;
}): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required for hero BGM');

  const modelId = options.modelId || process.env.ELEVENLABS_MUSIC_MODEL || 'music_v1';
  const length = Math.min(600_000, Math.max(3_000, Math.round(options.musicLengthMs)));

  const response = await fetch(
    'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(Number(process.env.ELEVENLABS_MUSIC_TIMEOUT_MS || '300000')),
      body: JSON.stringify({
        prompt: options.prompt,
        music_length_ms: length,
        model_id: modelId
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs Music ${response.status}: ${err.slice(0, 500)}`);
  }

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, Buffer.from(await response.arrayBuffer()));
  await writeFile(
    `${options.outputPath}.meta.json`,
    `${JSON.stringify(
      {
        id: path.basename(options.outputPath, path.extname(options.outputPath)),
        file: options.outputPath,
        category: 'hero',
        source: 'elevenlabs-music',
        sourceUrl: 'https://api.elevenlabs.io/v1/music',
        prompt: options.prompt,
        musicLengthMs: length,
        modelId,
        downloadedAt: new Date().toISOString().slice(0, 10),
        commercialUse: true,
        contentId: false,
        note: 'Hero Reel only — do not use as default library BGM'
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return options.outputPath;
}

export function heroBgmPromptForMood(mood: BgmMood, extra?: string): string {
  const base = MOOD_PROMPTS[mood];
  return extra?.trim() ? `${base} ${extra.trim()}` : base;
}

export function defaultHeroBgmPath(episodeId: string, cwd = process.cwd()): string {
  return path.resolve(cwd, process.env.AUDIO_OUTPUT_DIR || 'output/audio', `${episodeId}-hero-bgm.mp3`);
}
