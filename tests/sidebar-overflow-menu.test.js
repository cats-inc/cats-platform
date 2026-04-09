import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('conversation sidebar overflow menus position before first paint', async () => {
  const source = await readFile(
    new URL('../src/app/renderer/productShell/useFloatingSidebarMenu.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /useLayoutEffect\(\(\) => \{/u);
  assert.match(source, /visibility:\s*'hidden'/u);
  assert.match(source, /pointerEvents:\s*'none'/u);
});
