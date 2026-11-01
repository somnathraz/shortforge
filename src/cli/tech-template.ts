#!/usr/bin/env node
/**
 * Scene template catalog + scaffold.
 *
 * Flow:
 *   1) npm run tech:template:list
 *   2) npm run tech:template:scaffold -- --id mobility.surge
 *      → creates remotion TS scene + registers id
 *   3) Or paste TSX in Tech Studio → Save scene
 *   4) Put "template": "<id>" on every beat in reel JSON
 */
import {
  listRegisteredTemplates,
  scaffoldSceneTemplate
} from '../lib/techReelSceneTemplates.js';

const value = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i < 0 ? undefined : process.argv[i + 1];
};

async function list(): Promise<void> {
  console.log('Scene templates (create TS before using id in JSON):\n');
  const templates = await listRegisteredTemplates();
  for (const t of templates) {
    console.log(`  ${t.id.padEnd(22)} [${t.status}] ${t.title}`);
    console.log(`    ${t.llm}`);
  }
  console.log('\nWrote data/tech-templates/CATALOG.md (via catalog.json)');
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'list' || process.argv.includes('--list')) {
    await list();
    return;
  }
  if (cmd === 'scaffold' || process.argv.includes('--id')) {
    const id = value('--id') || process.argv[3];
    if (!id || id.startsWith('-')) throw new Error('Usage: npm run tech:template:scaffold -- --id pack.name');
    const result = await scaffoldSceneTemplate(id);
    console.log(`Created scene: ${result.relativePath}`);
    console.log(`Registered id: ${result.id}`);
    console.log(`Next: implement the scene, then set "template": "${result.id}" on reel beats.`);
    return;
  }
  console.log(`Usage:
  npm run tech:template:list
  npm run tech:template:scaffold -- --id mobility.surge`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
