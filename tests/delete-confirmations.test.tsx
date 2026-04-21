import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeleteCatConfirmation,
  buildDeleteConversationConfirmation,
  buildDeleteParallelChatGroupConfirmation,
} from '../src/products/shared/renderer/deleteConfirmations.ts';

test('delete conversation confirmation names linked runtime cleanup without guaranteeing deletion', () => {
  assert.deepEqual(
    buildDeleteConversationConfirmation('Code review'),
    {
      title: 'Delete conversation',
      message: 'Delete "Code review"? This removes the conversation '
        + 'and cleans up linked runtime sessions. '
        + 'This cannot be undone.',
      confirmLabel: 'Delete',
    },
  );
});

test('delete confirmation helpers fall back to generic entity labels', () => {
  assert.match(
    buildDeleteConversationConfirmation('   ').message,
    /"this conversation".*cleans up linked runtime sessions/u,
  );
  assert.match(
    buildDeleteParallelChatGroupConfirmation(null).message,
    /"this parallel chat".*cleans up linked runtime sessions/u,
  );
  assert.match(
    buildDeleteCatConfirmation(undefined).message,
    /"this cat".*cleans up linked runtime sessions/u,
  );
});
