import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function bundleServer({
  entryPoint = resolve(root, 'build', 'server', 'index.js'),
  outfile = resolve(root, 'build', 'server-bundle', 'index.js'),
} = {}) {
  return build({
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: true,
    packages: 'external',
    // Package-import aliases are otherwise inlined despite packages: external.
    // Keep the SDK's import.meta.url beside its shipped browser.js resource.
    external: ['#cats-app-package'],
  });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Usage: node scripts/bundle-server.mjs (after npm run build:server)');
  else await bundleServer();
}
