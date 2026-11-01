import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractFirstJsonObject,
  formatEpisodeJsonText,
  removeTrailingCommas
} from '../ui/src/lib/format-episode-json.js';

const defaultTemplate = {
  id: 'default-hanuman',
  topic: 'Why Hanuman forgot his powers',
  storyKind: 'CANONICAL_MYTHOLOGY',
  spokenHook: 'DEFAULT HOOK SHOULD NOT APPEAR',
  spokenHookDurationSeconds: 6,
  titleHi: 'हनुमान default',
  titleEn: 'Hanuman default',
  scenes: [] as unknown[]
};

describe('formatEpisodeJsonText', () => {
  it('pretty-prints valid JSON', () => {
    const result = formatEpisodeJsonText('{"id":"a","x":1}');
    assert.equal(result.formatted.includes('\n'), true);
    assert.deepEqual(result.value, { id: 'a', x: 1 });
    assert.equal(result.wrappedFromScenes, false);
  });

  it('strips markdown fences and trailing commas', () => {
    const raw = '```json\n{\n  "id": "a",\n  "ok": true,\n}\n```';
    const result = formatEpisodeJsonText(raw);
    assert.deepEqual(result.value, { id: 'a', ok: true });
  });

  it('extracts object from LLM prose', () => {
    const raw = 'Here is the script:\n\n{"id":"ep-1","topic":"x"}\n\nHope this helps!';
    const result = formatEpisodeJsonText(raw);
    assert.deepEqual(result.value, { id: 'ep-1', topic: 'x' });
  });

  it('keeps only the first object when a second block follows', () => {
    const raw = `{
  "id": "first",
  "topic": "one",
  "storyKind": "CANONICAL_MYTHOLOGY",
  "spokenHook": "hook line here",
  "scenes": [{ "id": 1 }]
}
{
  "id": "second"
}
True
notes after`;
    const result = formatEpisodeJsonText(raw, { template: defaultTemplate });
    assert.equal((result.value as { id: string }).id, 'first');
    assert.equal((result.value as { spokenHook: string }).spokenHook, 'hook line here');
    assert.equal(result.wrappedFromScenes, false);
  });

  it('does not replace a full pasted episode with the default template', () => {
    const raw = `{
  "id": "devaki-sons-001",
  "topic": "Devaki six sons",
  "storyKind": "CANONICAL_MYTHOLOGY",
  "spokenHook": "DEVAKI CUSTOM HOOK",
  "titleHi": "देवकी",
  "titleEn": "Devaki",
  "scenes": [
    { "id": 1, "startSecond": 7, "durationSeconds": 5, "narrationHi": "custom", "appearingLords": ["Devaki"] }
  ]
}
some trailing llm note`;
    const result = formatEpisodeJsonText(raw, { template: defaultTemplate });
    const value = result.value as {
      id: string;
      spokenHook: string;
      titleEn: string;
    };
    assert.equal(value.id, 'devaki-sons-001');
    assert.equal(value.spokenHook, 'DEVAKI CUSTOM HOOK');
    assert.equal(value.titleEn, 'Devaki');
    assert.equal(result.wrappedFromScenes, false);
    assert.doesNotMatch(result.formatted, /DEFAULT HOOK SHOULD NOT APPEAR/);
  });

  it('rejects scenes-only paste without template', () => {
    // Blank shell is built without requiring the sample template
    const result = formatEpisodeJsonText(`"scenes": [
  { "id": 1, "startSecond": 6, "durationSeconds": 5, "narrationHi": "x", "appearingLords": ["Devaki"] }
]`);
    assert.equal(result.wrappedFromScenes, true);
    assert.equal((result.value as { featuredLords: Array<{ nameEn: string }> }).featuredLords[0]?.nameEn, 'Devaki');
    assert.doesNotMatch(result.formatted, /Hanuman|हनुमान अपनी शक्ति/i);
  });

  it('wraps scenes-only paste into a blank shell (not Hanuman default)', () => {
    const result = formatEpisodeJsonText(
      `"scenes": [
  {
    "id": 1,
    "startSecond": 7,
    "durationSeconds": 5,
    "narrationHi": "देवकी ने अपने छह बच्चों को जन्म के तुरंत बाद कंस के हाथों खो दिया था।",
    "visualPrompt": "Mother Devaki",
    "appearingLords": ["Devaki"]
  }
]`,
      { template: defaultTemplate }
    );
    const value = result.value as {
      id: string;
      scenes: Array<{ id: number }>;
      featuredLords: Array<{ nameEn: string }>;
      spokenHook: string;
      titleEn: string;
      spokenHookDurationSeconds: number;
      targetDurationSeconds: number;
    };
    assert.equal(result.wrappedFromScenes, true);
    assert.equal(value.scenes.length, 1);
    assert.equal(value.spokenHookDurationSeconds, 7);
    assert.equal(value.targetDurationSeconds, 25);
    assert.equal(value.featuredLords[0]?.nameEn, 'Devaki');
    assert.match(value.id, /^imported-/);
    assert.match(value.titleEn, /Devaki/i);
    assert.doesNotMatch(value.spokenHook, /DEFAULT HOOK SHOULD NOT APPEAR/);
    assert.doesNotMatch(result.formatted, /Why Hanuman Forgot His Powers/);
  });

  it('formats a full episode-like object with scenes array', () => {
    const raw = `{
  "id": "devaki-sons-001",
  "topic": "Devaki sons",
  "storyKind": "CANONICAL_MYTHOLOGY",
  "spokenHook": "hook",
  "scenes": [
    {
      "id": 1,
      "startSecond": 7,
      "durationSeconds": 5,
      "narrationHi": "देवकी ने अपने छह बच्चों को जन्म के तुरंत बाद कंस के हाथों खो दिया था।",
      "appearingLords": ["Devaki"],
    },
  ],
}
extra notes from the model`;
    const result = formatEpisodeJsonText(raw, { template: defaultTemplate });
    const value = result.value as {
      id: string;
      scenes: Array<{ id: number; appearingLords: string[] }>;
    };
    assert.equal(value.id, 'devaki-sons-001');
    assert.equal(value.scenes.length, 1);
    assert.equal(result.wrappedFromScenes, false);
  });

  it('extractFirstJsonObject is brace-balanced inside strings', () => {
    const raw = '{"title":"say } please","n":1} trailing';
    assert.equal(extractFirstJsonObject(raw), '{"title":"say } please","n":1}');
  });

  it('removeTrailingCommas keeps commas inside strings', () => {
    const raw = '{"title":"a, b,",}';
    assert.equal(removeTrailingCommas(raw), '{"title":"a, b,"}');
  });
});
