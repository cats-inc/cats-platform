import { readdir } from 'node:fs/promises';
import { build } from 'esbuild';

const testsDir = 'tests';
const entryPoints = (await readdir(testsDir))
  .filter((fileName) => fileName.endsWith('.test.tsx'))
  .sort()
  .map((fileName) => `./${testsDir}/${fileName}`);

if (entryPoints.length === 0) {
  throw new Error('No test UI entry points found in tests/*.test.tsx');
}

await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outbase: testsDir,
  outdir: 'build/test',
});
