import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * PLAN-077 §"Add a build-time lint/test guard, not a runtime throw, that
 * production companion feed code cannot import MOCK_POSTS or fixture-only
 * post data."
 *
 * Today the mock fixtures (`MOCK_POSTS`, `MOCK_VIDEOS`, `MOCK_PHOTO_HUES`,
 * `MOCK_TRACKS`, `MOCK_FILES`) live as local constants inside
 * `CompanionFeed.tsx` and are only rendered in the legacy code path that
 * the companion-profile-IA flag gates off. This guard makes sure they
 * cannot leak across the module boundary — once the projection-driven
 * render lands, the constants will be removed entirely; until then,
 * "module-local only" is the contract.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPANION_DIR = path.resolve(
  HERE,
  '..',
  'src',
  'products',
  'chat',
  'renderer',
  'components',
  'companion',
);

const MOCK_IDENTIFIERS = [
  'MOCK_POSTS',
  'MOCK_VIDEOS',
  'MOCK_PHOTO_HUES',
  'MOCK_TRACKS',
  'MOCK_FILES',
] as const;

async function* walkSourceFiles(dir: string): AsyncIterable<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(full);
      continue;
    }
    if (
      entry.isFile()
      && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      yield full;
    }
  }
}

test('only CompanionFeed.tsx defines or references the legacy mock fixtures', async () => {
  const offenders: Array<{ file: string; identifier: string }> = [];
  for await (const file of walkSourceFiles(COMPANION_DIR)) {
    if (path.basename(file) === 'CompanionFeed.tsx') continue;
    const text = await readFile(file, 'utf8');
    for (const id of MOCK_IDENTIFIERS) {
      if (text.includes(id)) {
        offenders.push({ file, identifier: id });
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'Mock companion fixtures must remain inside CompanionFeed.tsx until the projection-driven '
      + 'renderer lands.',
  );
});

test('CompanionFeed.tsx does not export the mock fixtures', async () => {
  const text = await readFile(path.join(COMPANION_DIR, 'CompanionFeed.tsx'), 'utf8');
  for (const id of MOCK_IDENTIFIERS) {
    assert.equal(
      text.includes(`export const ${id}`),
      false,
      `${id} must remain a module-local constant`,
    );
    assert.equal(
      text.includes(`export { ${id}`),
      false,
      `${id} must not be re-exported`,
    );
  }
});
