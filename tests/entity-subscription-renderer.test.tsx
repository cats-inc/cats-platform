import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChannelSubscriptionStateToPayload,
  type ChannelSubscriptionState,
} from '../src/products/shared/renderer/entitySubscriptionChannelDispatcher.js';
import {
  shouldRefreshArtifactCanvasForPatch,
  shouldRefreshArtifactCanvasForSnapshot,
} from '../src/products/shared/renderer/entitySubscriptionArtifactDispatcher.js';
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
          members: [
            {
              channelId: 'channel-1',
              title: 'Channel 1 current',
              index: 0,
              provider: 'openai',
              instance: null,
              model: 'gpt-5',
              modelSelection: null,
              lastMessageAt: null,
            },
            {
              channelId: 'channel-2',
              title: 'Channel 2 fresh',
              index: 1,
              provider: 'anthropic',
              instance: null,
              model: 'claude',
              modelSelection: null,
              lastMessageAt: '2026-04-21T00:00:02.000Z',
            },
          ],
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

test('channel subscription state updates selectedChannel without replacing group metadata', () => {
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
        memberCount: 1,
        memberChannelIds: ['channel-1'],
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:01.000Z',
        lastMessageAt: '2026-04-21T00:00:01.000Z',
        members: [
          {
            channelId: 'channel-1',
            title: 'Channel 1 subscription',
            index: 0,
            provider: 'openai',
            instance: null,
            model: 'gpt-5',
            modelSelection: null,
            lastMessageAt: null,
          },
        ],
      },
    ],
  };

  const next = applyChannelSubscriptionStateToPayload(payload, subscriptionState);

  assert.equal(next.chat.selectedChannel?.title, 'Live channel');
  assert.equal(next.chat.selectedChannel?.messages.length, 1);
  assert.equal(next.chat.parallelChatGroups.length, 2);
  assert.equal(next.chat.parallelChatGroups[0].title, 'Old group');
  assert.deepEqual(next.chat.parallelChatGroups[0].memberChannelIds, ['channel-1', 'channel-2']);
  const freshSiblingMember = next.chat.parallelChatGroups[0].members.find((member) =>
    member.channelId === 'channel-2');
  assert.equal(
    freshSiblingMember?.title,
    'Channel 2 fresh',
  );
  assert.equal(next.chat.parallelChatGroups[1].title, 'Sibling group');
});

test('channel subscription state ignores stale selection snapshots', () => {
  const payload = createPayload();
  const subscriptionState: ChannelSubscriptionState = {
    selectedChannelId: 'channel-1',
    selectedChannel: {
      id: 'channel-1',
      title: 'Stale channel',
      messages: [],
    } as ChannelSubscriptionState['selectedChannel'],
    parallelChatGroups: [],
  };
  const currentPayload = {
    ...payload,
    chat: {
      ...payload.chat,
      selectedChannelId: 'channel-2',
      selectedChannel: {
        id: 'channel-2',
        title: 'Current channel',
        messages: [],
      },
    },
  };

  const next = applyChannelSubscriptionStateToPayload(currentPayload, subscriptionState);

  assert.equal(next, currentPayload);
  assert.equal(next.chat.selectedChannelId, 'channel-2');
  assert.equal(next.chat.selectedChannel?.title, 'Current channel');
});

test('channel subscription state removes stale compare membership for mounted channel', () => {
  const payload = createPayload();
  const subscriptionState: ChannelSubscriptionState = {
    selectedChannelId: 'channel-1',
    selectedChannel: {
      id: 'channel-1',
      title: 'Live channel',
      messages: [],
    } as ChannelSubscriptionState['selectedChannel'],
    parallelChatGroups: [],
  };

  const next = applyChannelSubscriptionStateToPayload(payload, subscriptionState);
  const mergedGroup = next.chat.parallelChatGroups[0];

  assert.deepEqual(mergedGroup?.memberChannelIds, ['channel-2']);
  assert.equal(mergedGroup?.memberCount, 1);
  assert.equal(mergedGroup?.title, 'Old group');
  assert.equal(
    mergedGroup?.members.find((member) => member.channelId === 'channel-2')?.title,
    'Channel 2 fresh',
  );
});

