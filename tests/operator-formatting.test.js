import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatOperatorTimestamp,
  operatorSeverityClassName,
  runStatusLabel,
} from '../dist-server/design/operatorFormatting.js';

function resolveRepoPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

test('shared operator formatting lives in design and preserves common labels', () => {
  assert.equal(formatOperatorTimestamp(null), 'No timestamp');
  assert.equal(operatorSeverityClassName('success'), 'isSuccess');
  assert.equal(runStatusLabel('completed'), 'Completed');
  assert.equal(existsSync(resolveRepoPath('../src/design/operatorFormatting.ts')), true);
});

test('operator formatting is no longer duplicated under chat, work, or code', () => {
  assert.equal(
    existsSync(resolveRepoPath('../src/products/chat/renderer/components/operatorFormatting.ts')),
    false,
  );
  assert.equal(
    existsSync(resolveRepoPath('../src/products/work/renderer/components/operatorFormatting.ts')),
    false,
  );
  assert.equal(
    existsSync(resolveRepoPath('../src/products/code/renderer/components/operatorFormatting.ts')),
    false,
  );
});
