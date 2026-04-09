import assert from 'node:assert/strict';
import test from 'node:test';

import { readStylesheetSync } from './helpers/readStylesheet.js';

test('chat parallel draft keeps stacked composer cards for additional targets', () => {
  const stylesheet = readStylesheetSync(
    new URL('../src/products/chat/renderer/styles/chat.css', import.meta.url),
  );

  const anchorRule = stylesheet.match(/\.parallelComposerAnchor\s*\{[^}]+\}/u)?.[0] ?? '';
  const stackRule = stylesheet.match(/\.parallelStubStack\s*\{[^}]+\}/u)?.[0] ?? '';
  const cardRule = stylesheet.match(/\.parallelStubCard\s*\{[^}]+\}/u)?.[0] ?? '';
  const removeRule = stylesheet.match(/\.parallelStubRemove\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(anchorRule, /z-index:\s*3;/u);
  assert.match(stackRule, /flex-direction:\s*column;/u);
  assert.match(cardRule, /margin-top:\s*-14px;/u);
  assert.match(cardRule, /border-top:\s*none;/u);
  assert.match(cardRule, /border-radius:\s*0 0 22px 22px;/u);
  assert.match(removeRule, /width:\s*28px;/u);
});
