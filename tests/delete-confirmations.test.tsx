import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeleteCatConfirmation,
  buildDeleteConversationConfirmation,
  buildDeleteParallelChatGroupConfirmation,
} from '../src/products/shared/renderer/deleteConfirmations.ts';

test('delete conversation confirmation names linked runtime cleanup', () => {
  assert.deepEqual(
    buildDeleteConversationConfirmation('Code review'),
    {
      title: 'Delete conversation',
      message: 'Delete "Code review"? This removes the conversation and linked runtime sessions. '
        + 'This cannot be undone.',
      confirmLabel: 'Delete',
    },
  );
});

test('delete confirmation helpers fall back to generic entity labels', () => {
  assert.match(
    buildDeleteConversationConfirmation('   ').message,
    /"this conversation".*linked runtime sessions/u,
  );
  assert.match(
    buildDeleteParallelChatGroupConfirmation(null).message,
    /"this parallel chat".*linked runtime sessions/u,
  );
  assert.match(
    buildDeleteCatConfirmation(undefined).message,
    /"this cat".*linked runtime sessions/u,
  );
});
