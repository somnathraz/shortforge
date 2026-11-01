/** Compact bottom-third captions for 9:16 Shorts (ASS with explicit PlayRes). */

export type CaptionSegment = {
  startSecond: number;
  durationSeconds: number;
  narrationHi: string;
};

function assTime(totalSeconds: number): string {
  const cs = Math.max(0, Math.round(totalSeconds * 100));
  const hours = Math.floor(cs / 360_000);
  const minutes = Math.floor((cs % 360_000) / 6_000);
  const seconds = Math.floor((cs % 6_000) / 100);
  const centis = cs % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** Word-wrap into short lines so captions stay in the lower band. */
export function wrapCaptionLines(text: string, maxChars = 26, maxLines = 2): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);

  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join('\\N'));
  }
  return chunks;
}

/**
 * ASS captions sized for the output frame: small type, bottom-center, side margins.
 * Sidecar SRT can stay full-text; burned overlay uses these short chunks.
 */
export function buildAssCaptions(
  segments: CaptionSegment[],
  width = 1080,
  height = 1920
): string {
  const fontSize = Math.max(28, Math.round(height * 0.022));
  const marginV = Math.max(56, Math.round(height * 0.07));
  const marginLR = Math.max(48, Math.round(width * 0.1));
  const outline = Math.max(1.5, Number((height * 0.0012).toFixed(1)));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},0,2,${marginLR},${marginLR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  for (const segment of segments) {
    const text = segment.narrationHi?.trim();
    if (!text || segment.durationSeconds <= 0.05) continue;
    const chunks = wrapCaptionLines(text);
    if (!chunks.length) continue;
    const slice = segment.durationSeconds / chunks.length;
    chunks.forEach((chunk, index) => {
      const start = segment.startSecond + index * slice;
      const end = index === chunks.length - 1
        ? segment.startSecond + segment.durationSeconds
        : start + slice;
      const safe = chunk.replace(/[{}]/g, '');
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${safe}`);
    });
  }

  return `${header}\n${events.join('\n')}\n`;
}

export function assSubtitlesFilter(assPath: string): string {
  const escaped = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return `ass='${escaped}'`;
}
