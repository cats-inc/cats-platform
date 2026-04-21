import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearCrossSurfaceNavigationHandoff,
  consumeCrossSurfaceNavigationHandoff,
} from '../src/products/shared/renderer/crossSurfaceNavigationHandoff.ts';
import {
  stageCrossSurfaceConversationNavigationHandoff,
} from '../src/products/shared/renderer/crossSurfaceConversationNavigation.ts';

test('conversation navigation helper stages non-draft handoffs and skips same-surface selects', () => {
  clearCrossSurfaceNavigationHandoff();
  const snapshotPayload = {
    chat: {
      selectedChannelId: 'conversation-non-draft',
    },
  };

  const sameSurfaceRoute = stageCrossSurfaceConversationNavigationHandoff({
    sourceSurface: 'work',
    targetSurface: 'work',
    channelId: 'conversation-local',
  });
  assert.equal(sameSurfaceRoute, null);

  const route = stageCrossSurfaceConversationNavigationHandoff({
    sourceSurface: 'work',
    targetSurface: 'code',
    channelId: 'conversation-non-draft',
    snapshotPayload: snapshotPayload as never,
  });
  assert.deepEqual(route, {
    surface: 'code',
    path: '/code/chats/conversation-non-draft',
  });

  assert.ok(route);
  const consumed = consumeCrossSurfaceNavigationHandoff(route);
  assert.ok(consumed);
  assert.equal(consumed.kind, 'navigate-conversation');
  assert.equal(consumed.sourceSurface, 'work');
  assert.equal(consumed.targetSurface, 'code');
  assert.equal(consumed.destination.entityKind, 'conversation');
  assert.equal(consumed.destination.entityId, 'conversation-non-draft');
  assert.deepEqual(consumed.snapshot?.appShellPayload, snapshotPayload);
  assert.deepEqual(consumed.optimisticState, {
    pendingExecution: false,
    selectedChannelId: 'conversation-non-draft',
  });
});
