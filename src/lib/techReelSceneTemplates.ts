/**
 * Scene templates: create Remotion .tsx first, then reference id in reel JSON.
 * Catalog JSON is the runtime source of truth so Desk can register ids without restart.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  TECH_REEL_TEMPLATES,
  registerKnownTemplateIds,
  type TechReelTemplateMeta
} from '../visual/techReelTemplates.js';

const ROOT = process.cwd();
const CATALOG_JSON = path.join(ROOT, 'data/tech-templates/catalog.json');
const CATALOG_MD = path.join(ROOT, 'data/tech-templates/CATALOG.md');
const SCENES_DIR = path.join(ROOT, 'remotion/src/templates/scenes');
const CATALOG_TS = path.join(ROOT, 'src/visual/techReelTemplates.ts');
const REGISTRY_TS = path.join(ROOT, 'remotion/src/templates/registry.ts');

const ID_RE = /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/;
const PACKS = new Set(['window', 'scale', 'sys', 'mobility', 'custom']);

export function assertTemplateId(id: string): string {
  if (!ID_RE.test(id)) throw new Error('Template id must look like pack.name (e.g. mobility.surge)');
  return id;
}

export function packFromId(id: string): TechReelTemplateMeta['pack'] {
  const pack = id.split('.')[0] || 'custom';
  return (PACKS.has(pack) ? pack : 'custom') as TechReelTemplateMeta['pack'];
}

export function componentName(id: string): string {
  return id
    .split(/[.-]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
}

export function formatTsxSource(raw: string): string {
  let source = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const fenced = source.match(/^```(?:tsx?|typescript|jsx?)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced) source = fenced[1]!;
  source = source.replace(/^```(?:tsx?|typescript|jsx?)?\s*\n/i, '').replace(/\n```\s*$/i, '');
  source = source.replace(/\t/g, '  ');
  source = source
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n*$/, '\n');
  return source;
}

function assertSafeSceneSource(id: string, source: string): void {
  if (source.length < 40) throw new Error('Scene TSX is empty');
  if (source.length > 250_000) throw new Error('Scene TSX is too large (max 250KB)');
  if (/\b(child_process|fs\/promises|node:fs|node:child_process|eval\s*\(|new\s+Function\s*\()/i.test(source)) {
    throw new Error('Scene TSX cannot use filesystem, child_process, eval, or Function');
  }
  if (!/export\s+const\s+Scene\b/.test(source)) {
    throw new Error('Scene TSX must include `export const Scene`');
  }
  if (!/export\s+const\s+meta\b/.test(source)) {
    throw new Error('Scene TSX must include `export const meta` with id/title/pack');
  }
  const idMatch = source.match(/\bid\s*:\s*['"`]([^'"`]+)['"`]/);
  if (idMatch && idMatch[1] !== id) {
    throw new Error(`meta.id "${idMatch[1]}" must match template id "${id}"`);
  }
}

function scaffoldSource(id: string): string {
  const name = componentName(id);
  const pack = packFromId(id);
  return formatTsxSource(`import React from 'react';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

/** Scaffolded scene — replace with real animation. */
const ${name}Scene: React.FC<{ context: SceneContext }> = ({ context }) => {
  const props = context.beat.templateProps || {};
  return (
    <svg width={1080} height={720}>
      <rect x={80} y={40} width={920} height={640} rx={18} fill="#10121b" stroke={theme.node} strokeWidth={1.5} />
      <text x={540} y={320} textAnchor="middle" fill={theme.text} fontFamily={theme.sans} fontSize={40} fontWeight={700}>
        ${id}
      </text>
      <text x={540} y={380} textAnchor="middle" fill={theme.muted} fontFamily={theme.mono} fontSize={20}>
        Draft scene · beat {context.beat.id} · props {Object.keys(props).length}
      </text>
    </svg>
  );
};

export const meta = {
  id: '${id}',
  title: '${id}',
  pack: '${pack}',
  llm: 'TODO: describe when the script LLM should pick this template.',
  status: 'draft' as const
};

export const Scene = ${name}Scene;
export default { meta, Scene } satisfies SceneTemplateModule;
`);
}

async function ensureCatalogJson(): Promise<TechReelTemplateMeta[]> {
  try {
    const raw = JSON.parse(await readFile(CATALOG_JSON, 'utf8')) as TechReelTemplateMeta[];
    if (Array.isArray(raw) && raw.length) {
      registerKnownTemplateIds(raw.map((t) => t.id));
      return raw;
    }
  } catch {
    // seed from built-ins
  }
  const seeded = TECH_REEL_TEMPLATES.map((t) => ({ ...t }));
  await mkdir(path.dirname(CATALOG_JSON), { recursive: true });
  await writeFile(CATALOG_JSON, `${JSON.stringify(seeded, null, 2)}\n`);
  registerKnownTemplateIds(seeded.map((t) => t.id));
  return seeded;
}

export async function listRegisteredTemplates(): Promise<TechReelTemplateMeta[]> {
  const list = await ensureCatalogJson();
  await writeCatalogMd(list);
  return list;
}

async function writeCatalogMd(list: TechReelTemplateMeta[]): Promise<void> {
  const body = `# Tech reel scene templates

Create the **TS scene first** (CLI or Tech Studio paste), then reference its id in reel JSON.

\`\`\`sh
npm run tech:template:list
npm run tech:template:scaffold -- --id mobility.surge
\`\`\`

## Registered templates

${list
  .map(
    (t) =>
      `- \`${t.id}\` (${t.status}, pack=${t.pack}): ${t.llm} Requires: ${t.requires.join(', ')}.`
  )
  .join('\n')}

