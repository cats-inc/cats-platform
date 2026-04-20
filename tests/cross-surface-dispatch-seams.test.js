import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrossSurfaceNavigationMatchPath,
  clearCrossSurfaceNavigationHandoff,
  consumeCrossSurfaceNavigationSnapshot,
  stageCrossSurfaceNavigationHandoff,
} from '../src/products/shared/renderer/crossSurfaceNavigationHandoff.ts';
import { resolveCrossSurfaceParallelGroupHandoffId } from '../src/products/chat/renderer/crossSurfaceDispatchUtils.ts';

test('parallel draft handoff resolves the created group from the active channel instead of falling back to an arbitrary first group', () => {
  assert.equal(
    resolveCrossSurfaceParallelGroupHandoffId({
      dispatchRequest: null,
      createdGroups: [
        { id: 'existing-group', memberChannelIds: ['channel-old-a', 'channel-old-b'] },
        { id: 'created-group', memberChannelIds: ['channel-new-a', 'channel-new-b'] },
      ],
      dispatchGroups: [
        { id: 'existing-group', memberChannelIds: ['channel-old-a', 'channel-old-b'] },
        { id: 'created-group', memberChannelIds: ['channel-new-a', 'channel-new-b'] },
      ],
      fallbackChannelId: 'channel-new-a',
    }),
    'created-group',
  );
  assert.equal(
    resolveCrossSurfaceParallelGroupHandoffId({
      dispatchRequest: null,
      createdGroups: [
        { id: 'existing-group', memberChannelIds: ['channel-old-a', 'channel-old-b'] },
      ],
      dispatchGroups: [
        { id: 'existing-group', memberChannelIds: ['channel-old-a', 'channel-old-b'] },
      ],
      fallbackChannelId: 'channel-new-a',
    }),
    '',
  );
});

test('initial warm navigation payload is consumed once per mounted route', () => {
  clearCrossSurfaceNavigationHandoff();
  const match = {
    surface: 'code',
    path: buildCrossSurfaceNavigationMatchPath('/code/chats/channel-42'),
  };
  const snapshotPayload = {
    chat: {
      selectedChannelId: 'channel-42',
      channels: [],
      cats: [],
    },
  };

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-42',
      route: match,
    },
    createdAt: '2026-04-20T11:00:00.000Z',
    snapshot: {
      appShellPayload: snapshotPayload,
    },
  });

  assert.deepEqual(
    consumeCrossSurfaceNavigationSnapshot(match),
    snapshotPayload,
  );
  assert.equal(
    consumeCrossSurfaceNavigationSnapshot(match),
    null,
  );
});
