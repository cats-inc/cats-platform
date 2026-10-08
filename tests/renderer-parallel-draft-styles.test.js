import assert from 'node:assert/strict';
import test from 'node:test';

import { readStylesheetSync } from './helpers/readStylesheet.js';

test('chat parallel draft keeps its composer cards on a raised stacking layer', () => {
  const stylesheet = readStylesheetSync(
    new URL('../src/products/chat/renderer/styles/chat.css', import.meta.url),
  );

  const anchorRule = stylesheet.match(/\.parallelComposerAnchor\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(anchorRule, /z-index:\s*3;/u);
});
