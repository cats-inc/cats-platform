import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeleteCatConfirmation,
  buildDeleteParallelChatGroupConfirmation,
} from '../src/products/shared/renderer/deleteConfirmations.ts';

test('delete confirmation helpers fall back to generic entity labels', () => {
  assert.match(
    buildDeleteParallelChatGroupConfirmation(null).message,
    /"this parallel chat".*cleans up linked runtime sessions/u,
  );
  assert.match(
    buildDeleteCatConfirmation(undefined).message,
    /"this cat".*cleans up linked runtime sessions/u,
  );
});
