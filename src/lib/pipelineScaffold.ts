/**
 * Create a pipeline (config/brands/<id>.json + universe + episodes dir).
 * Shared by `npm run pipeline:new`, the Desk onboarding screen and the MCP `create_pipeline` tool.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BRAND_IDS, BRAND_KINDS, reloadBrands, type BrandConfig, type BrandKind } from './brands.js';

export type NewPipelineInput = {
  id: string;
  kind: BrandKind;
  label?: string | undefined;
  language?: 'hi' | 'en' | undefined;
  cta?: string | undefined;
  blurb?: string | undefined;
};

export const PIPELINE_ID_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;

export function buildPipelineConfig(input: NewPipelineInput): BrandConfig {
  const id = input.id.trim().toLowerCase();
  const kind = input.kind;
  const tech = kind === 'tech';
  const label = input.label?.trim() || id;
  const language = input.language ?? (tech ? 'en' : 'hi');
  return {
    id,
    kind,
    label,
    blurb: input.blurb?.trim() || (tech ? 'Short tech education Reels' : 'Narrated cinematic Shorts'),
    studioSubtitle: tech ? 'Tech education studio' : 'Production studio',
    episodesDir: `data/episodes-${id}`,
    universeFile: `data/universes/${id}.json`,
    scriptBrief: tech ? 'templates/tech-instagram-script-llm-brief.txt' : 'templates/episode-script-llm-brief.txt',
    visualBrand: tech ? 'TECH_EDITORIAL' : 'EPICASTRA_HERITAGE',
    defaultLanguage: language,
    ...(tech ? { defaultVoiceProfile: 'TECH_ENGLISH_INDIA' } : {}),
    publishProfiles: ['youtube', 'instagram', 'facebook'],
    s3Prefix: `${id}/`,
    ctaDefault: input.cta?.trim() || `Follow ${label} for more.`,
    emptyListCopy: `No episodes yet. Create your first ${tech ? 'Reel' : 'short'}.`,
    newEpisodeLabel: tech ? 'Create a new Reel' : 'Create a new short',
    theme: tech ? 'tech' : 'heritage'
  };
}

export function validateNewPipeline(input: NewPipelineInput): string | undefined {
  const id = (input.id || '').trim().toLowerCase();
  if (!PIPELINE_ID_PATTERN.test(id)) {
    return 'id must be lowercase letters, digits and dashes, starting with a letter (e.g. my-channel)';
  }
  if (!BRAND_KINDS.includes(input.kind)) return `kind must be one of: ${BRAND_KINDS.join(', ')}`;
  if (input.language && input.language !== 'hi' && input.language !== 'en') return 'language must be hi or en';
  if ((BRAND_IDS as readonly string[]).includes(id)) return `Pipeline "${id}" already exists`;
  return undefined;
}

/** Writes the files, reloads the registry, and returns the created config. Throws on invalid input. */
export async function createPipeline(input: NewPipelineInput, root = process.cwd()): Promise<BrandConfig> {
  const problem = validateNewPipeline(input);
  if (problem) throw new Error(problem);
  const config = buildPipelineConfig(input);
  const configPath = path.join(root, 'config', 'brands', `${config.id}.json`);
  const universePath = path.join(root, config.universeFile);
  const universeSource = path.join(
    root,
    'templates',
    config.kind === 'tech' ? 'universe-tech-starter.json' : 'universe-story-starter.json'
  );
  await mkdir(path.dirname(configPath), { recursive: true });
  await mkdir(path.dirname(universePath), { recursive: true });
  await mkdir(path.join(root, config.episodesDir), { recursive: true });
  if (!existsSync(universePath)) await copyFile(universeSource, universePath);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  reloadBrands();
  return config;
}
