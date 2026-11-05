#!/usr/bin/env node
/**
 * Test runner. Some tests expect two sample pipelines ("epicastra" story, "tech-instagram" tech) and
 * their sample data. A fresh Shortforge checkout ships none, so this copies test/fixtures/workspace
 * into place for files that do not exist yet, runs the suite, then removes only what it added.
 * If your own pipelines already exist at those paths, nothing is copied and nothing is removed.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fixtures = path.join(root, 'test', 'fixtures', 'workspace');
const added = [];
const addedDirs = [];

function copyMissing(src, dest) {
  if (statSync(src).isDirectory()) {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
      addedDirs.push(dest);
    }
    for (const name of readdirSync(src)) copyMissing(path.join(src, name), path.join(dest, name));
  } else if (!existsSync(dest)) {
    cpSync(src, dest);
    added.push(dest);
  }
}

if (existsSync(fixtures)) copyMissing(fixtures, root);
const args = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...(args.length ? args : readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`))],
  { cwd: root, stdio: 'inherit' }
);
for (const file of added) rmSync(file, { force: true });
for (const dir of addedDirs.reverse()) {
  try {
    if (!readdirSync(dir).length) rmSync(dir, { recursive: true });
  } catch {
    // already gone
  }
}
process.exit(result.status ?? 1);
