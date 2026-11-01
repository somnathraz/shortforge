/**
 * Multi-pipeline brand registry + request-scoped active pipeline.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * A pipeline id is the file name of its `config/brands/<id>.json`. Files starting with `_`
 * (e.g. `_template.json`) are ignored. See docs/custom-pipelines.md.
 */
export type BrandId = string;

/**
 * Engine a pipeline runs on:
 *   story — narrated cinematic Shorts (stills/Wan motion, TTS, SFX/BGM) — the EpicAstra engine
 *   tech  — one-concept tech reels rendered with Remotion — the Tech Reels engine
 */
export type BrandKind = 'story' | 'tech';
export const BRAND_KINDS: readonly BrandKind[] = ['story', 'tech'];

/** First-party pipeline ids; also the owners of legacy single-account `.env` credentials. */
export const LEGACY_ENV_BRAND_ID = 'epicastra';

/** Synthetic owner for local Desk (P1) until multi-user sessions land. */
export const LOCAL_OPERATOR_USER_ID = 'local-operator';

export type BrandConfig = {
  id: BrandId;
  /** Engine this pipeline runs on. Defaults to `tech` for `tech-instagram`, else `story`. */
  kind: BrandKind;
  label: string;
  blurb: string;
  studioSubtitle: string;
  episodesDir: string;
  universeFile: string;
  scriptBrief: string;
  visualBrand: string;
  defaultLanguage: 'hi' | 'en';
  /** Tech only: locked TTS profile id (e.g. TECH_ENGLISH_INDIA). */
  defaultVoiceProfile?: string;
  publishProfiles: string[];
  s3Prefix: string;
  ctaDefault: string;
  emptyListCopy: string;
  newEpisodeLabel: string;
  theme: string;
  /** Auto-create / reuse this YouTube playlist title on Tech publish. */
  youtubePlaylistTitle?: string;
  /** Optional fixed playlist id (otherwise created once and stored in vault). */
  youtubePlaylistId?: string;
  /** Auto-DM links to people who comment (Instagram/Facebook private replies). */
  commentDm?: CommentDmConfig;
};

export type CommentDmConfig = {
  enabled: boolean;
  /** Comment must contain one of these (case-insensitive). Empty = every comment. */
  keywords: string[];
  /** Message body; `{name}` is replaced by the commenter's username when known. */
  message: string;
  /** Links appended to the message, one per line. Entries with an empty url are skipped. */
  links: { label: string; url: string }[];
};

const pipelineStore = new AsyncLocalStorage<BrandId>();

const BRAND_ID_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;
const REQUIRED_FIELDS = [
  'label',
  'blurb',
  'studioSubtitle',
  'episodesDir',
  'universeFile',
  'scriptBrief',
  'visualBrand',
  'defaultLanguage',
  'publishProfiles',
  's3Prefix',
  'ctaDefault',
  'emptyListCopy',
  'newEpisodeLabel',
  'theme'
] as const;

function loadBrandFile(id: BrandId): BrandConfig {
  const absolute = path.join(ROOT, 'config', 'brands', `${id}.json`);
  const raw = JSON.parse(readFileSync(absolute, 'utf8')) as Partial<BrandConfig>;
  if (raw.id !== id) throw new Error(`Brand file id mismatch: ${absolute}`);
  const missing = REQUIRED_FIELDS.filter((field) => raw[field] === undefined || raw[field] === '');
  if (missing.length) throw new Error(`${absolute} is missing: ${missing.join(', ')}`);
  const kind = raw.kind ?? (id === 'tech-instagram' ? 'tech' : 'story');
  if (!BRAND_KINDS.includes(kind)) {
    throw new Error(`${absolute}: kind must be one of ${BRAND_KINDS.join(', ')}`);
  }
  return { ...(raw as BrandConfig), kind };
}

function discoverBrands(): Record<BrandId, BrandConfig> {
  const dir = path.join(ROOT, 'config', 'brands');
  const found: Record<BrandId, BrandConfig> = {};
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    const id = file.slice(0, -'.json'.length);
    if (!BRAND_ID_PATTERN.test(id)) {
      throw new Error(`config/brands/${file}: pipeline id must match ${BRAND_ID_PATTERN}`);
    }
    found[id] = loadBrandFile(id);
  }
  if (!Object.keys(found).length) throw new Error('No pipelines found in config/brands/*.json');
  return found;
}

const brands = discoverBrands();

/** Every configured pipeline id, in file-name order. */
export const BRAND_IDS: readonly BrandId[] = Object.keys(brands);

/** Pipeline used when a request names none (DEFAULT_BRAND, else epicastra, else the first one). */
export const DEFAULT_BRAND_ID: BrandId =
  [process.env.DEFAULT_BRAND?.trim().toLowerCase(), LEGACY_ENV_BRAND_ID, BRAND_IDS[0]].find(
    (id): id is string => Boolean(id && id in brands)
  ) as string;

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(brands, value);
}

export function brandKind(id: string | null | undefined): BrandKind | undefined {
  return isBrandId(id) ? brands[id]!.kind : undefined;
}

/** True when the pipeline runs on the tech-reel engine. Unknown/empty ids are not tech. */
export function isTechBrand(id: string | null | undefined): boolean {
  return brandKind(id) === 'tech';
}

export function listBrands(): BrandConfig[] {
  return BRAND_IDS.map((id) => brands[id]!);
}

export function getBrand(id: BrandId): BrandConfig {
  const brand = brands[id];
  if (!brand) throw new Error(`Unknown pipeline "${id}". Configured: ${BRAND_IDS.join(', ')}`);
  return brand;
}

/**
 * Active pipeline for this async request.
 * Desk sets ALS via X-Pipeline; spawned CLI jobs inherit ACTIVE_BRAND in env
 * (see ui-server/jobs.ts) — without that fallback, Tech packaging falls back to EpicAstra.
 */
export function currentBrandId(): BrandId {
  return pipelineStore.getStore() || resolveBrandId(process.env.ACTIVE_BRAND);
}

export function currentBrand(): BrandConfig {
  return getBrand(currentBrandId());
}

export function runWithBrand<T>(brandId: BrandId, fn: () => T): T {
  return pipelineStore.run(brandId, fn);
}

export async function runWithBrandAsync<T>(brandId: BrandId, fn: () => Promise<T>): Promise<T> {
  return pipelineStore.run(brandId, fn);
}

/** Parse X-Pipeline / ?pipeline= — invalid values fall back to the default pipeline. */
export function resolveBrandId(raw: string | null | undefined): BrandId {
  const value = (raw || '').trim().toLowerCase();
  if (isBrandId(value)) return value;
  return DEFAULT_BRAND_ID;
}

export function brandEpisodesDir(brandId: BrandId = currentBrandId()): string {
  // Explicit EPISODES_DIR overrides only the first-party story pipeline; others use their config dir.
  if (brandId === LEGACY_ENV_BRAND_ID && process.env.EPISODES_DIR?.trim()) {
    return path.resolve(ROOT, process.env.EPISODES_DIR.trim());
  }
  return path.resolve(ROOT, getBrand(brandId).episodesDir);
}

export function brandPublicView(brand: BrandConfig = currentBrand()) {
  return {
    id: brand.id,
    kind: brand.kind,
    label: brand.label,
    blurb: brand.blurb,
    studioSubtitle: brand.studioSubtitle,
    defaultLanguage: brand.defaultLanguage,
    publishProfiles: brand.publishProfiles,
    visualBrand: brand.visualBrand,
    emptyListCopy: brand.emptyListCopy,
    newEpisodeLabel: brand.newEpisodeLabel,
    theme: brand.theme
  };
}
