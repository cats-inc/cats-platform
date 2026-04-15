import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import {
  appendMessage,
  assignCatToChannel,
  createCat,
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  buildChatConversationId,
  buildDirectLaneTransportBindingId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: baseConfig.runtimeBaseUrl,
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderDiagnostics() {
      return {
        probe: 'light',
        providers: [],
      };
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async closeSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-read-repair-'));
  const runtimeDataDir = path.join(tempStateDir, 'runtime-data');
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir,
      },
      runtimeClient,
      now: () => new Date('2026-04-15T00:00:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`, { runtimeDataDir });
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('GET /api/app-shell repairs direct-lane session_started metadata with canonical transport binding', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-15T12:00:00.000Z');

  await withServer(runtimeClient, async (baseUrl, paths) => {
    let state = await chatStore.read();
    state = createCat(
      state,
      {
        name: 'Companion',
        provider: 'claude',
      },
      seededAt,
    );
    const catId = state.cats[0].id;
    state = createChannel(
      state,
      {
        title: 'Repair direct-lane session metadata',
        topic: 'Restore missing direct-lane session_started metadata in app-shell payloads.',
        roomMode: 'direct_cat_chat',
        defaultRecipientId: catId,
        repoPath: 'C:/repo/cats-platform',
        skipBossCatGreeting: true,
      },
      seededAt,
    );
    const channelId = state.selectedChannelId;
    state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, seededAt);
    const participantId = requireChannel(state, channelId).catAssignments[0].participantId;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'user',
        senderName: 'User',
        body: 'Handle this direct-lane repair.',
      },
      new Date('2026-04-15T12:00:01.000Z'),
    ).state;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'agent',
        senderName: 'Companion',
        body: 'Recovered direct-lane answer.',
      },
      new Date('2026-04-15T12:00:02.000Z'),
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-direct-repair',
          terminal: true,
          targetKind: 'cat',
          targetId: participantId,
          sessionId: 'session-direct-repair',
        },
        incrementUnread: false,
      },
    ).state;
    await mkdir(
      path.join(paths.runtimeDataDir, 'sessions', 'session-direct-repair'),
      { recursive: true },
    );
    await chatStore.write(state);

    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const selectedChannel = payload.chat.selectedChannel;
    assert.equal(selectedChannel.id, channelId);

    const sessionStartedIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'session_started'
      && message.metadata?.sessionId === 'session-direct-repair',
    );
    const assistantReplyIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'assistant_turn_segment'
      && message.metadata?.sessionId === 'session-direct-repair',
    );
    assert.equal(sessionStartedIndex >= 0, true);
    assert.equal(assistantReplyIndex >= 0, true);
    assert.equal(sessionStartedIndex < assistantReplyIndex, true);

    const sessionStarted = selectedChannel.messages[sessionStartedIndex];
    assert.equal(sessionStarted.metadata?.conversationId, buildChatConversationId(channelId));
    assert.equal(sessionStarted.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
    assert.equal(sessionStarted.metadata?.targetId, participantId);
    assert.equal(
      sessionStarted.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );
    assert.equal(
      selectedChannel.chatCwd,
      path.join(paths.runtimeDataDir, 'sessions', 'session-direct-repair'),
    );
  }, chatStore);
});
