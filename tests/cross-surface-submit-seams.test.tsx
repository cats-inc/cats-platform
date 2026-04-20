import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearCrossSurfaceNavigationHandoff,
  consumeCrossSurfaceNavigationHandoff,
} from '../src/products/shared/renderer/crossSurfaceNavigationHandoff.ts';
import {
  resolveCrossSurfaceDraftDispatchState,
  stageCrossSurfaceDraftNavigationHandoff,
} from '../src/products/chat/renderer/hooks/useComposerSubmit.ts';

function createSnapshotPayload(selectedChannelId: string | null) {
  return {
    chat: {
      selectedChannelId,
    },
  } as const;
}

test('resolveCrossSurfaceDraftDispatchState keeps non-draft submits on chat and flags cross-surface drafts only when needed', () => {
  assert.deepEqual(
    resolveCrossSurfaceDraftDispatchState({
      showingNewChatDraft: false,
      draftSurface: 'code',
    }),
    {
      targetSurface: 'chat',
      isCrossSurfaceDraftDispatch: false,
    },
  );

  assert.deepEqual(
    resolveCrossSurfaceDraftDispatchState({
      showingNewChatDraft: true,
      draftSurface: 'chat',
    }),
    {
      targetSurface: 'chat',
      isCrossSurfaceDraftDispatch: false,
    },
  );

  assert.deepEqual(
    resolveCrossSurfaceDraftDispatchState({
      showingNewChatDraft: true,
      draftSurface: 'code',
    }),
    {
      targetSurface: 'code',
      isCrossSurfaceDraftDispatch: true,
    },
  );
});

test('stageCrossSurfaceDraftNavigationHandoff stages destination-owned channel handoffs with optimistic state', () => {
  clearCrossSurfaceNavigationHandoff();

  stageCrossSurfaceDraftNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    entityId: 'channel-cross-surface',
    entityKind: 'channel',
    snapshotPayload: createSnapshotPayload('channel-cross-surface') as never,
    pendingExecution: true,
  });

  const handoff = consumeCrossSurfaceNavigationHandoff({
    surface: 'code',
    path: '/code/chats/channel-cross-surface',
  });
  assert.ok(handoff);
  assert.equal(handoff.destination.entityKind, 'channel');
  assert.equal(handoff.destination.entityId, 'channel-cross-surface');
  assert.deepEqual(handoff.snapshot?.appShellPayload, createSnapshotPayload('channel-cross-surface'));
  assert.deepEqual(handoff.optimisticState, {
    pendingExecution: true,
    selectedChannelId: 'channel-cross-surface',
  });
});

test('stageCrossSurfaceDraftNavigationHandoff ignores chat-local and blank-id dispatches', () => {
  clearCrossSurfaceNavigationHandoff();

  stageCrossSurfaceDraftNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'chat',
    entityId: 'channel-chat-local',
    entityKind: 'channel',
    snapshotPayload: createSnapshotPayload('channel-chat-local') as never,
    pendingExecution: false,
  });
  stageCrossSurfaceDraftNavigationHandoff({
    kind: 'draft-create-parallel-group',
    sourceSurface: 'chat',
    targetSurface: 'code',
    entityId: '   ',
    entityKind: 'parallel-group',
    snapshotPayload: createSnapshotPayload('channel-ignored') as never,
    pendingExecution: false,
  });

  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'chat',
        path: '/chat/chats/channel-chat-local',
      }),
      null,
    );
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-ignored',
      }),
      null,
    );
  } finally {
    console.warn = originalWarn;
  }
});
