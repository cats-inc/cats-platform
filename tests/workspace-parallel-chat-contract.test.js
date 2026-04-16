import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('workspace app-shell producer includes parallelChatGroups summaries', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/state/shell.ts'),
    'utf8',
  );

  assert.match(
    source,
    /parallelChatGroups:\s*summary\.parallelChatGroups/u,
    'createAppShell should publish parallel chat groups into the shared app shell payload',
  );
});

test('shared renderer normalizer backfills missing parallelChatGroups arrays', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/api/normalization.ts'),
    'utf8',
  );

  assert.match(
    source,
    /if\s*\(!Array\.isArray\(chatState\.parallelChatGroups\)\)\s*\{\s*chatState\.parallelChatGroups = \[\];/u,
    'shared renderer normalization should remain tolerant of older payload snapshots',
  );
});
