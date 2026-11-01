import type { TechAnimationStep, TechVisual } from '../schema/techVisual.js';

type WordHit = { word: string; at: number };

/**
 * Approximate spoken progress (0–1) per word.
 * Teaching beats are compressed into the earlier part of the line so visuals
 * finish with the key words — not still animating while the voice explains after.
 */
export function wordTimeline(narration: string): WordHit[] {
  const words = narration
    .replace(/[^\w\s.^²×÷-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return [];
  return words.map((word, index) => ({
    word,
    at: 0.04 + (index / Math.max(1, words.length - 1)) * 0.72
  }));
}

function findAt(
  words: WordHit[],
  patterns: RegExp[],
  fallback: number,
  after = -1
): number {
  for (const hit of words) {
    if (hit.at <= after + 1e-9) continue;
    if (patterns.some((re) => re.test(hit.word))) return hit.at;
  }
  return fallback;
}

function spaced(count: number, start = 0.1, end = 0.55): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, i) => start + (i / (count - 1)) * (end - start));
}

function numberPatterns(value: number): RegExp[] {
  const n = String(value);
  const spoken: Record<string, string[]> = {
    '1': ['one', '1'],
    '2': ['two', '2'],
    '4': ['four', '4'],
    '8': ['eight', '8'],
    '10': ['ten', '10'],
    '16': ['sixteen', '16'],
    '30': ['thirty', '30'],
    '32': ['thirty-two', 'thirtytwo', '32'],
    '40': ['forty', '40'],
    '50': ['fifty', '50'],
    '100': ['hundred', '100'],
    '1000': ['thousand', '1000']
  };
  const alts = spoken[n] || [n];
  return alts.map((a) => new RegExp(`^${a.replace('-', '[-]?')}$`, 'i'));
}

/** Find when a number is spoken (handles "thirty-two" as one or two tokens). */
function findNumberAt(
  words: WordHit[],
  value: number,
  fallback: number,
  after = -1
): number {
  const direct = findAt(words, numberPatterns(value), -1, after);
  if (direct >= 0) return direct;
  if (value === 32) {
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i]!.at <= after + 1e-9) continue;
      if (/^thirty$/i.test(words[i]!.word) && /^two$/i.test(words[i + 1]!.word)) {
        return words[i]!.at;
      }
    }
  }
  return fallback;
}

/**
 * Rebuild animationSteps so diagram beats land when the narration mentions them.
 * After the last teaching beat, the frame HOLDS while the voice finishes explaining.
 */