test('channel subscription state does not synthesize missing sidebar summaries', () => {
  const payload = {
    ...createPayload(),
    chat: {
      ...createPayload().chat,
      channels: [],
    },
  };
  const subscriptionState: ChannelSubscriptionState = {
    selectedChannelId: 'channel-1',
    selectedChannel: {
      id: 'channel-1',
      title: 'Live channel',
      messages: [],
    } as ChannelSubscriptionState['selectedChannel'],
    parallelChatGroups: [],
  };

  const next = applyChannelSubscriptionStateToPayload(payload, subscriptionState);

  assert.deepEqual(next.chat.channels, []);
});

test('channel subscription state keeps selected channel summary routing in sync', () => {
  const completedAt = '2026-04-21T00:00:03.000Z';
  const roomRouting = createDefaultRoomRoutingState({ defaultRecipientId: 'cat-1' });
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
          participantCount: 0,
          activeParticipantCount: 0,
          repoPath: null,
          chatCwd: null,
          lastMessageAt: '2026-04-21T00:00:01.000Z',
          lastActivatedAt: null,
          defaultRecipientCatId: null,
          defaultRecipientLeaseStatus: null,
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
      pendingProvider: 'claude',
      pendingModel: null,
      pendingModelSelection: null,
      roomRouting,
      assignedCats: [
        {
          catId: 'cat-1',
          status: 'active',
          execution: { lease: { status: 'ready' } },
        },
        {
          catId: 'cat-2',
          status: 'removed',
          execution: { lease: { status: 'removed' } },
        },
      ],
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
  assert.equal(channelSummary?.catCount, 2);
  assert.equal(channelSummary?.activeCatCount, 1);
  assert.equal(channelSummary?.participantCount, 2);
  assert.equal(channelSummary?.activeParticipantCount, 1);
  assert.equal(channelSummary?.defaultRecipientCatId, 'cat-1');
  assert.equal(channelSummary?.defaultRecipientLeaseStatus, 'ready');
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

test('entity subscription hub coalesces artifact subscribers independently', () => {
  const sources: FakeEventSource[] = [];
  const hub = new EntitySubscriptionHub((url) => {
    const source = new FakeEventSource(url);
    sources.push(source);
    return source as unknown as EventSource;
  });
  const unsubscribeA = hub.subscribe<{ value: number }, never>({
    kind: 'artifact',
    id: 'artifact-1',
    onSnapshot: () => {},
    onPatch: () => {},
  });
  const unsubscribeB = hub.subscribe<{ value: number }, never>({
    kind: 'artifact',
    id: 'artifact-1',
    onSnapshot: () => {},
    onPatch: () => {},
  });

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.url, '/api/subscribe?kind=artifact&id=artifact-1');
  assert.deepEqual(hub.getActiveSubscribedIds('artifact'), ['artifact-1']);
  assert.deepEqual(hub.getActiveSubscribedIds('channel'), []);

  unsubscribeA();
  unsubscribeB();
  assert.equal(sources[0]?.closed, true);
});

test('artifact subscription dispatcher refreshes only the matching Artifact Canvas entity', () => {
  const snapshot = {
    kind: 'artifact',
    id: 'artifact-1',
    version: 1,
    state: {
      artifact: {
        id: 'artifact-1',
        title: 'Artifact',
        kind: 'document',
        status: 'ready',
        projectId: null,
        workItemId: null,
        conversationId: null,
        taskId: null,
        runId: null,
        path: null,
        mimeType: null,
        sizeBytes: null,
        summary: null,
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:00.000Z',
        metadata: {},
      },
    },
  } as const;
  const patch = {
    kind: 'artifact',
    id: 'artifact-1',
    version: 1,
    patch: {
      kind: 'artifact.updated',
      artifactId: 'artifact-1',
      artifact: snapshot.state.artifact,
      state: snapshot.state,
    },
  } as const;

  assert.equal(shouldRefreshArtifactCanvasForSnapshot('artifact-1', snapshot), true);
  assert.equal(shouldRefreshArtifactCanvasForSnapshot('artifact-2', snapshot), false);
  assert.equal(shouldRefreshArtifactCanvasForPatch('artifact-1', patch), true);
  assert.equal(shouldRefreshArtifactCanvasForPatch('artifact-2', patch), false);
});
