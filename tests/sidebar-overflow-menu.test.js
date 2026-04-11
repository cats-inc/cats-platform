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

test('conversation sidebar overflow menus render through a portal so they escape sidebar stacking contexts', async () => {
  const myCatsSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebarMyCats.tsx', import.meta.url),
    'utf8',
  );
  const recentsSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebarRecents.tsx', import.meta.url),
    'utf8',
  );
  const portalSource = await readFile(
    new URL('../src/app/renderer/productShell/SidebarFloatingMenuPortal.tsx', import.meta.url),
    'utf8',
  );

  assert.match(myCatsSource, /SidebarFloatingMenuPortal/u);
  assert.match(recentsSource, /SidebarFloatingMenuPortal/u);
  assert.match(portalSource, /createPortal/u);
  assert.match(portalSource, /document\.body/u);
});
