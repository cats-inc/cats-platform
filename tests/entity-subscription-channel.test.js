import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
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
import { createChatEventHub } from '../build/server/products/chat/api/chatEventHub.js';
import { routeEntitySubscriptionApi } from '../build/server/app/server/subscribeRoutes.js';

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

test('channel subscription distinguishes temporary read failures from removed channels', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-channel-recovery-'));
  const store = new MemoryChatStore();
  const initial = createParallelChatGroup(await store.read(), {
    title: 'Recovery', originSurface: 'chat', targets: [
      { provider: 'codex', model: null, instance: null, modelSelection: null },
      { provider: 'claude', model: null, instance: null, modelSelection: null },
    ],
  });
  await store.write(initial);
  const id = initial.selectedChannelId;
  const read = store.read.bind(store);
  let failRead = true;
  store.read = async () => {
    if (failRead) throw new Error('Temporary read failure');
    return read();
  };
  const eventHub = createChatEventHub();
  const dependencies = {
    config: loadConfig({ CATS_PLATFORM_DIR: root, CATS_RUNTIME_DIR: path.join(root, 'runtime'), CATS_DESKTOP_DIR: path.join(root, 'desktop') }),
    chatStore: store, coreStore: store, eventHub, runtimeClient: createRuntimeStub(),
  };
  const server = createServer((request, response) => {
    void routeEntitySubscriptionApi({ request, response, url: new URL(request.url, 'http://localhost'),
      method: request.method, dependencies }).catch((error) => response.destroy(error));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/subscribe?kind=channel&id=${id}`;
  const get = () => fetch(url, { signal: AbortSignal.timeout(5_000) });
  assert.equal((await get()).status, 503);
  failRead = false;
  const until = async (reader, marker) => {
    let text = '';
    while (!text.includes(marker)) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Stream ended before ${marker}`);
      text += new TextDecoder().decode(chunk.value);
    }
    return text;
  };
  const first = await get();
  assert.equal(first.status, 200);
  const firstReader = first.body.getReader();
  await until(firstReader, 'event: snapshot');
  failRead = true;
  eventHub.emit({ kind: 'room_updated', channelId: id, timestamp: new Date().toISOString() });
  assert.match(await until(firstReader, 'event: close'), /"retryable":true/u);
  await firstReader.cancel();
  failRead = false;
  const recovered = await get();
  assert.equal(recovered.status, 200);
  const recoveredReader = recovered.body.getReader();
  await until(recoveredReader, 'event: snapshot');
  await store.write({ ...initial, channels: initial.channels.filter((channel) => channel.id !== id) });
  eventHub.emit({ kind: 'recents_changed', timestamp: new Date().toISOString() });
  assert.match(await until(recoveredReader, 'event: close'), /"retryable":false/u);
  await recoveredReader.cancel();
  assert.equal((await get()).status, 404);
});

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
      runtimeClient: new Proxy({}, {
        get(_target, method) {
          throw new Error(`Channel projection must not access Runtime: ${String(method)}`);
        },
      }),
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
