/**
 * Scene-template catalog (Node + LLM + browser schema).
 * Runtime Desk also registers ids from data/tech-templates/catalog.json via registerKnownTemplateIds().
 */
export type TechReelTemplateMeta = {
  id: string;
  title: string;
  pack: 'window' | 'scale' | 'sys' | 'mobility' | 'custom';
  /** Short hint for script LLMs */
  llm: string;
  /** Required beat fields (documented for authors) */
  requires: Array<'window' | 'hardware' | 'nodes' | 'none'>;
  status: 'ready' | 'draft';
};

/** Keep in sync with remotion/src/templates/registry.ts and data/tech-templates/catalog.json */
export const TECH_REEL_TEMPLATES: readonly TechReelTemplateMeta[] = [
  { id: 'sys.counter-race', title: 'Rate limiter counter race', pack: 'sys', llm: 'stage: hook, sequential, race, result, gap, atomic, rule. Fifty requests and one shared Redis counter.', requires: ['none'], status: 'ready' },
  {
    id: 'custom.layers',
    title: "Custom animation layers",
    pack: 'custom',
    llm: "Design a one-off animation for this beat with beat.layers: text, box, circle, arrow, code, counter and bar layers with timed keyframes on a 1080x720 canvas (times in seconds from beat start). No code needed.",
    requires: ["none"] as Array<'window' | 'hardware' | 'nodes' | 'none'>,
    status: 'ready' as const
  },
  {
    id: 'mobility.map',
    title: "City map matching (draft)",
    pack: 'mobility',
    llm: "Use for Uber-like nearby search / match / route. Pass map props in beat.templateProps. Scaffold more mobility.* scenes as needed.",
    requires: ["none"] as Array<'window' | 'hardware' | 'nodes' | 'none'>,
    status: 'draft' as const
  },
  {
    id: 'scale.machine',
    title: "Vertical scale machine",
    pack: 'scale',
    llm: "Use for scale-up / single-machine capacity lessons. Requires beat.hardware.",
    requires: ["hardware"] as Array<'window' | 'hardware' | 'nodes' | 'none'>,
    status: 'ready' as const
  },
  {
    id: 'sys.hot-path-counter',
    title: "Hot-path counter: contention to batching",
    pack: 'sys',
    llm: "Click analytics and hot-row contention. templateProps.stage: hook, demo, hotpath, lock, pool, counter, flush, rule, teaser.",
    requires: ["none"] as Array<'window' | 'hardware' | 'nodes' | 'none'>,
    status: 'ready' as const
  },
  {
    id: 'window.array',
    title: "Sliding-window particle array",
    pack: 'window',
    llm: "Use for contiguous subarray / sliding window / two-pointer array lessons. Requires beat.window.",
    requires: ["window"] as Array<'window' | 'hardware' | 'nodes' | 'none'>,
    status: 'ready' as const
  }
] as const;

export const TECH_REEL_TEMPLATE_IDS = TECH_REEL_TEMPLATES.map((t) => t.id);

/** Extra ids registered at runtime (catalog.json / Desk paste) without restarting. */
const runtimeTemplateIds = new Set<string>();

export function registerKnownTemplateIds(ids: Iterable<string>): void {
  for (const id of ids) {
    if (id) runtimeTemplateIds.add(id);
  }
}

export function isKnownTechReelTemplate(id: string): boolean {
  return TECH_REEL_TEMPLATE_IDS.includes(id) || runtimeTemplateIds.has(id);
}

export function formatTechReelTemplateCatalog(): string {
  return TECH_REEL_TEMPLATES.map(
    (t) =>
      '- `' + t.id + '` (' + t.status + ', pack=' + t.pack + '): ' + t.llm + ' Requires: ' + t.requires.join(', ') + '.'
  ).join('\n');
}
