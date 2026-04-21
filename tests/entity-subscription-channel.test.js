import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildChannelSubscriptionState,
  buildChannelSubscriptionPatches,
} from '../build/server/platform/orchestration/entitySubscriptions/channel.js';
import {
  serializeEntitySubscriptionSseEvent,
} from '../build/server/platform/orchestration/entitySubscriptions/index.js';
import { loadConfig } from '../build/server/config.js';
import {
  createParallelChatGroup,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
  };
}

function createChannelState(overrides = {}) {
  const selectedChannel = {
    id: 'channel-1',
    messages: [],
    orchestratorLease: {
      sessionId: null,
      laneId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: null,
      model: null,
      startedAt: null,
      lastUsedAt: null,
    },
    assignedCats: [],
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

test('diffs channel session lifecycle into session patches', () => {
  const previous = createChannelState();
  const next = createChannelState({
    selectedChannel: {
      id: 'channel-1',
      messages: [],
      orchestratorLease: {
        sessionId: 'session-1',
        laneId: 'lane-1',
        status: 'ready',
        cwd: 'C:/repo',
        lastError: null,
        provider: 'openai',
        model: 'gpt-5',
        startedAt: '2026-04-21T00:00:00.000Z',
        lastUsedAt: '2026-04-21T00:00:00.000Z',
      },
    },
  });

  const patches = buildChannelSubscriptionPatches(previous, next);

  assert.equal(patches.length, 1);
  assert.equal(patches[0].kind, 'session.started');
  assert.equal(patches[0].session.sessionId, 'session-1');
  assert.equal(patches[0].session.participantId, 'orchestrator');
  assert.equal(patches[0].state, next);
});

test('buildChannelSubscriptionState projects mounted channel and its compare groups only', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-entity-subscription-'));
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-21T00:00:00.000Z');
  let state = await chatStore.read();
  state = createParallelChatGroup(
    state,
    {
      title: 'Compare pomodoro',
      originSurface: 'code',
      targets: [
        { provider: 'openai', instance: null, model: 'gpt-5', modelSelection: null },
        { provider: 'anthropic', instance: null, model: 'claude', modelSelection: null },
      ],
    },
    now,
  );
  await chatStore.write(state);
  const subscribedChannelId = state.parallelChatGroups[0].memberChannelIds[0];
  const config = loadConfig({
    CATS_PLATFORM_DIR: tempDir,
    CATS_RUNTIME_DIR: path.join(tempDir, 'runtime'),
    CATS_DESKTOP_DIR: path.join(tempDir, 'desktop'),
  });

  const snapshot = await buildChannelSubscriptionState(
    {
      config,
      runtimeClient: createRuntimeStub(),
      chatStore,
      mutationGate: {
        async run(_key, operation) {
          return operation();
        },
      },
      now: () => now,
    },
    subscribedChannelId,
  );

  assert.equal(snapshot.selectedChannelId, subscribedChannelId);
  assert.equal(snapshot.selectedChannel.id, subscribedChannelId);
  assert.equal(snapshot.parallelChatGroups.length, 1);
  assert.equal(snapshot.parallelChatGroups[0].memberChannelIds.includes(subscribedChannelId), true);
});
