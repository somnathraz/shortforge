/**
 * Clean & pretty-print episode JSON pasted from LLMs / editors.
 * Handles markdown fences, surrounding prose, trailing commas, and
 * extra text / second objects after the first JSON value.
 *
 * Scenes-only pastes can be wrapped into a template — but a full episode
 * paste must never be replaced by the default template.
 */

export type FormatEpisodeJsonResult = {
  formatted: string;
  value: unknown;
  /** True when scenes were merged into the sample template. */
  wrappedFromScenes?: boolean;
};

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

const CURLY_DOUBLE = /[\u201C\u201D\u201E\u201F\u2033\u2036]/;
const CURLY_SINGLE = /[\u2018\u2019\u201A\u201B\u2032\u2035]/;

/**
 * Normalize curly quotes used as JSON delimiters (LLM paste).
 * Do NOT convert typographic quotes inside string values — that breaks
 * Hindi dialogue like …कहा—“अपने भाई…” into invalid JSON.
 */
export function normalizeQuotes(text: string): string {
  let out = '';
  let inString = false;
  /** true when the opening delimiter was a curly double quote */
  let openedWithCurly = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      // Straight " always closes. Curly closes only if the string opened with curly
      // (so dialogue “…” inside a normal "…" JSON string is preserved).
      if (ch === '"') {
        out += '"';
        inString = false;
        openedWithCurly = false;
        continue;
      }
      if (openedWithCurly && CURLY_DOUBLE.test(ch)) {
        out += '"';
        inString = false;
        openedWithCurly = false;
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === '"') {
      out += '"';
      inString = true;
      openedWithCurly = false;
      continue;
    }
    if (CURLY_DOUBLE.test(ch)) {
      out += '"';
      inString = true;
      openedWithCurly = true;
      continue;
    }
    if (CURLY_SINGLE.test(ch)) {
      out += "'";
      continue;
    }
    out += ch;
  }

  return out;
}

/** Remove ```json ... ``` wrappers (and bare ```). */
function stripMarkdownFences(text: string): string {
  const next = text.trim();
  const fenced = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/m.exec(next);
  if (fenced?.[1]) return fenced[1].trim();
  const embedded = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/m.exec(next);
  if (embedded?.[1]?.trim().startsWith('{')) return embedded[1].trim();
  return next;
}

/**
 * First balanced `{ ... }` from the text (string-aware).
 * Avoids lastIndexOf('}') which wrongly merges two objects / trailing notes.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * First balanced `[ ... ]` from the text (string-aware).
 */
export function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Remove trailing commas before } or ] — common LLM mistake.
 * Skips commas inside strings.
 */
export function removeTrailingCommas(jsonLike: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonLike.length; i += 1) {
    const ch = jsonLike[i]!;
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < jsonLike.length && /[\s\n\r\t]/.test(jsonLike[j]!)) j += 1;
      const next = jsonLike[j];
      if (next === '}' || next === ']') {
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Python-style literals outside strings → JSON. */
export function replacePythonLiterals(jsonLike: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonLike.length; i += 1) {
    const ch = jsonLike[i]!;
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const rest = jsonLike.slice(i);
      if (/^True\b/.test(rest)) {
        out += 'true';
        i += 3;
        continue;
      }
      if (/^False\b/.test(rest)) {
        out += 'false';
        i += 4;
        continue;
      }
      if (/^None\b/.test(rest)) {
        out += 'null';
        i += 3;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function prepareVariants(candidate: string): string[] {
  const base = candidate.trim();
  if (!base) return [];
  const withCommas = removeTrailingCommas(base);
  const withPy = replacePythonLiterals(withCommas);
  return [...new Set([base, withCommas, withPy, replacePythonLiterals(base)])];
}

function asEpisodeObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'Episode script must be a full JSON object { "id": ..., "scenes": [...] }.'
    );
  }
  return value as Record<string, unknown>;
}

function looksLikeScene(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'number' ||
    typeof row.narrationHi === 'string' ||
    typeof row.visualPrompt === 'string'
  );
}

/** Prefer full episode objects over a single scene object accidentally extracted. */
export function episodeLikenessScore(value: Record<string, unknown>): number {
  let score = 0;
  if (typeof value.id === 'string') score += 1;
  if (Array.isArray(value.scenes)) score += 8;
  if (typeof value.spokenHook === 'string') score += 3;
  if (typeof value.storyKind === 'string') score += 3;
  if (typeof value.titleHi === 'string') score += 2;
  if (typeof value.topic === 'string') score += 1;
  if (Array.isArray(value.featuredLords)) score += 3;
  if (value.sourceReview && typeof value.sourceReview === 'object') score += 2;
  if (typeof value.narrationHi === 'string' && typeof value.visualPrompt === 'string' && !value.scenes) {
    score -= 12;
  }
  return score;
}

