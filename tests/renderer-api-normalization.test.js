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

test('renderer bot binding client uses the catId contract instead of the removed boundCatId field', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api.ts'),
    'utf8',
  );

  assert.match(source, /catId:\s*string/u);
  assert.equal(
    source.includes('boundCatId'),
    false,
    'renderer bot binding client should not send the removed boundCatId field',
  );
});

test('renderer cat memory client reads the single-record create response shape', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api.ts'),
    'utf8',
  );

  assert.match(source, /expectJson<\{\s*memory:\s*DurableMemoryItem\s*\}>/u);
});

test('ChatView reads roomRouting from the normalized selected-channel view without casts', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/components/ChatView.tsx'),
    'utf8',
  );

  assert.equal(
    source.includes('(selectedChannel as'),
    false,
    'ChatView should rely on the normalized SelectedChannelView type instead of roomRouting casts',
  );
});
