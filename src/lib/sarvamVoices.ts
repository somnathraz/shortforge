import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type SarvamVoiceOption = {
  id: string;
  label: string;
  description?: string;
  source: 'config' | 'env';
};

type VoicesFile = {
  defaultSpeaker?: string;
  voices?: Array<{ id: string; label: string; description?: string }>;
};

function voicesConfigPath(): string {
  return path.resolve(process.cwd(), 'config/sarvam-voices.json');
}

/** Curated Bulbul v3 speakers for EpicAstra Hindi narration. */
export async function listSarvamVoiceOptions(): Promise<{
  defaultVoiceId?: string;
  voices: SarvamVoiceOption[];
}> {
  let file: VoicesFile = {};
  try {
    file = JSON.parse(await readFile(voicesConfigPath(), 'utf8')) as VoicesFile;
  } catch {
    // optional config
  }

  const byId = new Map<string, SarvamVoiceOption>();
  for (const voice of file.voices || []) {
    if (!voice.id?.trim()) continue;
    byId.set(voice.id.trim().toLowerCase(), {
      id: voice.id.trim().toLowerCase(),
      label: voice.label?.trim() || voice.id.trim(),
      ...(voice.description ? { description: voice.description } : {}),
      source: 'config'
    });
  }

  const envSpeaker = process.env.SARVAM_SPEAKER?.trim().toLowerCase();
  if (envSpeaker && !byId.has(envSpeaker)) {
    byId.set(envSpeaker, {
      id: envSpeaker,
      label: envSpeaker,
      description: 'From SARVAM_SPEAKER',
      source: 'env'
    });
  }

  const defaultVoiceId =
    envSpeaker ||
    file.defaultSpeaker?.trim().toLowerCase() ||
    byId.keys().next().value ||
    'shubh';

  if (!byId.size) {
    byId.set('shubh', { id: 'shubh', label: 'Shubh', source: 'config' });
  }

  return {
    defaultVoiceId,
    voices: [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
  };
}