/** True when paste is clearly NOT a full episode object root. */
export function isScenesOnlyFragment(text: string): boolean {
  const trimmed = text.trim();
  if (/^\s*"?scenes"?\s*:/.test(trimmed)) return true;
  if (/^\s*\[\s*\{/.test(trimmed)) return true;
  // Starts with `{` → treat as full episode attempt, never scenes-wrap first
  if (trimmed.startsWith('{')) return false;
  return false;
}

/**
 * Parse scenes from a scenes-only fragment (`"scenes": [...]` or `[...]`).
 * Does NOT dig scenes out of a full episode object (that caused template overwrite).
 */
export function tryParseScenesOnly(raw: string): unknown[] | null {
  const text = stripMarkdownFences(normalizeQuotes(stripBom(raw))).trim();
  if (!isScenesOnlyFragment(text)) return null;

  const attempts: string[] = [];
  const arr = extractFirstJsonArray(text);
  if (arr) attempts.push(arr);

  for (const attempt of attempts) {
    for (const variant of prepareVariants(attempt)) {
      try {
        const value = JSON.parse(variant) as unknown;
        if (!Array.isArray(value) || value.length === 0) continue;
        if (!value.every(looksLikeScene)) continue;
        return value;
      } catch {
        // try next
      }
    }
  }
  return null;
}

/**
 * Build a blank episode shell from scenes only — never copies the sample Hanuman story.
 */
export function buildEpisodeFromScenesOnly(scenes: unknown[]): Record<string, unknown> {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('scenes array is empty');
  }

  const first = scenes[0] as {
    startSecond?: number;
    narrationHi?: string;
    appearingLords?: unknown;
  };
  const last = scenes[scenes.length - 1] as { narrationHi?: string };

  const hookDur =
    typeof first?.startSecond === 'number' && Number.isFinite(first.startSecond) && first.startSecond > 0
      ? first.startSecond
      : 6;

  let sceneSeconds = 0;
  const lordNames: string[] = [];
  const seenLords = new Set<string>();
  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue;
    const row = scene as {
      durationSeconds?: unknown;
      appearingLords?: unknown;
    };
    const duration = Number(row.durationSeconds);
    if (Number.isFinite(duration)) sceneSeconds += duration;
    if (Array.isArray(row.appearingLords)) {
      for (const name of row.appearingLords) {
        if (typeof name === 'string' && name.trim() && !seenLords.has(name.trim())) {
          seenLords.add(name.trim());
          lordNames.push(name.trim());
        }
      }
    }
  }

  if (!lordNames.length) {
    lordNames.push('Primary Lord');
  }

  const featuredLords = lordNames.slice(0, 6).map((nameEn, index) => ({
    nameEn,
    nameHi: nameEn,
    importance: index === 0 ? 'primary' : 'supporting',
    visualIdentity: `${nameEn} — fill concrete iconography for image generation (face, attributes, clothing, materials)`,
    doNotConfuseWith: `generic lookalike of ${nameEn}`
  }));

  const primary = lordNames[0] || 'the deity';
  const scene1Text = (first?.narrationHi || '').trim();
  // Must differ from scene 1 (spoken-hook editorial gate)
  const spokenHook = `इस कथा में ${primary} की वह बात छिपी है जो ज़्यादातर भक्त नहीं जानते—आगे सुनिए।`;
  const titleSeed = scene1Text.slice(0, 48) || `${primary} — imported script`;
  const stamp = Date.now().toString(36);

  const target = Math.round(hookDur + sceneSeconds);

  return {
    id: `imported-${stamp}`,
    storyKind: 'CANONICAL_MYTHOLOGY',
    topic: titleSeed,
    titleHi: titleSeed,
    titleEn: `Imported: ${primary}`,
    hookHi: spokenHook,
    spokenHook,
    spokenHookDurationSeconds: hookDur,
    hookDelivery: 'curious',
    featuredLords,
    targetDurationSeconds: Math.min(45, Math.max(25, target)),
    audience: 'GENERAL_FAMILY',
    fictionDisclosureRequired: false,
    sourceReview: {
      status: 'NEEDS_REVIEW',
      claimsToVerify: [
        'Verify every factual claim in this imported script against a trusted source before publish.'
      ],
      notes: ['Imported from scenes paste — edit titles, spokenHook, and lord visualIdentity before production.']
    },
    scenes,
    ending: {
      payoffHi: (last?.narrationHi || 'कथा यहीं एक विचार छोड़ती है।').trim(),
      nextEpisodeTeaseHi: 'अगली कथा में और गहरा रहस्य।'
    },
    metadata: {
      descriptionHi: titleSeed,
      keywords: lordNames.slice(0, 4).concat(['पौराणिक कथा', 'EpicAstra']).slice(0, 12),
      thumbnailTextHi: titleSeed.slice(0, 60)
    }
  };
}

