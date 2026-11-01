import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type ElevenLabsVoiceOption = {
  id: string;
  label: string;
  description?: string;
  source: 'config' | 'account' | 'env' | 'shared';
  /** Free CDN / signed sample from ElevenLabs — listening costs $0. */
  previewUrl?: string;
  /** Required to add a shared library voice into the account before TTS. */
  publicOwnerId?: string;
  /** Popularity hint from the shared library. */
  clonedByCount?: number;
};

type VoicesFile = {
  defaultVoiceId?: string;
  voices?: Array<{ id: string; label: string; description?: string }>;
};

type ElevenLabsApiVoice = {
  voice_id?: string;
  name?: string;
  description?: string;
  preview_url?: string;
  category?: string;
  labels?: Record<string, string>;
  sharing?: { status?: string; public_owner_id?: string };
};

type SharedVoice = {
  voice_id?: string;
  name?: string;
  description?: string;
  preview_url?: string;
  public_owner_id?: string;
  gender?: string;
  language?: string;
  accent?: string;
  category?: string;
  cloned_by_count?: number;
  free_users_allowed?: boolean;
};

function voicesConfigPath(): string {
  return path.resolve(process.cwd(), 'config/elevenlabs-voices.json');
}

function apiKeyOrThrow(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required');
  return apiKey;
}

function timeoutMs(): number {
  return Number(process.env.ELEVENLABS_TIMEOUT_MS || '120000');
}

