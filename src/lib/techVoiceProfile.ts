/**
 * Locked Tech channel voice profiles.
 * Episode JSON may only reference a profile id — never an arbitrary ElevenLabs voice id.
 */
export const TECH_DEFAULT_VOICE_PROFILE = 'TECH_ENGLISH_INDIA' as const;

export type TechVoiceProfileId = 'TECH_ENGLISH_INDIA' | 'TECH_HINDI';

export type TechVoiceProfile = {
  id: TechVoiceProfileId;
  label: string;
  /** Spoken narration language for LLM + captions */
  narrationLanguage: 'en' | 'hi';
  /** Value stored on reel.voice (profile id, not a Neural/ElevenLabs id) */
  reelVoice: TechVoiceProfileId;
  /** Value stored on reel.lang */
  reelLang: string;
  elevenLabs: {
    voiceId: string;
    modelId: string;
    languageCode: string;
    voiceSettings: {
      stability: number;
      similarity_boost: number;
    };
  };
  /** Edge TTS fallback when ElevenLabs is not used */
  edge: {
    voice: string;
    lang: string;
  };
  /** Cache fingerprint for speech clips */
  speechCacheTag: string;
};

/**
 * Primary DSA / tech series voice: male Indian-accent English (Rahul Bharadwaj).
 * Accent comes from the voice — pass simple English text, not US/UK “native” polish and not Hinglish.
 */
export const TECH_ENGLISH_INDIA: TechVoiceProfile = {
  id: 'TECH_ENGLISH_INDIA',
  label: 'Rahul Bharadwaj — Indian English (channel default)',
  narrationLanguage: 'en',
  reelVoice: 'TECH_ENGLISH_INDIA',
  reelLang: 'en',
  elevenLabs: {
    voiceId: 'u7bRcYbD7visSINTyAT8',
    modelId: 'eleven_v4',
    languageCode: 'en',
    voiceSettings: {
      stability: 0.55,
      similarity_boost: 0.82
    }
  },
  edge: {
    voice: 'en-IN-PrabhatNeural',
    lang: 'en-IN'
  },
  speechCacheTag: 'eleven_v4-rahul-bharadwaj-0.55-0.82'
};

/** Optional Hindi / Hinglish path — not the DSA default. */
export const TECH_HINDI: TechVoiceProfile = {
  id: 'TECH_HINDI',
  label: 'Monika Sogam — Hindi (optional)',
  narrationLanguage: 'hi',
  reelVoice: 'TECH_HINDI',
  reelLang: 'hi',
  elevenLabs: {
    voiceId: '1qEiC6qsybMkmnNdVMbK',
    modelId: 'eleven_v4',
    languageCode: 'hi',
    voiceSettings: {
      stability: 0.58,
      similarity_boost: 0.82
    }
  },
  edge: {
    voice: 'hi-IN-MadhurNeural',
    lang: 'hi-IN'
  },
  speechCacheTag: 'eleven_v4-monika-0.58-0.82'
};

export const TECH_VOICE_PROFILES: Record<TechVoiceProfileId, TechVoiceProfile> = {
  TECH_ENGLISH_INDIA,
  TECH_HINDI
};

export function isTechVoiceProfileId(value: unknown): value is TechVoiceProfileId {
  return value === 'TECH_ENGLISH_INDIA' || value === 'TECH_HINDI';
}

/**
 * Resolve the locked tech voice. Unknown / legacy reel.voice values fall back to
 * TECH_ENGLISH_INDIA so JSON cannot pick an arbitrary ElevenLabs or Edge id.
 */
export function resolveTechVoiceProfile(voiceOrProfile?: string | null): TechVoiceProfile {
  const raw = voiceOrProfile?.trim();
  if (raw && isTechVoiceProfileId(raw)) return TECH_VOICE_PROFILES[raw];
  // Legacy: Hindi samples → optional Hindi profile; everything else → Indian English.
  if (raw && (/^hi[-_]/i.test(raw) || raw.toLowerCase().includes('madhur') || raw === 'hi')) {
    return TECH_HINDI;
  }
  return TECH_ENGLISH_INDIA;
}

/**
 * Curated Indian-English voice ids (seed). Desk also loads the full shared-library
 * set (language=en, accent=indian) so the picker is not limited to this list.
 */
export const TECH_INDIAN_ENGLISH_VOICE_IDS = [
  'u7bRcYbD7visSINTyAT8', // Rahul Bharadwaj — default
  'pzxut4zZz4GImZNlqQ3H', // Raju — Natural Conversationalist (en/indian)
  '3gsg3cxXyFLcGIfNbM6C', // Raju — Authentic and Relatable
  'nwj0s2LU9bDWRKND5yzA', // Bunty — Energetic
  'omLr0bN17lYIC1JWLSYV', // Bunty — Warm and Clear
  'bajNon13EdhNMndG3z05', // Viraj — Energetic and Confident
  '1U02n4nD6AdIZ9CjF053', // Viraj — Smooth and Gentle
  'siw1N9V8LmYeEWKyWBxv', // Ruhaan — Clear Loud Cheerful
  'nZ5WsS2E2UAALki8m2V6', // Ranbir — Intense Cinematic
  'tTZ0TVc9Q1bbWngiduLK' // Rudra — Dark Suspenseful
] as const;

/** ElevenLabs voice id for tech: selected override → env → profile default (Rahul). */
export function techElevenLabsVoiceId(
  profile: TechVoiceProfile = TECH_ENGLISH_INDIA,
  selectedVoiceId?: string | null
): string {
  const selected = selectedVoiceId?.trim();
  if (selected && selected !== process.env.ELEVENLABS_VOICE_ID?.trim()) {
    // Reject accidental mythology default Kanika unless explicitly in Indian-English catalog.
    if (selected === 'mSYK1wXyDo9la60dBOyK') {
      return process.env.TECH_ELEVENLABS_VOICE_ID?.trim() || profile.elevenLabs.voiceId;
    }
    return selected;
  }
  return process.env.TECH_ELEVENLABS_VOICE_ID?.trim() || profile.elevenLabs.voiceId;
}
