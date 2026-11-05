#!/usr/bin/env node
/**
 * Scaffold a new pipeline (account/channel): npm run pipeline:new -- --id my-channel --kind story --label "My Channel"
 * Writes config/brands/<id>.json and a universe file; nothing else needs editing in code.
 */
import path from 'node:path';
import { createPipeline } from '../lib/pipelineScaffold.js';
import type { BrandKind } from '../lib/brands.js';

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

const id = (arg('id') || '').trim().toLowerCase();
const config = await createPipeline({
  id,
  kind: (arg('kind') || 'story') as BrandKind,
  label: arg('label'),
  language: arg('language') as 'hi' | 'en' | undefined,
  cta: arg('cta')
});

console.log(`Created pipeline "${config.id}" (${config.kind})
  ${path.join('config', 'brands', `${config.id}.json`)}
  ${config.universeFile}   (edit: positioning + editorial rules for this channel)

Next:
  1. Edit config/brands/${config.id}.json: blurb, ctaDefault, publishProfiles, commentDm.
  2. Restart \`npm run ui\` and pick "${config.label}" in the Desk.
  3. Connect accounts for this pipeline only:
       npm run publish:youtube-auth -- --brand ${config.id}
       npm run publish:instagram-auth -- --brand ${config.id}
  See docs/custom-pipelines.md`);
