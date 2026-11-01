#!/usr/bin/env node
/**
 * Tiny human review gate for a produced final Short.
 * Actions: APPROVE | REGENERATE | REJECT
 */
import '../lib/loadEnv.js';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildProductionReport,
  finalRootDir,
  productionReportPath,
  writeProductionReport,
  type ProductionReport
} from '../lib/productionCost.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const episodeId = valueFor('--episode');
  const action = (valueFor('--action') || '').toUpperCase();
  if (!episodeId || !['APPROVE', 'REGENERATE', 'REJECT'].includes(action)) {
    throw new Error(
      [
        'Usage: npm run review -- --episode <episodeId> --action APPROVE|REGENERATE|REJECT',
        '       [--scene 4]   # with REGENERATE',
        '       [--video final/file.mp4]   # selected output to approve',
        'Opens nothing in a browser yet — updates production JSON + prints next step.'
      ].join('\n')
    );
  }

  const reportFile = productionReportPath(episodeId);
  let report: ProductionReport;
  try {
    report = JSON.parse(await readFile(reportFile, 'utf8')) as ProductionReport;
  } catch {
    // Older still-only renders did not create a production report. Start one so an
    // existing full-length output can still pass through the same review gate.
    report = buildProductionReport(episodeId, []);
  }
  const selectedVideoRaw = valueFor('--video');
  const outputRoot = path.dirname(finalRootDir());
  const selectedVideo = selectedVideoRaw
    ? path.isAbsolute(selectedVideoRaw)
      ? path.resolve(selectedVideoRaw)
      : path.resolve(outputRoot, selectedVideoRaw.replace(/^\/?api\/media\//, ''))
    : undefined;
  if (
    selectedVideo &&
    selectedVideo !== outputRoot &&
    !selectedVideo.startsWith(`${outputRoot}${path.sep}`)
  ) {
    throw new Error('Selected review video must be inside output/');
  }
  if (selectedVideo) await access(selectedVideo);
  const finalVideo = selectedVideo || report.finalVideo || path.join(finalRootDir(), `${episodeId}.mp4`);
  await access(finalVideo);

  console.log(`[Play final video] ${finalVideo}`);
  console.log('Actions: APPROVE | REGENERATE SCENE N | REJECT');

  if (action === 'APPROVE') {
    report.finalVideo = finalVideo;
    report.reviewStatus = 'APPROVED';
    report.regenerateSceneIds = [];
    for (const scene of report.scenes) scene.accepted = true;
    await writeProductionReport(report);
    console.log('APPROVED — next:');
    console.log(`  npm run package -- --episode ${episodeId}`);
    console.log(`  npm run publish -- --episode ${episodeId} --dry-run`);
    console.log(`  npm run publish -- --episode ${episodeId} --platforms youtube,instagram,facebook`);
    return;
  }

  if (action === 'REJECT') {
    report.reviewStatus = 'REJECTED';
    for (const scene of report.scenes) {
      if (scene.renderMode === 'AI_VIDEO') scene.accepted = false;
    }
    await writeProductionReport(report);
    console.log('REJECTED — do not publish.');
    return;
  }

  const sceneRaw = valueFor('--scene');
  if (!sceneRaw) throw new Error('REGENERATE requires --scene N');
  const sceneId = Number(sceneRaw);
  report.reviewStatus = 'REGENERATE';
  report.regenerateSceneIds = [sceneId];
  for (const scene of report.scenes) {
    if (scene.sceneId === sceneId) scene.accepted = false;
  }
  await writeProductionReport(report);
  console.log(`REGENERATE scene ${sceneId}:`);
  console.log(
    `  npm run animate -- --provider ${report.scenes.find((s) => s.sceneId === sceneId)?.provider || 'wan'} --episode data/episodes/<file>.json --scene ${sceneId}`
  );
  console.log(`  npm run produce -- --episode ${episodeId} --reuse-ai`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
