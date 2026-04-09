import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('renderer app-shell normalizer does not reference the legacy pre-rename identifier', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api/normalization.ts'),
    'utf8',
  );
  const start = source.indexOf('export function normalizeAppShellPayload');
  const end = source.length;

  assert.notEqual(start, -1, 'normalizeAppShellPayload should exist');

  const normalizeSource = source.slice(start, end);
  assert.equal(
    /\bworkspace\b/.test(normalizeSource),
    false,
    'normalizeAppShellPayload should only use chatState after the rename',
  );
});

test('renderer bot binding client uses the catId contract instead of the removed boundCatId field', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api/telegram.ts'),
    'utf8',
  );
  const sharedSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/api/telegram.ts'),
    'utf8',
  );
  const implementationSource =
    /shared\/renderer\/api\/telegram\.js/u.test(source)
      ? sharedSource
      : source;

  assert.match(implementationSource, /catId:\s*string/u);
  assert.equal(
    implementationSource.includes('boundCatId'),
    false,
    'renderer bot binding client should not send the removed boundCatId field',
  );
});

test('renderer cat memory client reads the single-record create response shape', async () => {
  const chatSource = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api/memory.ts'),
    'utf8',
  );
  const sharedSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/api/memory.ts'),
    'utf8',
  );

  assert.match(
    chatSource,
    /export \* from '\.\.\/\.\.\/\.\.\/shared\/renderer\/api\/memory\.js';/u,
    'chat memory client should reuse the shared renderer substrate',
  );
  assert.match(sharedSource, /expectJson<\{\s*memory:\s*DurableMemoryItem\s*\}>/u);
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