export function syncTechVisualToNarration(visual: TechVisual, narration: string): TechVisual {
  const words = wordTimeline(narration || '');
  const data = visual.visualData || {};
  let steps: TechAnimationStep[] = [];

  switch (visual.visualType) {
    case 'TECH_HOOK': {
      steps = [
        { at: 0.03, action: 'showHook' },
        {
          at: findAt(words, [/^big$/i, /^o$/i, /^n$/i], 0.45),
          action: 'showComplexity',
          value: data.complexity || 'n ↑'
        }
      ];
      break;
    }
    case 'GROWTH_BARS': {
      const sizes = data.inputSizes || [10, 100, 1000];
      steps = [{ at: 0.04, action: 'showBars' }];
      let prev = 0.04;
      const fallbacks = spaced(sizes.length, 0.12, 0.5);
      sizes.forEach((size, index) => {
        const at = findNumberAt(words, size, fallbacks[index]!, prev);
        steps.push({ at, action: 'growthStep', index });
        prev = at;
      });
      steps.push({
        at: Math.min(0.7, Math.max(prev + 0.04, findAt(words, [/grow/i, /bigger/i, /work/i], 0.62))),
        action: 'showComplexity',
        value: data.complexity || 'growth'
      });
      break;
    }
    case 'ARRAY_LOOKUP': {
      const values = data.values || [10, 20, 30, 40, 50];
      const idx = data.targetIndex ?? 2;
      const result = data.result ?? values[idx];
      steps = [{ at: 0.03, action: 'showArray' }];
      // Quick fill early ("Take this array"), then jump when index/result is spoken.
      const fillTimes = spaced(values.length, 0.08, 0.28);
      values.forEach((_, index) => {
        steps.push({ at: fillTimes[index]!, action: 'fillCell', index });
      });
      const pointerAt = findAt(
        words,
        [/index/i, /two/i, /directly/i, /access/i],
        0.4,
        0.28
      );
      const resultAt = findNumberAt(words, typeof result === 'number' ? result : 30, 0.52, pointerAt);
      const bigOAt = findAt(words, [/^o$/i, /one/i, /constant/i], 0.62, resultAt);
      steps.push(
        { at: pointerAt, action: 'showIndexPointer', index: idx },
        { at: Math.min(0.58, pointerAt + 0.06), action: 'highlightCell', index: idx },
        { at: resultAt, action: 'showResult', value: result },
        { at: bigOAt, action: 'showComplexity', value: data.complexity || 'O(1)' }
      );
      break;
    }
    case 'ARRAY_TRAVERSAL': {
      const values = data.values || [2, 4, 6, 8, 10];
      steps = [{ at: 0.03, action: 'showArray' }];
      // Fill when the voice lists the values — NOT stretched across the whole scene.
      let prev = 0.03;
      const fallbacks = spaced(values.length, 0.15, 0.48);
      values.forEach((value, index) => {
        const at = findNumberAt(words, value, fallbacks[index]!, prev);
        steps.push({ at, action: 'traverseTo', index });
        prev = at;
      });
      steps.push({
        at: Math.min(0.7, Math.max(prev + 0.05, findAt(words, [/^o$/i, /^n$/i, /grows/i], 0.6))),
        action: 'showComplexity',
        value: data.complexity || 'O(n)'
      });
      break;
    }
    case 'NESTED_LOOP_GRID': {
      const rows = data.rows || 4;
      steps = [{ at: 0.03, action: 'showGrid' }];
      const times = spaced(rows, 0.12, 0.45);
      for (let row = 0; row < rows; row++) {
        steps.push({ at: times[row]!, action: 'fillRow', row });
      }
      const eqAt = findAt(words, [/times/i, /sixteen/i, /equals/i, /four/i], 0.55);
      steps.push({ at: eqAt, action: 'showEquation' });
      steps.push({
        at: findAt(words, [/^o$/i, /squared/i, /n²/i], Math.min(0.7, eqAt + 0.08)),
        action: 'showComplexity',
        value: data.complexity || 'O(n²)'
      });
      break;
    }
    case 'HALVING': {
      const sequence = data.sequence || [32, 16, 8, 4, 2, 1];
      steps = [];
      let prev = 0;
      const fallbacks = spaced(sequence.length, 0.12, 0.55);
      sequence.forEach((value, index) => {
        const at = findNumberAt(words, value, fallbacks[index]!, prev);
        steps.push({ at, action: 'halveTo', index });
        prev = at;
      });
      steps.push({
        at: findAt(words, [/log/i, /logarithmic/i, /^o$/i], Math.min(0.72, prev + 0.06)),
        action: 'showComplexity',
        value: data.complexity || 'O(log n)'
      });
      break;
    }
    case 'TIME_VS_SPACE': {
      const values = data.values || [2, 4, 6, 8, 10];
      steps = [{ at: 0.04, action: 'showSplit' }];
      const idxs = [0, Math.floor(values.length / 2), values.length - 1];
      const times = spaced(idxs.length, 0.15, 0.45);
      idxs.forEach((index, i) => {
        steps.push({ at: times[i]!, action: 'traverseTo', index });
      });
      steps.push({
        at: findAt(words, [/space/i, /memory/i, /variable/i], 0.58),
        action: 'showComplexity',
        value: 'time ≠ space'
      });
      break;
    }
    case 'COMPLEXITY_LADDER': {
      const ladder = data.ladder || ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'];
      steps = [{ at: 0.04, action: 'showLadder' }];
      const times = spaced(ladder.length, 0.12, 0.55);
      ladder.forEach((_, index) => {
        steps.push({ at: times[index]!, action: 'revealLadderItem', index });
      });
      break;
    }
    default:
      return visual;
  }

  const cleaned = steps
    .map((step) => ({ ...step, at: Math.min(0.85, Math.max(0, Number(step.at.toFixed(3)))) }))
    .sort((a, b) => a.at - b.at || 0)
    .map((step, index, arr) => {
      if (index === 0) return step;
      const prev = arr[index - 1]!.at;
      return step.at <= prev ? { ...step, at: Math.min(0.85, prev + 0.015) } : step;
    });

  return {
    ...visual,
    animationSteps: cleaned
  };
}
