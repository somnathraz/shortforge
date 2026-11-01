import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { convertToWav } from '../audio/normalize-audio.js';

const DEFAULT_PROMPTS: Record<string, { text: string; durationSeconds: number; loop?: boolean }> = {
  'deep-boom': {
    text: 'Deep cinematic boom hit, trailer braam, short powerful low-frequency impact, no music',
    durationSeconds: 1.2
  },
  impact: {
    text: 'Short heavy cinematic impact hit, punchy thud, clean, no music',
    durationSeconds: 0.6
  },
  whoosh: {
    text: 'Fast air whoosh swoosh transition, short motion sound, no music',
    durationSeconds: 0.5
  },
  riser: {
    text: 'Cinematic tension riser building upward, suspenseful whoosh rise, no music melody',
    durationSeconds: 1.8
  },
  'transition-whoosh': {
    text: 'Soft gentle whoosh for scene transition, airy swipe, no music',
    durationSeconds: 0.45
  },
  'divine-chime': {
    text: 'Soft magical divine chimes, sparkling sacred bells cluster, ethereal, no music',
    durationSeconds: 1.5
  },
  'temple-bell': {
    text: 'Single large temple brass bell ring with long resonant decay, sacred, no music',
    durationSeconds: 2.0
  },
  shankh: {
    text: 'Indian conch shell shankh horn blast, sacred temple call, resonant, no music',
    durationSeconds: 1.8
  },
  'magical-sparkle': {
    text: 'Soft magical sparkle glitter shimmer fairy dust, delicate, no music',
    durationSeconds: 1.0
  },
  thunder: {
    text: 'Distant thunder rumble with crack, stormy, cinematic, no music',
    durationSeconds: 2.2
  },
  rain: {
    text: 'Light steady rain ambience, soft rainfall, no thunder, no music',
    durationSeconds: 3.0,
    loop: true
  },
  wind: {
    text: 'Gentle night wind ambience blowing through trees, soft, no music',
    durationSeconds: 3.0,
    loop: true
  },
  river: {
    text: 'Flowing river stream water ambience, calm river, no music',
    durationSeconds: 3.0,
    loop: true
  },
  fire: {
    text: 'Campfire crackle and torch flames, close-up fire ambience, no music',
    durationSeconds: 2.5,
    loop: true
  },
  'sword-clash': {
    text: 'Two swords clash metallic ring, sharp weapon hit, short, no music',
    durationSeconds: 0.7
  },
  arrow: {
    text: 'Bow arrow release with air whoosh, archery shot, short, no music',
    durationSeconds: 0.55
  },
  'heavy-impact': {
    text: 'Heavy stone door slam or massive impact thud, deep, short, no music',
    durationSeconds: 0.9
  },
  'wing-flap': {
    text: 'Large bird wings flapping, powerful wing beats, no music',
    durationSeconds: 1.0
  }
};

export function promptForSfxEffect(effectId: string): {
  text: string;
  durationSeconds: number;
  loop?: boolean;
} {
  return (
    DEFAULT_PROMPTS[effectId] || {
      text: `Cinematic sound effect: ${effectId.replace(/-/g, ' ')}, short, no music`,
      durationSeconds: 1.2
    }
  );
}

/**
 * Generate one SFX via ElevenLabs Sound Effects API → mp3 bytes.
 * Requires ELEVENLABS_API_KEY with sound_generation permission.
 */
export async function generateElevenLabsSfxBuffer(options: {
  text: string;
  durationSeconds?: number;
  loop?: boolean;
  promptInfluence?: number;
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required for SFX generation');

  const response = await fetch(
    'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(Number(process.env.ELEVENLABS_TIMEOUT_MS || '120000')),
      body: JSON.stringify({
        text: options.text,
        ...(options.durationSeconds !== undefined
          ? { duration_seconds: options.durationSeconds }
          : {}),
        prompt_influence: options.promptInfluence ?? 0.45,
        model_id: 'eleven_text_to_sound_v2',
        ...(options.loop ? { loop: true } : {})
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs SFX ${response.status}: ${err.slice(0, 400)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Generate SFX and write WAV (+ optional raw mp3) under destWavPath. */
export async function generateElevenLabsSfxToFile(options: {
  effectId: string;
  destWavPath: string;
  prompt?: string;
  durationSeconds?: number;
}): Promise<string> {
  const defaults = promptForSfxEffect(options.effectId);
  const text = options.prompt || defaults.text;
  const durationSeconds = options.durationSeconds ?? defaults.durationSeconds;
  const genOpts: { text: string; durationSeconds: number; loop?: boolean } = {
    text,
    durationSeconds
  };
  if (defaults.loop) genOpts.loop = true;
  const buf = await generateElevenLabsSfxBuffer(genOpts);
  await mkdir(path.dirname(options.destWavPath), { recursive: true });
  const mp3Path = options.destWavPath.replace(/\.wav$/i, '.mp3');
  await writeFile(mp3Path, buf);
  await convertToWav(mp3Path, options.destWavPath, { maxSeconds: durationSeconds + 0.5 });
  return options.destWavPath;
}
