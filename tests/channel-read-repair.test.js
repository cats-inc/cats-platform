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
import { beginChannelMessageDispatch } from '../build/server/products/chat/state/runtimeActions.js';
import { repairOrphanedCompletedDispatchTurn } from '../build/server/products/chat/state/runtime-dispatch/repair.js';
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

test('GET /api/app-shell rebuilds a drifted direct-lane reply from canonical state with transport binding intact', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-15T12:10:00.000Z');
  const responseAt = new Date('2026-04-15T12:10:06.000Z');

  await withServer(runtimeClient, async (baseUrl) => {
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
        title: 'Repair drifted direct-lane canonical reply',
        topic: 'Restore a drifted direct-lane reply from canonical core during app-shell read repair.',
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

    const begun = await beginChannelMessageDispatch(
      state,
      channelId,
      { body: 'Please rebuild the missing direct-lane transcript.' },
      runtimeClient,
      seededAt,
    );
    const activeTurnId = requireChannel(begun.state, channelId).roomRouting.workflow.activeTurn?.id;
    assert.ok(activeTurnId);

    const repliedState = appendMessage(
      begun.state,
      channelId,
      {
        senderKind: 'agent',
        senderName: 'Companion',
        body: 'Recovered direct-lane canonical reply.',
      },
      responseAt,
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-direct-read-repair-chain',
          targetStateId: 'target-direct-read-repair-chain',
          terminal: true,
          conversationId: buildChatConversationId(channelId),
          containerId: CHAT_ROOT_CONTAINER_ID,
          turnId: activeTurnId,
          targetKind: 'cat',
          targetId: participantId,
          transportBindingId: buildDirectLaneTransportBindingId(channelId),
          sessionId: 'session-direct-read-repair-chain',
          routingTrigger: 'room_default',
          dispatchDepth: 0,
        },
      },
    ).state;

    const baselineRecovered = repairOrphanedCompletedDispatchTurn(
      repliedState,
      channelId,
      new Date('2026-04-15T12:10:30.000Z'),
    );
    assert.equal(baselineRecovered.repaired, true);
    await chatStore.write(baselineRecovered.state);

    const corruptedState = structuredClone(baselineRecovered.state);
    const corruptedChannel = requireChannel(corruptedState, channelId);
    corruptedChannel.messages = corruptedChannel.messages.filter((message) =>
      message.metadata?.assistantTurnId !== 'assistant-turn-direct-read-repair-chain'
      && !(message.metadata?.event === 'session_started'
        && message.metadata?.sessionId === 'session-direct-read-repair-chain'));
    const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
    assert.ok(interruptedTurn);
    interruptedTurn.status = 'blocked';
    interruptedTurn.stageId = 'startup_recovery';
    interruptedTurn.completedAt = responseAt.toISOString();
    interruptedTurn.updatedAt = responseAt.toISOString();
    interruptedTurn.targetStatuses = [];
    interruptedTurn.events = interruptedTurn.events.filter((event) =>
      event.kind === 'turn_started' || event.kind === 'checkpoint');
    interruptedTurn.events.push(
      {
        id: 'guard-blocked-direct-read-repair-chain',
        turnId: interruptedTurn.id,
        kind: 'guard_blocked',
        status: 'blocked',
        message: 'Recovered an interrupted direct-lane workflow after restart.',
        actor: null,
        sourceMessageId: null,
        targets: [],
        dispatchId: null,
        checkpointId: 'loop-guard-direct-read-repair-chain',
        outcomeId: null,
        createdAt: responseAt.toISOString(),
        metadata: {
          recoverySource: 'server_restart',
        },
      },
      {
        id: 'outcome-blocked-direct-read-repair-chain',
        turnId: interruptedTurn.id,
        kind: 'outcome',
        status: 'blocked',
        message: 'Direct-lane workflow moved to blocked recovery after startup interrupted the active turn.',
        actor: null,
        sourceMessageId: interruptedTurn.sourceMessageId,
        targets: [],
        dispatchId: null,
        checkpointId: null,
        outcomeId: null,
        createdAt: responseAt.toISOString(),
        metadata: {
          recoverySource: 'server_restart',
        },
      },
    );
    corruptedChannel.roomRouting.workflow.activeTurn = null;
    corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
    corruptedChannel.roomRouting.lastCheckpoint = {
      id: 'loop-guard-direct-read-repair-chain',
      kind: 'loop_guard',
      message: 'Recovered an interrupted direct-lane workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      createdAt: responseAt.toISOString(),
    };
    corruptedChannel.roomRouting.lastOutcome = {
      turnId: interruptedTurn.id,
      mode: corruptedChannel.roomRouting.mode,
      sourceMessageId: interruptedTurn.sourceMessageId,
      sourceSenderKind: interruptedTurn.sourceSenderKind,
      sourceSenderName: interruptedTurn.sourceSenderName,
      status: 'blocked',
      resolution: {
        routingMode: 'room_default',
        selectionKind: 'default_target',
        defaultTarget: {
          participantKind: 'cat',
          participantId,
          participantName: 'Companion',
        },
        defaultTargetReason: 'direct_chat_recipient',
        fallbackTarget: null,
        blockedReason: null,
        note: null,
      },
      resolvedTargets: [
        {
          participantKind: 'cat',
          participantId,
          participantName: 'Companion',
        },
      ],
      unresolvedMentions: [],
      dispatches: [],
      checkpoints: [],
      continuationCount: 0,
      totalDispatchCount: 0,
      guard: null,
      startedAt: seededAt.toISOString(),
      completedAt: responseAt.toISOString(),
    };
    await chatStore.write(corruptedState);

    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const selectedChannel = payload.chat.selectedChannel;
    assert.equal(selectedChannel.id, channelId);

    const sessionStartedIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'session_started'
      && message.metadata?.sessionId === 'session-direct-read-repair-chain',
    );
    const assistantReplyIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.assistantTurnId === 'assistant-turn-direct-read-repair-chain',
    );
    assert.equal(sessionStartedIndex >= 0, true);
    assert.equal(assistantReplyIndex >= 0, true);
    assert.equal(sessionStartedIndex < assistantReplyIndex, true);

    const assistantReply = selectedChannel.messages[assistantReplyIndex];
    assert.equal(assistantReply.body, 'Recovered direct-lane canonical reply.');
    assert.equal(assistantReply.metadata?.conversationId, buildChatConversationId(channelId));
    assert.equal(assistantReply.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
    assert.equal(
      assistantReply.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );

    const sessionStarted = selectedChannel.messages[sessionStartedIndex];
    assert.equal(
      sessionStarted.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );
    assert.equal(selectedChannel.roomRouting.workflow.activeTurn, null);
    assert.equal(selectedChannel.roomRouting.lastOutcome?.status, 'completed');
  }, chatStore);
});
