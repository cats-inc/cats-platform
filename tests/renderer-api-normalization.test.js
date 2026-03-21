import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('renderer app-shell normalizer does not reference the legacy pre-rename identifier', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api.ts'),
    'utf8',
  );
  const start = source.indexOf('function normalizeAppShellPayload');
  const end = source.indexOf('export async function fetchProviders');

  assert.notEqual(start, -1, 'normalizeAppShellPayload should exist');
  assert.notEqual(end, -1, 'fetchProviders should exist after normalizeAppShellPayload');

  const normalizeSource = source.slice(start, end);
  assert.equal(
    /\bworkspace\b/.test(normalizeSource),
    false,
    'normalizeAppShellPayload should only use chatState after the rename',
  );
});
