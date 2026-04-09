import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('desktop host shows the bootstrap window on initial load without relying only on ready-to-show', async () => {
  const source = await readFile(
    new URL('../desktop/host/main.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /const showBootstrapWindow = \(\) => \{/u);
  assert.match(source, /window\.webContents\.once\('did-finish-load', showBootstrapWindow\);/u);
  assert.match(source, /window\.once\('ready-to-show', showBootstrapWindow\);/u);
  assert.match(source, /bootstrapPageVisible = true;\s*[\r\n]+\s*await window\.loadURL/u);
});