/** @deprecated Prefer buildEpisodeFromScenesOnly — ignores template story fields. */
export function mergeScenesIntoTemplate(
  _template: Record<string, unknown>,
  scenes: unknown[]
): Record<string, unknown> {
  return buildEpisodeFromScenesOnly(scenes);
}

export type FormatEpisodeJsonOptions = {
  /** When paste is scenes-only, wrap into this full episode template. */
  template?: Record<string, unknown>;
};

function collectObjectCandidates(unfenced: string): string[] {
  const candidates: string[] = [];

  if (unfenced.trimStart().startsWith('{')) {
    const root = extractFirstJsonObject(unfenced);
    if (root) candidates.push(root);
  }

  const balanced = extractFirstJsonObject(unfenced);
  if (balanced) candidates.push(balanced);

  candidates.push(unfenced.trim());

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    candidates.push(unfenced.slice(start, end + 1));
  }

  const allFences = [...unfenced.matchAll(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/gim)];
  for (const match of allFences) {
    const body = match[1]?.trim();
    if (!body) continue;
    const inner = extractFirstJsonObject(body) || body;
    candidates.push(inner);
  }

  return candidates;
}

function tryParseEpisodeObjects(unfenced: string): {
  parsed: Array<{ value: Record<string, unknown>; score: number }>;
  lastError: unknown;
} {
  const seen = new Set<string>();
  const parsed: Array<{ value: Record<string, unknown>; score: number }> = [];
  let lastError: unknown;

  for (const candidate of collectObjectCandidates(unfenced)) {
    for (const attempt of prepareVariants(candidate)) {
      const key = attempt.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      try {
        const value = asEpisodeObject(JSON.parse(attempt) as unknown);
        parsed.push({ value, score: episodeLikenessScore(value) });
      } catch (error) {
        lastError = error;
      }
    }
  }

  return { parsed, lastError };
}

/**
 * Normalize pasted LLM / file text into pretty-printed JSON.
 * Full episode pastes are kept as-is (cleaned). Scenes-only pastes may wrap into template.
 */
export function formatEpisodeJsonText(
  raw: string,
  options: FormatEpisodeJsonOptions = {}
): FormatEpisodeJsonResult {
  const initial = normalizeQuotes(stripBom(raw)).trim();
  if (!initial) throw new Error('Paste or upload episode JSON first');

  const unfenced = stripMarkdownFences(initial);

  // 1) Scenes-only fragment first — never confuse a scene object with a full episode
  if (isScenesOnlyFragment(unfenced)) {
    const scenes = tryParseScenesOnly(unfenced);
    if (scenes?.length) {
      if (!options.template) {
        // Template optional now — blank shell is built from scenes
      }
      const value = buildEpisodeFromScenesOnly(scenes);
      return {
        value,
        formatted: `${JSON.stringify(value, null, 2)}\n`,
        wrappedFromScenes: true
      };
    }
  }

  // 2) Prefer a real episode object when the paste looks like one
  const { parsed, lastError } = tryParseEpisodeObjects(unfenced);
  if (parsed.length) {
    parsed.sort((a, b) => b.score - a.score);
    const best = parsed[0]!;
    if (best.score >= 0 && (Array.isArray(best.value.scenes) || typeof best.value.spokenHook === 'string' || typeof best.value.storyKind === 'string' || typeof best.value.titleHi === 'string')) {
      return {
        value: best.value,
        formatted: `${JSON.stringify(best.value, null, 2)}\n`,
        wrappedFromScenes: false
      };
    }
    if (best.score >= 0 && !looksLikeScene(best.value)) {
      return {
        value: best.value,
        formatted: `${JSON.stringify(best.value, null, 2)}\n`,
        wrappedFromScenes: false
      };
    }
    // Lone scene object `{ id, narrationHi, ... }`
    if (options.template && looksLikeScene(best.value) && !Array.isArray(best.value.scenes)) {
      const value = buildEpisodeFromScenesOnly([best.value]);
      return {
        value,
        formatted: `${JSON.stringify(value, null, 2)}\n`,
        wrappedFromScenes: true
      };
    }
    if (looksLikeScene(best.value) && !Array.isArray(best.value.scenes)) {
      const value = buildEpisodeFromScenesOnly([best.value]);
      return {
        value,
        formatted: `${JSON.stringify(value, null, 2)}\n`,
        wrappedFromScenes: true
      };
    }
  }

  const detail =
    lastError instanceof SyntaxError
      ? lastError.message.replace(/^JSON\.parse:\s*/i, '')
      : lastError instanceof Error
        ? lastError.message
        : 'unknown parse error';

  const hint = /after JSON|non-whitespace/i.test(detail)
    ? ' Extra text or a second JSON block was found after the first object — click Format JSON to keep only the first complete episode.'
    : ' Click Format JSON to strip fences, trailing commas, and trailing notes.';

  throw new Error(`Invalid JSON — ${detail}.${hint}`);
}
