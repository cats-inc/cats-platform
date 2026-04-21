import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChannelSubscriptionStateToPayload,
  type ChannelSubscriptionState,
} from '../src/products/shared/renderer/entitySubscriptionChannelDispatcher.js';
import {
  EntitySubscriptionHub,
  type EntitySubscriptionSnapshot,
} from '../src/products/shared/renderer/entitySubscriptionHub.js';
import { createDefaultRoomRoutingState } from '../src/core/roomRoutingState.js';

class FakeEventSource {
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(event: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  emit(event: string, data: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  close(): void {
    this.closed = true;
  }
}

function createPayload() {
  return {
    metadata: { generatedAt: '2026-04-21T00:00:00.000Z' },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Old channel',
        messages: [],
      },
      parallelChatGroups: [
        {
          id: 'group-1',
          title: 'Old group',
          mode: 'parallel',
          status: 'active',
          memberCount: 2,
          memberChannelIds: ['channel-1', 'channel-2'],
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z',
          lastMessageAt: null,
          members: [],
        },
        {
          id: 'group-2',
          title: 'Sibling group',
          mode: 'parallel',
          status: 'active',
          memberCount: 2,
          memberChannelIds: ['channel-3', 'channel-4'],
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z',
          lastMessageAt: null,
          members: [],
        },
      ],
    },
  };
}

test('channel subscription state replaces selectedChannel and only subscribed compare groups', () => {
  const payload = createPayload();
  const subscriptionState: ChannelSubscriptionState = {
    selectedChannelId: 'channel-1',
    selectedChannel: {
      id: 'channel-1',
      title: 'Live channel',
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
          createdAt: '2026-04-21T00:00:01.000Z',
        },
      ],
    } as ChannelSubscriptionState['selectedChannel'],
    parallelChatGroups: [
      {
        id: 'group-1',
        title: 'Live group',
        mode: 'parallel',
        status: 'active',
        memberCount: 2,
        memberChannelIds: ['channel-1', 'channel-2'],
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:01.000Z',
        lastMessageAt: '2026-04-21T00:00:01.000Z',
        members: [],
      },
    ],
  };

  const next = applyChannelSubscriptionStateToPayload(payload, subscriptionState);

  assert.equal(next.chat.selectedChannel?.title, 'Live channel');
  assert.equal(next.chat.selectedChannel?.messages.length, 1);
  assert.equal(next.chat.parallelChatGroups.length, 2);
  assert.equal(next.chat.parallelChatGroups[0].title, 'Live group');
  assert.equal(next.chat.parallelChatGroups[1].title, 'Sibling group');
});

test('channel subscription state keeps selected channel summary routing in sync', () => {
  const completedAt = '2026-04-21T00:00:03.000Z';
  const roomRouting = createDefaultRoomRoutingState();
  roomRouting.workflow.lastOutcomeEvent = {
    id: 'event-1',
    turnId: 'turn-1',
    kind: 'outcome',
    status: 'completed',
    message: 'Completed.',
    actor: null,
    sourceMessageId: 'message-1',
    targets: [],
    dispatchId: null,
    checkpointId: null,
    outcomeId: 'outcome-1',
    createdAt: completedAt,
    metadata: {},
  };

  const payload = {
    metadata: { generatedAt: '2026-04-21T00:00:00.000Z' },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: null,
      channels: [
        {
          id: 'channel-1',
          title: 'Old channel',
          topic: '',
          originSurface: 'code',
          status: 'active',
          unreadCount: 0,
          catCount: 0,
          activeCatCount: 0,
          repoPath: null,
          chatCwd: null,
          lastMessageAt: '2026-04-21T00:00:01.000Z',
          lastActivatedAt: null,
          routingStatus: 'running',
          lastRoutingAt: '2026-04-21T00:00:01.000Z',
        },
      ],
      parallelChatGroups: [],
    },
  };
  const subscriptionState: ChannelSubscriptionState = {
    selectedChannelId: 'channel-1',
    selectedChannel: {
      id: 'channel-1',
      title: 'Live channel',
      topic: 'Updated topic',
      originSurface: 'code',
      status: 'active',
      unreadCount: 0,
      repoPath: null,
      chatCwd: null,
      runtimeWorkspaceKind: null,
      runtimeWorkspaceAccess: null,
      runtimePermissionMode: null,
      lastMessageAt: '2026-04-21T00:00:03.000Z',
      lastActivatedAt: null,
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: null,
      pendingModelSelection: null,
      roomRouting,
      assignedCats: [],
      messages: [],
    } as ChannelSubscriptionState['selectedChannel'],
    parallelChatGroups: [],
  };

  const next = applyChannelSubscriptionStateToPayload(payload, subscriptionState);
  const channelSummary = next.chat.channels[0];

  assert.equal(channelSummary?.title, 'Live channel');
  assert.equal(channelSummary?.lastMessageAt, '2026-04-21T00:00:03.000Z');
  assert.equal(channelSummary?.routingStatus, 'completed');
  assert.equal(channelSummary?.lastRoutingAt, completedAt);
});

test('entity subscription hub coalesces same entity subscribers', () => {
  const sources: FakeEventSource[] = [];
  const hub = new EntitySubscriptionHub((url) => {
    const source = new FakeEventSource(url);
    sources.push(source);
    return source as unknown as EventSource;
  });
  const snapshots: Array<EntitySubscriptionSnapshot<{ value: number }>> = [];
  const unsubscribeA = hub.subscribe<{ value: number }, never>({
    kind: 'channel',
    id: 'channel-1',
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onPatch: () => {},
  });
  const unsubscribeB = hub.subscribe<{ value: number }, never>({
    kind: 'channel',
    id: 'channel-1',
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onPatch: () => {},
  });

  assert.equal(sources.length, 1);
  assert.deepEqual(hub.getActiveSubscribedIds('channel'), ['channel-1']);

  sources[0]?.emit('snapshot', {
    kind: 'channel',
    id: 'channel-1',
    version: 1,
    state: { value: 1 },
  });

  assert.equal(snapshots.length, 2);
  unsubscribeA();
  assert.deepEqual(hub.getActiveSubscribedIds('channel'), ['channel-1']);
  unsubscribeB();
  assert.deepEqual(hub.getActiveSubscribedIds('channel'), []);
  assert.equal(sources[0]?.closed, true);
});
