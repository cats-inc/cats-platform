import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

// CI skips application checks when a change touches only docs/, so no test,
// script or tool may read repository documentation. Keep executable inputs
// under tests/fixtures/.
const repoRoot = process.cwd();
const sourceFile = /\.(?:[cm]?js|[cm]?ts|tsx)$/;
const testFile = /\.test\.(?:[cm]?js|[cm]?ts|tsx)$/;
// A quoted path that starts at docs/, or a 'docs' segment passed to join/resolve.
const docsPath = /['"`](?:\.{1,2}\/)*docs\/|['"`]docs['"`]\s*[,)]/;
// A single line that names docs/ without reading it carries a trailing
// `docs-boundary-ignore: <reason>` comment.
const ignoreMarker = /docs-boundary-ignore: \S/;
const skippedDirectories = new Set(['node_modules', 'build', 'dist', 'generated', '.expo']);

function listSources(directory) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return skippedDirectories.has(entry.name) ? [] : listSources(path);
    return sourceFile.test(entry.name) ? [path] : [];
  });
}

test('tests, scripts and tools stay independent of repository docs', () => {
  const candidates = [
    ...['tests', 'scripts', 'tools'].flatMap((root) => listSources(join(repoRoot, root))),
    // Production source is packaged without docs; only its tests can read them.
    ...['src', 'desktop', 'mobile'].flatMap((root) => listSources(join(repoRoot, root)))
      .filter((path) => testFile.test(path)),
  ];
  const violations = candidates
    .map((path) => relative(repoRoot, path).split(sep).join('/'))
    .filter((path) => path !== 'tests/docs-boundary.test.js')
    .flatMap((path) => readFileSync(join(repoRoot, path), 'utf8').split(/\r?\n/)
      .map((line, index) => ({ line, at: `${path}:${index + 1}` }))
      .filter(({ line }) => docsPath.test(line) && !ignoreMarker.test(line))
      .map(({ at, line }) => `${at}: ${line.trim()}`));
  assert.deepEqual(violations, [], 'Move executable inputs under tests/fixtures/ instead of reading docs/.');
});
