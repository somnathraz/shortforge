import { readFileSync } from 'node:fs';
import { defaultTechBrandId } from './brands.js';
import { TechReelAuthoringSchema } from '../schema/techReel.js';
import { TECH_REEL_ELEMENTS } from '../visual/techReelElements.js';
import { formatTechReelTemplateCatalog } from '../visual/techReelTemplates.js';

/** Single sample/contract shared by UI downloads, copied prompts, and validation tests. */
export function buildTechReelScriptBundle(topic = '{{TOPIC}}', brandId: string = defaultTechBrandId()) {
  const template = TechReelAuthoringSchema.parse(JSON.parse(readFileSync(new URL('../../templates/tech-reel-sample.json', import.meta.url), 'utf8')));
  const contract = readFileSync(new URL('../../templates/tech-instagram-script-llm-brief.txt', import.meta.url), 'utf8');
  return {
    brandId,
    downloadStem: 'tech-orbital-script',
    template: { ...template, brandId },
    llmPrompt: contract
      .replace('{{TOPIC}}', () => topic.slice(0, 2000))
      .replace('{{ELEMENT_CATALOG}}', () => TECH_REEL_ELEMENTS.map(element => `- ${element.kind}: ${element.use}`).join('\n'))
      .replace('{{SCENE_TEMPLATES}}', () => formatTechReelTemplateCatalog())
      .replace('{{SAMPLE_JSON}}', () => JSON.stringify(template, null, 2)),
    elements: TECH_REEL_ELEMENTS,
    sceneTemplates: formatTechReelTemplateCatalog(),
    notes: [
      'Request Coalescing is the default orbital visual template.',
      'For scene-wise TS templates: create with npm run tech:template:scaffold, then set beats[].template.',
      'Fonts/palette stay in src/visual/techReelTheme.ts.',
      'Import into Tech Reels studio; review claims before publishing.'
    ],
    fieldGuide: [
      { field: 'version / brandId / style / accent / voice / lang', required: true, note: 'Locked channel settings. Do not change.' },
      { field: 'id / title / sourceReview', required: true, note: 'New story identity, learning goal, factual sources and caveat.' },
      { field: 'nodes / beats', required: true, note: 'Editable persistent diagram, short narration and teaching beats. See full LLM contract.' },
      { field: 'beats[].template', required: false, note: 'Optional scene template id from the TS registry (create .tsx first, then set id).' },
    ],
  };
}
