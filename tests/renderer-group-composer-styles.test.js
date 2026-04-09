import assert from 'node:assert/strict';
import test from 'node:test';

import { readStylesheetSync } from './helpers/readStylesheet.js';

test('chat group draft composer keeps the dedicated add-participant row styling', () => {
  const stylesheet = readStylesheetSync(
    new URL('../src/products/chat/renderer/styles/chat.css', import.meta.url),
  );

  const addRowRule = stylesheet.match(/\.composerGroupAddRow\s*\{[^}]+\}/u)?.[0] ?? '';
  const addHintRule = stylesheet.match(/\.parallelAddHint\s*\{[^}]+\}/u)?.[0] ?? '';
  const addButtonRule = stylesheet.match(/\.parallelAddButton\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(addRowRule, /justify-content:\s*flex-end;/u);
  assert.match(addRowRule, /padding-bottom:\s*4px;/u);
  assert.match(addHintRule, /font-size:\s*0\.78rem;/u);
  assert.match(addButtonRule, /border:\s*1px dashed/u);
  assert.match(addButtonRule, /border-radius:\s*50%;/u);
});