/** Split CSV but allow commas inside quotes: `"Hindi, warm":id1,id2` */
function splitCsv(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Parse one env voice entry:
 *   voiceId
 *   Label:voiceId
 *   "Label with: colon":voiceId
 *   Label=voiceId
 */
export function parseEnvVoiceEntry(raw: string): { id: string; label: string } | undefined {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return undefined;

  const eq = trimmed.indexOf('=');
  const colon = trimmed.indexOf(':');
  let label: string | undefined;
  let id: string | undefined;

  if (eq > 0 && (colon < 0 || eq < colon)) {
    label = trimmed.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    id = trimmed.slice(eq + 1).trim();
  } else if (colon > 0) {
    // Prefer last colon so labels may contain ":" (rare); ids never do.
    const last = trimmed.lastIndexOf(':');
    label = trimmed.slice(0, last).trim().replace(/^["']|["']$/g, '');
    id = trimmed.slice(last + 1).trim();
  } else {
    id = trimmed;
  }

  if (!id) return undefined;
  return { id, label: label || id };
}

/** Voices declared in .env (ELEVENLABS_VOICES / _VOICE_IDS / numbered). */
export function parseEnvElevenLabsVoices(
  env: NodeJS.ProcessEnv = process.env
): ElevenLabsVoiceOption[] {
  const byId = new Map<string, ElevenLabsVoiceOption>();

  const upsert = (id: string, label: string, description: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;
    const existing = byId.get(cleanId);
    byId.set(cleanId, {
      id: cleanId,
      label: label.trim() || existing?.label || cleanId,
      description: existing?.description || description,
      source: 'env'
    });
  };

  const voicesRaw = env.ELEVENLABS_VOICES?.trim();
  if (voicesRaw) {
    for (const part of splitCsv(voicesRaw)) {
      const parsed = parseEnvVoiceEntry(part);
      if (parsed) upsert(parsed.id, parsed.label, 'ELEVENLABS_VOICES');
    }
  }

  const idsRaw = env.ELEVENLABS_VOICE_IDS?.trim();
  if (idsRaw) {
    for (const part of splitCsv(idsRaw)) {
      const id = part.trim();
      if (id) upsert(id, id, 'ELEVENLABS_VOICE_IDS');
    }
  }

  // ELEVENLABS_VOICE_1_ID + optional ELEVENLABS_VOICE_1_LABEL (…_2_, …_3_, …)
  for (const key of Object.keys(env)) {
    const match = /^ELEVENLABS_VOICE_(\d+)_ID$/i.exec(key);
    if (!match) continue;
    const n = match[1]!;
    const id = env[key]?.trim();
    if (!id) continue;
    const label =
      env[`ELEVENLABS_VOICE_${n}_LABEL`]?.trim() ||
      env[`ELEVENLABS_VOICE_${n}_NAME`]?.trim() ||
      `Voice ${n}`;
    upsert(id, label, `ELEVENLABS_VOICE_${n}_ID`);
  }

  const single = env.ELEVENLABS_VOICE_ID?.trim();
  if (single) {
    upsert(single, byId.get(single)?.label || 'Default (.env)', 'ELEVENLABS_VOICE_ID');
  }

  return [...byId.values()];
}

export async function loadConfiguredElevenLabsVoices(): Promise<{
  defaultVoiceId: string | undefined;
  voices: ElevenLabsVoiceOption[];
}> {
  const envDefault = process.env.ELEVENLABS_VOICE_ID?.trim();
  let file: VoicesFile = {};
  try {
    file = JSON.parse(await readFile(voicesConfigPath(), 'utf8')) as VoicesFile;
  } catch {
    file = {};
  }

  const byId = new Map<string, ElevenLabsVoiceOption>();
  for (const voice of file.voices || []) {
    if (!voice.id?.trim()) continue;
    byId.set(voice.id.trim(), {
      id: voice.id.trim(),
      label: voice.label?.trim() || voice.id.trim(),
      ...(voice.description ? { description: voice.description } : {}),
      source: 'config'
    });
  }

  for (const voice of parseEnvElevenLabsVoices()) {
    const prev = byId.get(voice.id);
    // Env wins for label when set explicitly (not just the bare id).
    byId.set(voice.id, {
      ...voice,
      label:
        voice.label && voice.label !== voice.id
          ? voice.label
          : prev?.label || voice.label,
      description: prev?.description || voice.description
    });
  }

  const defaultVoiceId =
    file.defaultVoiceId?.trim() || envDefault || [...byId.keys()][0];
  return { defaultVoiceId, voices: [...byId.values()] };
}

function describeLabels(labels?: Record<string, string>, description?: string): string | undefined {
  const parts = [labels?.language, labels?.accent, labels?.gender, labels?.use_case]
    .filter(Boolean)
    .map(String);
  if (description?.trim()) parts.push(description.trim().slice(0, 120));
  return parts.length ? parts.join(' · ') : undefined;
}

export async function fetchAccountElevenLabsVoices(): Promise<ElevenLabsVoiceOption[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return [];

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs())
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs voices ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = (await response.json()) as { voices?: ElevenLabsApiVoice[] };

  return (body.voices || [])
    .filter((voice) => Boolean(voice.voice_id))
    .map((voice) => {
      const option: ElevenLabsVoiceOption = {
        id: voice.voice_id!,
        label: voice.name?.trim() || voice.voice_id!,
        source: 'account'
      };
      const description = describeLabels(voice.labels, voice.description);
      if (description) option.description = description;
      if (voice.preview_url) option.previewUrl = voice.preview_url;
      const owner = voice.sharing?.public_owner_id?.trim();
      if (owner) option.publicOwnerId = owner;
      return option;
    });
}

/**
 * Indian-accent English voices (lang=en, accent=indian) from the shared library.
 * Use for Tech Reels — not Hindi mythology narrators.
 */
export async function fetchSharedIndianEnglishVoices(limit = 40): Promise<ElevenLabsVoiceOption[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    language: 'en',
    accent: 'indian',
    page_size: String(Math.min(50, Math.max(limit, 20))),
    sort: 'cloned_by_count'
  });

  const response = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs())
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs shared Indian-English voices ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = (await response.json()) as { voices?: SharedVoice[] };
  const ranked = [...(body.voices || [])]
    .filter((voice) => Boolean(voice.voice_id) && (voice.language || '').toLowerCase() === 'en')
    .filter((voice) => /indian/i.test(voice.accent || ''))
    .sort((a, b) => (b.cloned_by_count || 0) - (a.cloned_by_count || 0));

  return ranked.slice(0, limit).map((voice) => {
    const clones = voice.cloned_by_count || 0;
    const popularity =
      clones >= 1_000_000
        ? `${(clones / 1_000_000).toFixed(1)}M uses`
        : clones >= 1000
          ? `${Math.round(clones / 1000)}k uses`
          : clones > 0
            ? `${clones} uses`
            : undefined;
    const bits = [
      'Indian English',
      voice.gender,
      popularity,
      voice.description?.trim().slice(0, 100)
    ].filter(Boolean);
    const option: ElevenLabsVoiceOption = {
      id: voice.voice_id!,
      label: voice.name?.trim() || voice.voice_id!,
      description: bits.join(' · '),
      source: 'shared'
    };
    if (voice.preview_url) option.previewUrl = voice.preview_url;
    if (voice.public_owner_id) option.publicOwnerId = voice.public_owner_id;
    if (clones > 0) option.clonedByCount = clones;
    return option;
  });
}

/**
 * Famous / popular Hindi male narration voices from the ElevenLabs shared library.
 * Preview samples are free CDN audio (no TTS character cost).
 */
