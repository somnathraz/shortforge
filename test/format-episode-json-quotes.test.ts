import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatEpisodeJsonText,
  normalizeQuotes
} from '../ui/src/lib/format-episode-json.js';

describe('normalizeQuotes / dialogue curly quotes', () => {
  it('keeps dialogue curly quotes inside JSON strings', () => {
    const raw = `{
  "narrationHi": "श्रीराम ने कहा—“अपने भाई का अंतिम संस्कार करो।”",
  "elevenLabsText": "[firmly] “अपने भाई का अंतिम संस्कार करो।”"
}`;
    const normalized = normalizeQuotes(raw);
    assert.match(normalized, /\u201Cअपने भाई/);
    const parsed = JSON.parse(normalized) as { narrationHi: string; elevenLabsText: string };
    assert.match(parsed.narrationHi, /अपने भाई/);
    assert.match(parsed.elevenLabsText, /\[firmly\]/);
  });

  it('still fixes curly JSON delimiters from LLMs', () => {
    const raw = `{ “id”: “demo”, “spokenHook”: “hello” }`;
    const parsed = JSON.parse(normalizeQuotes(raw)) as { id: string; spokenHook: string };
    assert.equal(parsed.id, 'demo');
    assert.equal(parsed.spokenHook, 'hello');
  });

  it('formatEpisodeJsonText accepts Hindi dialogue with curly quotes', () => {
    const withCurly = `{
  "id": "quote-demo",
  "narrationHi": "राम ने कहा—“मृत्यु के साथ ही शत्रुता भी समाप्त हो जाती है।”",
  "elevenLabsText": "[softly] तब राम ने कहा— [firmly] “मृत्यु के साथ ही शत्रुता भी समाप्त हो जाती है।”",
  "soundCue": "On “स्तब्ध” add a soft swell"
}`;
    const result = formatEpisodeJsonText(withCurly);
    assert.match(result.formatted, /मृत्यु के साथ/);
    assert.match(result.formatted, /\[firmly\]/);
    assert.match(result.formatted, /स्तब्ध/);
    // Round-trip: Format must not turn dialogue quotes into broken JSON.
    assert.doesNotThrow(() => JSON.parse(result.formatted));
  });
});
