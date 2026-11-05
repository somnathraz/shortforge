/**
 * Generic authoring names for episode JSON.
 *
 * The engine stores episodes under its original field names (narrationHi, featuredLords, ...).
 * Authors and LLMs use the generic names below; `applyGenericEpisodeKeys` maps them to the stored
 * names before validation, so old files and new files both import. Stored files are unchanged.
 *
 *   generic key                      stored key
 *   title                            titleHi            (title in the narration language)
 *   titleEnglish                     titleEn
 *   hook                             hookHi             (on-screen hook text)
 *   characters[]                     featuredLords[]
 *   characters[].name                featuredLords[].nameEn
 *   characters[].nameLocal           featuredLords[].nameHi
 *   hookAppearingCharacters          hookAppearingLords
 *   scenes[].narration               scenes[].narrationHi
 *   scenes[].appearingCharacters     scenes[].appearingLords
 *   scenes[].voiceSegments[].text    scenes[].voiceSegments[].textHi
 *   ending.payoff                    ending.payoffHi
 *   ending.nextEpisodeTease          ending.nextEpisodeTeaseHi
 *   ending.onScreenClosingText       ending.onScreenClosingTextHi
 *   metadata.description             metadata.descriptionHi
 *   metadata.thumbnailText           metadata.thumbnailTextHi
 */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Rename `generic` to `stored` when the stored key is absent. Returns a shallow copy. */
function rename(obj: Obj, pairs: ReadonlyArray<readonly [string, string]>): Obj {
  const out: Obj = { ...obj };
  for (const [generic, stored] of pairs) {
    if (generic in out && !(stored in out)) {
      out[stored] = out[generic];
      delete out[generic];
    }
  }
  return out;
}

function mapArray(value: unknown, fn: (item: Obj) => Obj): unknown {
  return Array.isArray(value) ? value.map((item) => (isObj(item) ? fn(item) : item)) : value;
}

/** Generic names -> stored names. Unknown input is returned untouched. */
export function applyGenericEpisodeKeys(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let out = rename(raw, [
    ['title', 'titleHi'],
    ['titleEnglish', 'titleEn'],
    ['hook', 'hookHi'],
    ['characters', 'featuredLords'],
    ['hookAppearingCharacters', 'hookAppearingLords']
  ]);
  out.featuredLords = mapArray(out.featuredLords, (c) =>
    rename(c, [
      ['name', 'nameEn'],
      ['nameLocal', 'nameHi']
    ])
  );
  out.scenes = mapArray(out.scenes, (scene) => {
    const s = rename(scene, [
      ['narration', 'narrationHi'],
      ['appearingCharacters', 'appearingLords']
    ]);
    s.voiceSegments = mapArray(s.voiceSegments, (seg) => rename(seg, [['text', 'textHi']]));
    return s;
  });
  if (isObj(out.spokenHook)) out.spokenHook = rename(out.spokenHook, [['text', 'textHi']]);
  if (isObj(out.ending)) {
    out.ending = rename(out.ending, [
      ['payoff', 'payoffHi'],
      ['nextEpisodeTease', 'nextEpisodeTeaseHi'],
      ['onScreenClosingText', 'onScreenClosingTextHi']
    ]);
  }
  if (isObj(out.metadata)) {
    out.metadata = rename(out.metadata, [
      ['description', 'descriptionHi'],
      ['thumbnailText', 'thumbnailTextHi']
    ]);
  }
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out;
}

/** Stored names -> generic names, for templates shown to authors and LLMs. */
export function toGenericEpisodeKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(toGenericEpisodeKeys) as T;
  if (typeof value === 'string') return toGenericEpisodeText(value) as T;
  if (!isObj(value)) return value;
  const out: Obj = {};
  for (const [key, child] of Object.entries(value)) {
    out[STORED_TO_GENERIC[key] ?? key] = toGenericEpisodeKeys(child);
  }
  return out as T;
}

const STORED_TO_GENERIC: Record<string, string> = {
  titleHi: 'title',
  titleEn: 'titleEnglish',
  hookHi: 'hook',
  featuredLords: 'characters',
  hookAppearingLords: 'hookAppearingCharacters',
  nameEn: 'name',
  nameHi: 'nameLocal',
  narrationHi: 'narration',
  appearingLords: 'appearingCharacters',
  textHi: 'text',
  payoffHi: 'payoff',
  nextEpisodeTeaseHi: 'nextEpisodeTease',
  onScreenClosingTextHi: 'onScreenClosingText',
  descriptionHi: 'description',
  thumbnailTextHi: 'thumbnailText'
};

/** Same renaming inside prose (LLM brief, field guide, notes). Longest names first. */
export function toGenericEpisodeText(text: string): string {
  const keys = Object.keys(STORED_TO_GENERIC).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${keys.join('|')})\\b`, 'g');
  return text.replace(pattern, (match) => STORED_TO_GENERIC[match] ?? match);
}
