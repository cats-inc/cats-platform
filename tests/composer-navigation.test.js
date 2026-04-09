import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureManagedComposerLocation,
  clearManagedComposerLocation,
  navigateWithinManagedComposerFlow,
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

test('managed composer navigation helper only navigates while the current route stays managed', () => {
  const managedLocationRef = { current: '/chat/chats/channel-1' };
  const calls = [];
  const originalLocation = globalThis.location;

  try {
    globalThis.location = {
      pathname: '/chat/chats/channel-1',
      search: '',
    };
    assert.equal(
      navigateWithinManagedComposerFlow(
        managedLocationRef,
        (path, options) => {
          calls.push({ path, options });
        },
        '/chat/chats/channel-2',
      ),
      true,
    );
    assert.deepEqual(calls, [
      { path: '/chat/chats/channel-2', options: { replace: true } },
    ]);
    assert.equal(managedLocationRef.current, '/chat/chats/channel-2');

    globalThis.location = {
      pathname: '/chat/new',
      search: '',
    };
    assert.equal(
      navigateWithinManagedComposerFlow(
        managedLocationRef,
        (path, options) => {
          calls.push({ path, options });
        },
        '/chat/chats/channel-3',
      ),
      false,
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.location = originalLocation;
  }
});

test('managed composer navigation helpers capture and clear the current route', () => {
  const managedLocationRef = { current: null };
  const originalLocation = globalThis.location;

  try {
    globalThis.location = {
      pathname: '/chat/new',
      search: '?mode=group',
    };
    captureManagedComposerLocation(managedLocationRef);
    assert.equal(managedLocationRef.current, '/chat/new?mode=group');
    clearManagedComposerLocation(managedLocationRef);
    assert.equal(managedLocationRef.current, null);
  } finally {
    globalThis.location = originalLocation;
  }
});
