import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { resolveProjectPath } from './helpers/projectRoot.js';

/**
 * Guards that every test file is actually collected by `npm test`.
 *
 * For most of this repository's life `tests/*.test.ts` was neither bundled nor
 * matched by a run glob, so 75 files silently never executed. A test that never
 * runs is indistinguishable from a passing one, which makes this the one gap in
 * a test suite that cannot be caught by the suite itself unless it is asserted
 * explicitly.
 */

const projectRoot = resolveProjectPath(import.meta.url, '.');
const testsDir = join(projectRoot, 'tests');

function readProjectFile(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

/** The path arguments the `test` script hands to `node --test`. */
function resolveRunTargets() {
  const { scripts } = JSON.parse(readProjectFile('package.json'));
  const testScript = scripts.test;
  const nodeTest = testScript.slice(testScript.indexOf('node --test'));
  return nodeTest
    .split(/\s+/u)
    .filter((argument) => !argument.startsWith('--') && argument !== 'node');
}

/** The extensions `build-test-ui.mjs` bundles into `build/test/`. */
function resolveBundledExtensions() {
  const builder = readProjectFile(join('scripts', 'build-test-ui.mjs'));
  const declaration = /TEST_ENTRY_EXTENSIONS\s*=\s*\[([^\]]*)\]/u.exec(builder);
  assert.ok(declaration, 'build-test-ui.mjs no longer declares TEST_ENTRY_EXTENSIONS');
  return [...declaration[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]);
}

const TEST_FILE_PATTERN = /\.test\.(js|ts|tsx)$/u;

test('every test file under tests/ is collected by the npm test script', () => {
  const runTargets = resolveRunTargets();
  const bundledExtensions = resolveBundledExtensions();

  // The two ways a file reaches the runner: matched where it lives, or bundled
  // into build/test/ and matched there.
  const runsInPlace = runTargets.includes('tests/**/*.test.js');
  const runsWhenBundled = runTargets.includes('build/test/*.test.js');
  assert.ok(runsInPlace, 'the test script no longer runs tests/**/*.test.js');
  assert.ok(runsWhenBundled, 'the test script no longer runs build/test/*.test.js');

  const uncollected = readdirSync(testsDir)
    .filter((fileName) => TEST_FILE_PATTERN.test(fileName))
    .filter((fileName) => {
      if (fileName.endsWith('.test.js')) {
        return false;
      }
      return !bundledExtensions.some((extension) => fileName.endsWith(extension));
    });

  assert.deepEqual(
    uncollected,
    [],
    'these test files would never run: neither matched by a run glob nor bundled',
  );
});

test('every bundled test source produced an output file', () => {
  const buildTestDir = join(projectRoot, 'build', 'test');
  if (!existsSync(buildTestDir)) {
    // Running this file standalone before a build is legitimate; the static
    // check above still holds. `npm test` always builds first.
    return;
  }

  const bundledExtensions = resolveBundledExtensions();
  const built = new Set(readdirSync(buildTestDir));
  const missing = readdirSync(testsDir)
    .filter((fileName) => bundledExtensions.some((extension) => fileName.endsWith(extension)))
    .filter((fileName) => !built.has(fileName.replace(/\.tsx?$/u, '.js')));

  assert.deepEqual(missing, [], 'these test sources were bundled but produced no output');
});
