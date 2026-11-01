#!/usr/bin/env node
/**
 * Scaffold a new pipeline (account/channel): npm run pipeline:new -- --id my-channel --kind story --label "My Channel"
 * Writes config/brands/<id>.json and a universe file; nothing else needs editing in code.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BRAND_IDS, BRAND_KINDS, type BrandConfig, type BrandKind } from '../lib/brands.js';

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

const id = (arg('id') || '').trim().toLowerCase();
const kind = (arg('kind') || 'story') as BrandKind;
const label = arg('label')?.trim() || id;
const language = (arg('language') || (kind === 'tech' ? 'en' : 'hi')) as 'hi' | 'en';

if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) {
  throw new Error('--id is required: lowercase letters, digits and dashes, starting with a letter (e.g. my-channel)');
}
if (!BRAND_KINDS.includes(kind)) throw new Error(`--kind must be one of: ${BRAND_KINDS.join(', ')}`);
if (language !== 'hi' && language !== 'en') throw new Error('--language must be hi or en');
if ((BRAND_IDS as readonly string[]).includes(id)) throw new Error(`Pipeline "${id}" already exists`);

const tech = kind === 'tech';
const config: BrandConfig = {
  id,
  kind,
  label,
  blurb: tech ? 'Short tech education Reels' : 'Cinematic mythology Shorts',
  studioSubtitle: tech ? 'Tech education studio' : 'Production studio',
  episodesDir: `data/episodes-${id}`,
  universeFile: `data/universes/${id}.json`,
  scriptBrief: tech ? 'templates/tech-instagram-script-llm-brief.txt' : 'templates/episode-script-llm-brief.txt',
  visualBrand: tech ? 'TECH_EDITORIAL' : 'EPICASTRA_HERITAGE',
  defaultLanguage: language,
  ...(tech ? { defaultVoiceProfile: 'TECH_ENGLISH_INDIA' } : {}),
  publishProfiles: ['youtube', 'instagram', 'facebook'],
  s3Prefix: `${id}/`,
  ctaDefault: arg('cta') || `Follow ${label} for more.`,
  emptyListCopy: `No episodes yet. Create your first ${tech ? 'Reel' : 'short'}.`,
  newEpisodeLabel: tech ? 'Create a new Reel' : 'Create a new short',
  theme: tech ? 'tech' : 'heritage'
};

const root = process.cwd();
const configPath = path.join(root, 'config', 'brands', `${id}.json`);
const universePath = path.join(root, config.universeFile);
const universeSource = path.join(root, 'data', 'universes', tech ? 'tech-instagram.json' : 'channel.json');

await mkdir(path.dirname(universePath), { recursive: true });
await mkdir(path.join(root, config.episodesDir), { recursive: true });
if (!existsSync(universePath)) await copyFile(universeSource, universePath);
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });

console.log(`Created pipeline "${id}" (${kind})
  ${path.relative(root, configPath)}
  ${config.universeFile}   (edit: positioning + editorial rules for this channel)

Next:
  1. Edit ${path.relative(root, configPath)}: blurb, ctaDefault, publishProfiles, commentDm.
  2. Restart \`npm run ui\` and pick "${label}" in the Desk.
  3. Connect accounts for this pipeline only:
       npm run publish:youtube-auth -- --brand ${id}
       npm run publish:instagram-auth -- --brand ${id}
  See docs/custom-pipelines.md`);
