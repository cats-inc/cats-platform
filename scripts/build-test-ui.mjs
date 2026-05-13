import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { build } from 'esbuild';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(rootDir, 'tests');
const entryPoints = (await readdir(testsDir))
  .filter((fileName) => fileName.endsWith('.test.tsx'))
  .sort()
  .map((fileName) => join(testsDir, fileName));

if (entryPoints.length === 0) {
  throw new Error('No test UI entry points found in tests/*.test.tsx');
}

await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outbase: testsDir,
  outdir: join(rootDir, 'build', 'test'),
});
