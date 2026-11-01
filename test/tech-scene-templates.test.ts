import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { formatTsxSource, publishSceneTemplate } from '../src/lib/techReelSceneTemplates.js';
import { isKnownTechReelTemplate } from '../src/visual/techReelTemplates.js';

test('formatTsxSource strips markdown fences and normalizes whitespace', () => {
  const raw = '```tsx\nexport const Scene = () => null;\n\n\nexport const meta = { id: "x.y" };\n```\n';
  const out = formatTsxSource(raw);
  assert.equal(out.startsWith('```'), false);
  assert.ok(out.includes('export const Scene'));
  assert.ok(out.endsWith('\n'));
  assert.equal(out.includes('\n\n\n'), false);
});

test('publishSceneTemplate registers id in catalog.json for immediate validation', async () => {
  const id = 'custom.ui-paste-test';
  const scenePath = path.join(process.cwd(), 'remotion/src/templates/scenes', `${id}.tsx`);
  const catalogPath = path.join(process.cwd(), 'data/tech-templates/catalog.json');
  const catalogTsPath = path.join(process.cwd(), 'src/visual/techReelTemplates.ts');
  const registryPath = path.join(process.cwd(), 'remotion/src/templates/registry.ts');
  const catalogBefore = await readFile(catalogPath, 'utf8');
  const catalogTsBefore = await readFile(catalogTsPath, 'utf8');
  const registryBefore = await readFile(registryPath, 'utf8');

  const source = `import React from 'react';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

const UiPasteTestScene: React.FC<{ context: SceneContext }> = () => (
  <svg width={1080} height={720}><text x={40} y={40} fill={theme.text}>ok</text></svg>
);

export const meta = {
  id: '${id}',
  title: 'UI paste test',
  pack: 'custom',
  llm: 'test only',
  status: 'draft' as const
};

export const Scene = UiPasteTestScene;
export default { meta, Scene } satisfies SceneTemplateModule;
`;

  try {
    const result = await publishSceneTemplate({ id, source, overwrite: true });
    assert.equal(result.id, id);
    assert.ok(result.templates.some((t) => t.id === id));
    assert.equal(isKnownTechReelTemplate(id), true);
    assert.match(await readFile(scenePath, 'utf8'), /export const Scene/);
  } finally {
    await rm(scenePath, { force: true });
    await writeFile(catalogPath, catalogBefore);
    await writeFile(catalogTsPath, catalogTsBefore);
    await writeFile(registryPath, registryBefore);
  }
});
