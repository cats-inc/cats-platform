#!/usr/bin/env node
// Build the minimal example App into a validated .catsapp with the public App SDK entry.
// Usage: node build.mjs [--out <directory>]   (default: ./dist under the current directory)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAppPackage, validateRendererAppPackage } from '@cats-inc/cats-platform/app-sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
// Validate against the host being built for: the installed Platform package's own version.
const { version: platformVersion } = createRequire(import.meta.url)('@cats-inc/cats-platform/package.json');

export async function buildMinimalApp({ outDir = path.resolve('dist') } = {}) {
  const manifest = JSON.parse(await readFile(path.join(here, 'cats.app.json'), 'utf8'));
  const html = await readFile(path.join(here, manifest.entrypoints.renderer));
  const bytes = encodeAppPackage({ manifest, files: [{ path: manifest.entrypoints.renderer, data: html }] });
  const { sha256 } = validateRendererAppPackage(bytes, { platformVersion });
  await mkdir(outDir, { recursive: true });
  const artifactPath = path.join(outDir, `${manifest.id}-${manifest.version}.catsapp`);
  await writeFile(artifactPath, bytes);
  return { artifactPath, sha256 };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const outIndex = process.argv.indexOf('--out');
  if (process.argv.includes('--help')) {
    console.log('Usage: node build.mjs [--out <directory>]');
  } else {
    const result = await buildMinimalApp(outIndex > 0 ? { outDir: path.resolve(process.argv[outIndex + 1]) } : {});
    console.log(`${result.artifactPath}\nsha256 ${result.sha256}`);
  }
}
