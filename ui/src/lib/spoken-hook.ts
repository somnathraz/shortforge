import type { Episode } from './types';

type SpokenHook = Episode['spokenHook'];

/** Safe string for React text nodes — never return the spokenHook object. */
export function spokenHookDisplayText(value: SpokenHook): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return typeof value.textHi === 'string' ? value.textHi : '';
}

export function hasSpokenHook(value: SpokenHook): boolean {
  return spokenHookDisplayText(value).trim().length > 0;
}
