#!/usr/bin/env node
// Publishes the built app (dist/) to the public repository
// nu-stats/egocraft-app, which GitHub Pages serves at
// https://nu-stats.github.io/egocraft-app/ (the address iPads use).
// Only the built files go there: no source code, no study data.
//
//   npm run build
//   node scripts/publish-web.mjs            (git and an authorized gh on PATH)
//
// Works in a clone kept in ../cache/egocraft-app (git-ignored).

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'nu-stats/egocraft-app';
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const dist = path.join(app, 'dist');
const work = path.resolve(app, '..', 'cache', 'egocraft-app');
const run = (cmd, args, cwd = work) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

if (!existsSync(path.join(dist, 'sw.js'))) throw new Error('No build found: run "npm run build" first.');
const version = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8')).version;

if (!existsSync(path.join(work, '.git'))) {
  mkdirSync(path.dirname(work), { recursive: true });
  run('git', ['clone', `https://github.com/${REPO}.git`, work], path.dirname(work));
}
run('git', ['pull', '--ff-only']);

// Replace everything but the repository's own files.
const keep = new Set(['.git', 'README.md', 'LICENSE-MIT', 'LICENSE-APACHE', '.nojekyll']);
for (const name of readdirSync(work)) if (!keep.has(name)) rmSync(path.join(work, name), { recursive: true, force: true });
cpSync(dist, work, { recursive: true });
writeFileSync(path.join(work, '.nojekyll'), '');

run('git', ['add', '-A']);
if (!run('git', ['status', '--porcelain'])) {
  console.log('Nothing changed: the published app is already this build.');
} else {
  run('git', ['commit', '-m', `EgoCraft ${version}`]);
  run('git', ['push', 'origin', 'HEAD']);
  console.log(`Published EgoCraft ${version} to https://nu-stats.github.io/egocraft-app/ (Pages takes a minute or two).`);
}
