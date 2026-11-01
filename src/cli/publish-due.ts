#!/usr/bin/env node
/**
 * Fire due deferred publish schedules (Instagram / Facebook Story queue).
 * Usage: npm run publish:due
 */
import '../lib/loadEnv.js';
import { processDueSchedules } from '../pipeline/processSchedules.js';
import { pruneOldSchedules } from '../pipeline/publishSchedules.js';

async function main(): Promise<void> {
  const result = await processDueSchedules();
  if (result.processed.length) {
    console.log(`Processed: ${result.processed.join(', ')}`);
  } else {
    console.log('No due schedules');
  }
  for (const row of result.errors) {
    console.error(`Failed ${row.id}: ${row.error}`);
  }
  const pruned = await pruneOldSchedules(30);
  if (pruned) console.log(`Pruned ${pruned} old schedule record(s)`);
  if (result.errors.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
