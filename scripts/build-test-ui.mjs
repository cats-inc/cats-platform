import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { build } from 'esbuild';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(rootDir, 'tests');

/**
 * TypeScript tests are bundled here because `node --test` only collects the
 * plain `.js` files under `tests/`. Both extensions must be picked up: a
 * `.test.ts` that is not bundled is not merely unchecked, it never runs at all,
 * and a test that never runs looks exactly like a passing one.
 */
const TEST_ENTRY_EXTENSIONS = ['.test.ts', '.test.tsx'];

const entryPoints = (await readdir(testsDir))
  .filter((fileName) => TEST_ENTRY_EXTENSIONS.some((ext) => fileName.endsWith(ext)))
  .sort()
  .map((fileName) => join(testsDir, fileName));

if (entryPoints.length === 0) {
  throw new Error(
    `No test entry points found in tests/*{${TEST_ENTRY_EXTENSIONS.join(',')}}`,
  );
}

await build({
  entryPoints,
  bundle: true,
  external: ['jsdom', 'typescript'],
  platform: 'node',
  format: 'esm',
  outbase: testsDir,
  outdir: join(rootDir, 'build', 'test'),
});
