#!/usr/bin/env node

import { readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobileBuildRoot = resolve(projectRoot, 'build', 'mobile');

async function collectFiles(root, relativePrefix = '') {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

let rootStats;
try {
  rootStats = await stat(mobileBuildRoot);
} catch (error) {
  throw new Error(`Mobile build output is missing at ${mobileBuildRoot}. Run npm run build:mobile first.`, {
    cause: error,
  });
}

if (!rootStats.isDirectory()) {
  throw new Error(`Mobile build output is not a directory: ${mobileBuildRoot}`);
}

const files = await collectFiles(mobileBuildRoot);
if (files.length === 0) {
  throw new Error(`Mobile build output is empty: ${mobileBuildRoot}`);
}

const hasMetadata = files.some((file) => file === 'metadata.json');
const hasStaticBundle = files.some((file) =>
  /^_expo\/static\/js\/[^/]+\/.+\.(?:js|hbc)$/u.test(file));

if (!hasMetadata) {
  throw new Error('Mobile build output is missing metadata.json.');
}

if (!hasStaticBundle) {
  throw new Error('Mobile build output is missing an Expo static bundle under _expo/static/js/.');
}

console.log(`Mobile build output verified (${files.length} files).`);
