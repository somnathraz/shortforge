import type { NarrationStyle } from '../schema/narrationStyle.js';
import { resolveNarrationStyle } from '../schema/narrationStyle.js';

/** Provider-ready knobs derived from episode.narrationStyle. */
export type TtsStyleParams = {
  style: NarrationStyle;
  /** Sarvam / numeric pace (0.5–2.0). */
  sarvamPace: number;
  /** Sarvam bulbul:v3 temperature (expressiveness). */
  sarvamTemperature: number;
  /** ElevenLabs voice_settings. */
  elevenLabs: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  /** Edge TTS rate string, e.g. "-15%" or "default". */
  edgeRate: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Map chapter narrationStyle → each TTS engine's supported JSON fields.
 * Sarvam v3: pace + temperature (no emotion enum in REST).
 * ElevenLabs: voice_settings stability / style exaggeration.
 * Edge: rate percentage.
 */
export function mapNarrationStyleToTts(raw?: unknown): TtsStyleParams {
  const style = resolveNarrationStyle(raw);

  let sarvamPace =
    style.pace === 'slow' ? 0.85 : style.pace === 'fast' ? 1.15 : 1.0;
  // Devotional / awe → slightly slower for mythology storytelling
  if (style.emotion === 'devotional' || style.emotion === 'awe' || style.mood === 'divine') {
    sarvamPace = clamp(sarvamPace - 0.05, 0.5, 2);
  }
  if (style.emotion === 'urgent' || style.mood === 'tense') {
    sarvamPace = clamp(sarvamPace + 0.08, 0.5, 2);
  }

  let sarvamTemperature =
    style.intensity === 'low' ? 0.35 : style.intensity === 'high' ? 0.85 : 0.55;
  if (
    style.emotion === 'devotional' ||
    style.emotion === 'sorrowful' ||
    style.emotion === 'awe' ||
    style.mood === 'mysterious' ||
    style.mood === 'tender'
  ) {
    sarvamTemperature = clamp(sarvamTemperature + 0.1, 0.01, 1.2);
  }
  if (style.emotion === 'powerful' || style.mood === 'epic') {
    sarvamTemperature = clamp(sarvamTemperature + 0.05, 0.01, 1.2);
  }

  const stability =
    style.intensity === 'low' ? 0.72 : style.intensity === 'high' ? 0.4 : 0.55;
  const elevenStyle =
    style.intensity === 'low' ? 0.2 : style.intensity === 'high' ? 0.55 : 0.35;
  // Expressive emotions push style exaggeration up a bit
  const styleBoost =
    style.emotion === 'devotional' ||
    style.emotion === 'awe' ||
    style.emotion === 'powerful' ||
    style.mood === 'epic'
      ? 0.08
      : 0;

  const edgeRate =
    style.pace === 'slow' ? '-12%' : style.pace === 'fast' ? '+12%' : 'default';

  return {
    style,
    sarvamPace: Number(sarvamPace.toFixed(3)),
    sarvamTemperature: Number(sarvamTemperature.toFixed(3)),
    elevenLabs: {
      stability: Number(clamp(stability, 0, 1).toFixed(3)),
      similarity_boost: 0.8,
      style: Number(clamp(elevenStyle + styleBoost, 0, 1).toFixed(3)),
      use_speaker_boost: true
    },
    edgeRate
  };
}
