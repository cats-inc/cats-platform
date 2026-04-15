import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [resolve(root, 'build', 'server', 'index.js')],
  bundle: true,
  outfile: resolve(root, 'build', 'server-bundle', 'index.js'),
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
});
