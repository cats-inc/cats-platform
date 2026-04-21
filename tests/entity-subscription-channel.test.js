import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChannelSubscriptionPatches,
} from '../build/server/platform/orchestration/entitySubscriptions/channel.js';
import {
  serializeEntitySubscriptionSseEvent,
} from '../build/server/platform/orchestration/entitySubscriptions/index.js';

function createChannelState(overrides = {}) {
  const selectedChannel = {
    id: 'channel-1',
    messages: [],
    roomRouting: {
      workflow: {
        activeTurn: null,
      },
    },
    ...overrides.selectedChannel,
  };

  return {
    ...overrides,
    selectedChannelId: overrides.selectedChannelId ?? selectedChannel.id,
    selectedChannel,
    parallelChatGroups: overrides.parallelChatGroups ?? [],
  };
}

test('serializes entity subscription snapshot as an SSE frame', () => {
  const frame = serializeEntitySubscriptionSseEvent({
    event: 'snapshot',
    data: {
      kind: 'channel',
      id: 'channel-1',
      version: 1,
      state: { selectedChannelId: 'channel-1' },
    },
  });

  assert.equal(
    frame,
    'event: snapshot\ndata: {"kind":"channel","id":"channel-1","version":1,"state":{"selectedChannelId":"channel-1"}}\n\n',
  );
});

test('diffs appended channel messages into message.appended patches', () => {
  const previous = createChannelState();
  const next = createChannelState({
    selectedChannel: {
      id: 'channel-1',
      messages: [
        {
          id: 'message-1',
          channelId: 'channel-1',
          senderKind: 'assistant',
          senderName: 'Assistant',
          body: 'Done',
          mentions: [],
          metadata: {},
          usage: null,
          createdAt: '2026-04-21T00:00:00.000Z',
        },
      ],
    },
  });

  const patches = buildChannelSubscriptionPatches(previous, next);

  assert.equal(patches.length, 1);
  assert.equal(patches[0].kind, 'message.appended');
  assert.equal(patches[0].messageId, 'message-1');
  assert.equal(patches[0].state, next);
});

test('diffs subscribed compare group membership changes into membership patches', () => {
  const previous = createChannelState();
  const next = createChannelState({
    parallelChatGroups: [
      {
        id: 'group-1',
        title: 'Compare',
        mode: 'parallel',
        status: 'active',
        memberCount: 2,
        memberChannelIds: ['channel-1', 'channel-2'],
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
        lastMessageAt: null,
        members: [],
      },
    ],
  });

  const patches = buildChannelSubscriptionPatches(previous, next);

  assert.equal(patches.length, 1);
  assert.equal(patches[0].kind, 'compareGroupMembership.updated');
  assert.equal(patches[0].state, next);
});