## Shared theme

Fonts/colors live in \`src/visual/techReelTheme.ts\` (imported by every scene via \`remotion/src/templates/theme.ts\`).
`;
  await mkdir(path.dirname(CATALOG_MD), { recursive: true });
  await writeFile(CATALOG_MD, body);
}

function catalogTsSource(list: TechReelTemplateMeta[]): string {
  const entries = list
    .map(
      (t) => `  {
    id: '${t.id}',
    title: ${JSON.stringify(t.title)},
    pack: '${t.pack}',
    llm: ${JSON.stringify(t.llm)},
    requires: ${JSON.stringify(t.requires)} as Array<'window' | 'hardware' | 'nodes' | 'none'>,
    status: '${t.status}' as const
  }`
    )
    .join(',\n');
  return `/**
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
${entries}
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
      '- \`' + t.id + '\` (' + t.status + ', pack=' + t.pack + '): ' + t.llm + ' Requires: ' + t.requires.join(', ') + '.'
  ).join('\\n');
}
`;
}

async function upsertCatalogEntry(entry: TechReelTemplateMeta): Promise<TechReelTemplateMeta[]> {
  const list = await ensureCatalogJson();
  const next = [...list.filter((t) => t.id !== entry.id), entry].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(CATALOG_JSON, `${JSON.stringify(next, null, 2)}\n`);
  await writeCatalogMd(next);
  await writeFile(CATALOG_TS, catalogTsSource(next));
  registerKnownTemplateIds(next.map((t) => t.id));
  return next;
}

async function ensureRegistryImport(id: string): Promise<void> {
  const name = componentName(id);
  const importAlias = name[0]!.toLowerCase() + name.slice(1);
  const stem = id;
  let registry = await readFile(REGISTRY_TS, 'utf8');
  if (registry.includes(`./scenes/${stem}`)) return;

  const importLine = `import * as ${importAlias} from './scenes/${stem}';\n`;
  const lastImport = [...registry.matchAll(/^import \* as \w+ from '\.\/scenes\/[^']+';\n/gm)].pop();
  if (lastImport?.index !== undefined) {
    const at = lastImport.index + lastImport[0].length;
    registry = registry.slice(0, at) + importLine + registry.slice(at);
  } else {
    registry = registry.replace(
      /(import type \{ SceneTemplateModule \} from '\.\/types';\n)/,
      `$1${importLine}`
    );
  }
  registry = registry.replace(
    'export const TEMPLATE_REGISTRY: Record<string, SceneTemplateModule> = {',
    `export const TEMPLATE_REGISTRY: Record<string, SceneTemplateModule> = {\n  [${importAlias}.meta.id]: ${importAlias},`
  );
  await writeFile(REGISTRY_TS, registry);
}

export type PublishSceneResult = {
  id: string;
  relativePath: string;
  formattedSource: string;
  templates: TechReelTemplateMeta[];
  created: boolean;
};

export async function formatSceneTsx(raw: string): Promise<{ source: string }> {
  return { source: formatTsxSource(raw) };
}

export async function scaffoldSceneTemplate(idRaw: string): Promise<PublishSceneResult> {
  const id = assertTemplateId(idRaw);
  const scenePath = path.join(SCENES_DIR, `${id}.tsx`);
  try {
    await access(scenePath);
    throw new Error(`Scene file already exists: remotion/src/templates/scenes/${id}.tsx`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof Error && error.message.includes('already exists')) throw error;
    }
  }
  return publishSceneTemplate({ id, source: scaffoldSource(id), overwrite: false, status: 'draft' });
}

export async function publishSceneTemplate(input: {
  id: string;
  source: string;
  title?: string;
  llm?: string;
  overwrite?: boolean;
  status?: 'ready' | 'draft';
}): Promise<PublishSceneResult> {
  const id = assertTemplateId(input.id);
  const formattedSource = formatTsxSource(input.source);
  assertSafeSceneSource(id, formattedSource);

  const scenePath = path.join(SCENES_DIR, `${id}.tsx`);
  let created = true;
  try {
    await access(scenePath);
    created = false;
    // Desk/Studio Save always updates an existing id. Scaffold still refuses if the file exists.
    // Optional overwrite:false keeps a hard refuse for callers that want create-only.
    if (input.overwrite === false) {
      throw new Error(`Template "${id}" already exists. Pass overwrite:true (or omit) to update the .tsx.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof Error && /already exists|overwrite/i.test(error.message)) throw error;
    }
  }

  await mkdir(SCENES_DIR, { recursive: true });
  await writeFile(scenePath, formattedSource);
  await ensureRegistryImport(id);

  const pack = packFromId(id);
  const requires: TechReelTemplateMeta['requires'] =
    pack === 'window' ? ['window'] : pack === 'scale' ? ['hardware'] : ['none'];
  const templates = await upsertCatalogEntry({
    id,
    title: input.title?.trim() || id,
    pack,
    llm: input.llm?.trim() || `Scene template ${id}. Set beats[].template to "${id}".`,
    requires,
    status: input.status || 'draft'
  });

  return {
    id,
    relativePath: `remotion/src/templates/scenes/${id}.tsx`,
    formattedSource,
    templates,
    created
  };
}

export async function readSceneTemplateSource(idRaw: string): Promise<{ id: string; source: string; relativePath: string }> {
  const id = assertTemplateId(idRaw);
  const relativePath = `remotion/src/templates/scenes/${id}.tsx`;
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  return { id, source, relativePath };
}