export async function fetchSharedHindiMaleNarrators(limit = 16): Promise<ElevenLabsVoiceOption[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    language: 'hi',
    gender: 'male',
    page_size: String(Math.min(50, Math.max(limit, 12))),
    sort: 'cloned_by_count'
  });
  // Prefer narrative / storytelling; still keep high-clone fame if tagged differently.
  params.set('use_cases', 'narrative_story');

  const response = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs())
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs shared voices ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = (await response.json()) as { voices?: SharedVoice[] };
  const ranked = [...(body.voices || [])]
    .filter((voice) => Boolean(voice.voice_id) && (voice.language || '').toLowerCase() === 'hi')
    .filter((voice) => (voice.gender || '').toLowerCase() === 'male')
    .sort((a, b) => (b.cloned_by_count || 0) - (a.cloned_by_count || 0));

  return ranked.slice(0, limit).map((voice) => {
    const clones = voice.cloned_by_count || 0;
    const popularity =
      clones >= 1_000_000
        ? `${(clones / 1_000_000).toFixed(1)}M uses`
        : clones >= 1000
          ? `${Math.round(clones / 1000)}k uses`
          : clones > 0
            ? `${clones} uses`
            : undefined;
    const bits = [
      'Hindi male narrator',
      voice.accent && voice.accent !== 'standard' ? voice.accent : undefined,
      popularity,
      voice.description?.trim().slice(0, 100)
    ].filter(Boolean);
    const option: ElevenLabsVoiceOption = {
      id: voice.voice_id!,
      label: voice.name?.trim() || voice.voice_id!,
      description: bits.join(' · '),
      source: 'shared'
    };
    if (voice.preview_url) option.previewUrl = voice.preview_url;
    if (voice.public_owner_id) option.publicOwnerId = voice.public_owner_id;
    if (clones > 0) option.clonedByCount = clones;
    return option;
  });
}

function mergeVoice(
  prev: ElevenLabsVoiceOption | undefined,
  next: ElevenLabsVoiceOption
): ElevenLabsVoiceOption {
  if (!prev) return next;
  const preferNextLabel =
    next.source === 'env' ||
    next.source === 'config' ||
    (next.label && next.label !== next.id && (!prev.label || prev.label === prev.id));
  return {
    ...prev,
    ...next,
    label: preferNextLabel ? next.label : prev.label || next.label,
    description: prev.description || next.description,
    previewUrl: next.previewUrl || prev.previewUrl,
    publicOwnerId: next.publicOwnerId || prev.publicOwnerId,
    clonedByCount: next.clonedByCount ?? prev.clonedByCount,
    // Keep the "richest" provenance for UI badges: config/env > shared > account
    source:
      prev.source === 'env' || prev.source === 'config'
        ? prev.source
        : next.source === 'shared'
          ? 'shared'
          : prev.source
  };
}

