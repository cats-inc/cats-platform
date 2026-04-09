import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldAutoNavigateComposerLocation,
} from '../src/products/shared/renderer/composerNavigation.ts';

test('composer auto-navigation only continues while the user stays on the managed route', () => {
  assert.equal(
    shouldAutoNavigateComposerLocation('/chat/chats/channel-1', '/chat/chats/channel-1'),
    true,
  );
  assert.equal(
    shouldAutoNavigateComposerLocation('/chat/new?mode=group', '/chat/new?mode=group'),
    true,
  );
  assert.equal(
    shouldAutoNavigateComposerLocation('/chat/chats/channel-1', '/chat/new'),
    false,
  );
  assert.equal(
    shouldAutoNavigateComposerLocation('/chat/new?mode=parallel', '/chat/chats/channel-2'),
    false,
  );
});
