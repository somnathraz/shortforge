/** Shared normalization keeps script validation and provider word alignment in agreement. */
export const phraseTokens = (text: string): string[] => text.toLowerCase().split(/\s+/).map(word => word.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
export function phraseMatches(words: string[], phrase: string): number[] {
  const tokens = phraseTokens(phrase);
  return tokens.length ? words.flatMap((_, i) => tokens.every((token, j) => words[i + j] === token) ? [i] : []) : [];
}
