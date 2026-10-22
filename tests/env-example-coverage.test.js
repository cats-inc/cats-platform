import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url);
const repoFile = (relative) => readFile(new URL(relative, repoRoot), 'utf8');
const catsNames = (source) => new Set(source.match(/\bCATS_[A-Z0-9_]+\b/gu) ?? []);

// Read by the server or Desktop host config but deliberately absent from
// .env.example: hosts inject them, or they are packaging/dev entry overrides
// documented in docs/deployment.md.
const NOT_IN_EXAMPLE = new Set([
  'CATS_RUNTIME_CATALOG_CONFIG_PATH',
  'CATS_RUNTIME_PACKAGE_ROOT',
  'CATS_DESKTOP_APP_ENTRY',
  'CATS_DESKTOP_APP_ROOT',
  'CATS_DESKTOP_CANDIDATE_ROOT',
  'CATS_DESKTOP_PACKAGING_OUTPUT_ROOT',
  'CATS_DESKTOP_PRELOAD_SCRIPT',
  'CATS_DESKTOP_RUNTIME_ENTRY',
  'CATS_DESKTOP_RUNTIME_ROOT',
]);

test('.env.example lists every CATS_* variable the server and Desktop host config read', async () => {
  const example = catsNames(await repoFile('.env.example'));
  for (const file of ['src/config.ts', 'desktop/host/config.ts']) {
    const missing = [...catsNames(await repoFile(file))]
      .filter((name) => !example.has(name) && !NOT_IN_EXAMPLE.has(name));
    assert.deepEqual(missing, [], `${file} reads variables missing from .env.example`);
  }
});

test('.env.example keeps no CATS_* key that nothing reads any more', async () => {
  const keys = [...(await repoFile('.env.example')).matchAll(/^#?\s*(CATS_[A-Z0-9_]+)=/gmu)]
    .map((match) => match[1]);
  const read = new Set(execFileSync('git', ['grep', '-h', '-o', '-E', '\\bCATS_[A-Z0-9_]+\\b', '--',
    'src', 'desktop', 'scripts', 'vite.config.ts', ':!*.test.*'], { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/u));
  assert.deepEqual(keys.filter((key) => !read.has(key)), []);
});
