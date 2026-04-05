#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectories = [
  'build',
  'dist',
  'dist-server',
  'dist-electron',
  'dist-test',
];

await Promise.all(
  outputDirectories.map((relativePath) =>
    rm(resolve(projectRoot, relativePath), { recursive: true, force: true })),
);