export async function listElevenLabsVoiceOptions(
  includeAccount = true,
  options?: { forBrand?: 'tech' | 'mythology' | 'all' }
): Promise<{
  defaultVoiceId: string | undefined;
  voices: ElevenLabsVoiceOption[];
  accountError?: string;
}> {
  const forBrand = options?.forBrand || 'all';
  const configured = await loadConfiguredElevenLabsVoices();
  const byId = new Map<string, ElevenLabsVoiceOption>();

  // Tech picker: Indian-English shared library + tech config entries (skip Hindi mythology defaults).
  if (forBrand === 'tech') {
    for (const voice of configured.voices) {
      if (/tech ·|indian english|rahul/i.test(`${voice.label} ${voice.description || ''}`)) {
        byId.set(voice.id, voice);
      }
    }
  } else {
    for (const voice of configured.voices) byId.set(voice.id, voice);
  }

  let accountError: string | undefined;
  if (includeAccount) {
    try {
      for (const voice of await fetchAccountElevenLabsVoices()) {
        if (forBrand === 'tech') {
          const blob = `${voice.label} ${voice.description || ''}`.toLowerCase();
          if (!/indian|india|hindi|en-in|tech/.test(blob)) continue;
        }
        byId.set(voice.id, mergeVoice(byId.get(voice.id), voice));
      }
    } catch (error) {
      accountError = error instanceof Error ? error.message : String(error);
    }

    if (forBrand === 'tech' || forBrand === 'all') {
      try {
        for (const voice of await fetchSharedIndianEnglishVoices(40)) {
          byId.set(voice.id, mergeVoice(byId.get(voice.id), voice));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        accountError = accountError ? `${accountError}; ${msg}` : msg;
      }
    }

    if (forBrand === 'mythology' || forBrand === 'all') {
      try {
        for (const voice of await fetchSharedHindiMaleNarrators()) {
          byId.set(voice.id, mergeVoice(byId.get(voice.id), voice));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        accountError = accountError ? `${accountError}; ${msg}` : msg;
      }
    }
  }

  const { TECH_ENGLISH_INDIA } = await import('./techVoiceProfile.js');
  const defaultId =
    forBrand === 'tech' ? TECH_ENGLISH_INDIA.elevenLabs.voiceId : configured.defaultVoiceId;
  return {
    defaultVoiceId: defaultId,
    voices: [...byId.values()].sort((a, b) => {
      // Keep the configured default at the top of the TTS voice picker.
      if (defaultId) {
        if (a.id === defaultId) return -1;
        if (b.id === defaultId) return 1;
      }
      const rank = (s: ElevenLabsVoiceOption['source']) =>
        s === 'env' ? 0 : s === 'config' ? 1 : s === 'shared' ? 2 : 3;
      const ra = rank(a.source);
      const rb = rank(b.source);
      if (ra !== rb) return ra - rb;
      if (a.source === 'shared' && b.source === 'shared') {
        return (b.clonedByCount || 0) - (a.clonedByCount || 0);
      }
      return a.label.localeCompare(b.label);
    }),
    ...(accountError ? { accountError } : {})
  };
}

/**
 * Look up a single shared-library voice (any language) by voice id.
 * Used when adding a picked voice that is outside the Hindi-male curated list.
 */
export async function lookupSharedVoiceById(
  voiceId: string
): Promise<{ id: string; label: string; publicOwnerId?: string } | undefined> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey || !voiceId.trim()) return undefined;

  const params = new URLSearchParams({
    search: voiceId.trim(),
    page_size: '10'
  });
  const response = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs())
  });
  if (!response.ok) return undefined;

  const body = (await response.json()) as { voices?: SharedVoice[] };
  const hit = (body.voices || []).find((voice) => voice.voice_id === voiceId.trim());
  if (!hit?.voice_id) return undefined;
  return {
    id: hit.voice_id,
    label: hit.name?.trim() || hit.voice_id,
    ...(hit.public_owner_id ? { publicOwnerId: hit.public_owner_id } : {})
  };
}

/**
 * Shared library voices must be added to the account once before TTS.
 * No-op when already present. Preview listening does not require this.
 */
export async function ensureElevenLabsVoiceInLibrary(options: {
  voiceId: string;
  publicOwnerId?: string;
  newName?: string;
}): Promise<void> {
  const voiceId = options.voiceId.trim();
  if (!voiceId) throw new Error('voiceId is required');

  const apiKey = apiKeyOrThrow();
  const account = await fetchAccountElevenLabsVoices();
  if (account.some((voice) => voice.id === voiceId)) return;

  let publicOwnerId = options.publicOwnerId?.trim();
  let newName = options.newName?.trim();

  if (!publicOwnerId || !newName) {
    const listed = await listElevenLabsVoiceOptions(true);
    const hit = listed.voices.find((voice) => voice.id === voiceId);
    publicOwnerId = publicOwnerId || hit?.publicOwnerId;
    newName = newName || hit?.label;
  }

  // Voice may be outside the Hindi-male curated page — look it up by id in shared library.
  if (!publicOwnerId) {
    const lookedUp = await lookupSharedVoiceById(voiceId);
    if (lookedUp) {
      publicOwnerId = lookedUp.publicOwnerId;
      newName = newName || lookedUp.label;
    }
  }

  if (!publicOwnerId) {
    // Premade / already-owned ids can synthesize without add.
    return;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs()),
      body: JSON.stringify({
        new_name: (newName || `Shared voice ${voiceId.slice(0, 8)}`).slice(0, 100)
      })
    }
  );
  if (!response.ok) {
    const text = await response.text();
    // Already added races are fine.
    if ((response.status === 400 || response.status === 422) && /already|exist/i.test(text)) {
      return;
    }
    // Restricted API keys often lack voices_write — TTS may still work with the public voice id.
    if (
      response.status === 401 ||
      response.status === 403 ||
      /missing_permissions|voices_write|unauthorized/i.test(text)
    ) {
      console.warn(
        `ElevenLabs could not add shared voice to library (${response.status}); trying TTS with voice id directly.`
      );
      return;
    }
    throw new Error(`ElevenLabs add voice ${response.status}: ${text.slice(0, 300)}`);
  }
}

/** Resolve free preview audio URL for a voice id (from account or shared library). */
export async function resolveElevenLabsVoicePreviewUrl(
  voiceId: string
): Promise<string | undefined> {
  const id = voiceId.trim();
  if (!id) return undefined;
  const listed = await listElevenLabsVoiceOptions(true);
  const hit = listed.voices.find((voice) => voice.id === id);
  return hit?.previewUrl;
}
