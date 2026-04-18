import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readStylesheetSync } from './helpers/readStylesheet.js';

test('sidebar overflow menus stay above the footer chrome', async () => {
  const chatShellStyles = readStylesheetSync(
    new URL('../src/products/chat/renderer/styles/chat-shell.css', import.meta.url),
  );
  const chatThreadStyles = readStylesheetSync(
    new URL('../src/products/chat/renderer/styles/chat-thread.css', import.meta.url),
  );
  const extrasStyles = await readFile(
    new URL('../src/products/shared/renderer/styles/extras.css', import.meta.url),
    'utf8',
  );

  const sidebarRule = chatShellStyles.match(/\.sidebar\s*\{[^}]+\}/u)?.[0] ?? '';
  const recentOverflowRule = chatThreadStyles.match(/\.recentOverflowMenu\s*\{[^}]+\}/u)?.[0] ?? '';
  const parallelFooterRule = chatThreadStyles.match(/\.parallelFooterBar\s*\{[^}]+\}/u)?.[0] ?? '';
  const composerDockedMenuRule = chatThreadStyles.match(
    /\.composerCardDocked\.composerCardMenuOpen\s*\{[^}]+\}/u,
  )?.[0] ?? '';
  const composerFreshMenuRule = chatThreadStyles.match(
    /\.composerCardFresh\.composerCardMenuOpen\s*\{[^}]+\}/u,
  )?.[0] ?? '';
  const myCatOverflowRule = extrasStyles.match(/\.myCatOverflowMenu\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(sidebarRule, /z-index:\s*10/u);
  assert.match(recentOverflowRule, /z-index:\s*90/u);
  assert.match(parallelFooterRule, /z-index:\s*4/u);
  assert.match(composerDockedMenuRule, /z-index:\s*12/u);
  assert.match(composerFreshMenuRule, /z-index:\s*12/u);
  assert.match(composerFreshMenuRule, /position:\s*relative/u);
  assert.match(myCatOverflowRule, /z-index:\s*90/u);
});
