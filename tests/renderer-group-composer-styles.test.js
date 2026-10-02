import assert from 'node:assert/strict';
import test from 'node:test';

import { readStylesheetSync } from './helpers/readStylesheet.js';

test('chat group draft composer keeps the dedicated add-participant row styling', () => {
  const stylesheet = readStylesheetSync(
    new URL('../src/products/shared/renderer/styles/chat-composer-base.css', import.meta.url),
  );

  const addRowRule = stylesheet.match(/\.composerGroupAddRow\s*\{[^}]+\}/u)?.[0] ?? '';
  const addHintRule = stylesheet.match(/\.parallelAddHint\s*\{[^}]+\}/u)?.[0] ?? '';
  const addButtonRule = stylesheet.match(/\.parallelAddButton\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(addRowRule, /justify-content:\s*flex-end;/u);
  // Vertical padding makes the group toolbar taller than +New / +Parallel.
  assert.doesNotMatch(addRowRule, /padding(-top|-bottom)?:/u);
  assert.match(addHintRule, /font-size:\s*0\.78rem;/u);
  assert.match(addButtonRule, /border:\s*1px dashed/u);
  assert.match(addButtonRule, /border-radius:\s*50%;/u);
});

test('chat drafts center the composer at half the viewport height, level with the floating guide cat', () => {
  const stylesheet = readStylesheetSync(
    new URL('../src/products/shared/renderer/styles/chat-thread-base.css', import.meta.url),
  );

  const draftShellRule = stylesheet.match(/\.draftShell\s*\{[^}]+\}/u)?.[0] ?? '';
  const draftShellLeadRule = stylesheet.match(/\.draftShellLead\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(draftShellRule, /align-content:\s*start;/u);
  assert.match(
    draftShellRule,
    /grid-template-rows:\s*minmax\(max\(24px,\s*calc\(50vh - 91px\)\),\s*auto\);/u,
  );
  assert.doesNotMatch(draftShellRule, /padding-top:/u);
  // Content above the composer grows upward from the end of the first row.
  assert.match(draftShellLeadRule, /align-self:\s*end;/u);
});
