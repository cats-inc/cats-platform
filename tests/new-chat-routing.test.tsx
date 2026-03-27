import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import {
  buildNewChatChannelInput,
  createOptimisticDraftPayload,
  insertCreatedChannelIntoPayload,
  preserveOptimisticUserMessageAfterRefresh,
} from '../src/products/chat/renderer/chatUtils.tsx';
import { isOptimisticDraftChannelId } from '../src/products/chat/shared/channelPaths.ts';

function createPayload(): AppShellPayload {
  return {
    ownerDisplayName: 'Kenny',
    setupCompleteAt: '2026-03-26T00:00:00.000Z',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    runtime: {
      reachable: true,
      baseUrl: 'http://127.0.0.1:3110',
      healthy: true,
      providerCount: 0,
      issues: [],
      defaultProvider: null,
      discoveredProviders: [],
      lastCheckedAt: '2026-03-26T00:00:00.000Z',
    },
    metadata: {
      generatedAt: '2026-03-26T00:00:00.000Z',
      routePath: '/chat/new',
    },
    chat: {
      channels: [],
      selectedChannelId: null,
      selectedChannel: null,
      channelsOverview: [],
      channelsById: {},
      globalOrchestrator: {
        mode: 'global',
        status: 'ready',
        nextFocus: 'chat',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: { provider: 'claude', instance: 'native', model: 'claude-opus-4-6' },
        executionModelSelection: null,
        systemPrompt: '',
        skillProfile: null,
        mcpProfile: null,
        memory: { lastActiveAt: null, checkpointCount: 0, summary: null },
        telegramBotName: null,
        updatedAt: '2026-03-26T00:00:00.000Z',
      },
      newChatDefaults: {
        provider: 'claude',
        instance: 'native',
        model: 'claude-opus-4-6',
        modelSelection: null,
      },
      capabilities: {
        multiChannel: true,
        persistence: 'file-backed',
        mentions: 'basic',
        splitView: 'planned',
        transcriptExport: true,
        participantManagement: 'basic',
        runtimeSessions: true,
        maxBossCats: 1,
        maxCats: 16,
        availableSurfaces: ['chat'],
      },
      cats: [],
      botBindings: [],
      bossCatId: null,
      transportThreads: [],
      transportIndex: {
        telegram: {
          byThreadId: {},
          byBindingId: {},
        },
      },
    },
  } as unknown as AppShellPayload;
}

test('buildNewChatChannelInput keeps lead-cat new chats as visible threads', () => {
  const input = buildNewChatChannelInput({
    body: 'Ship the landing page',
    existingCount: 2,
    leadCatId: 'cat-lead',
    participantCatIds: ['cat-lead', 'cat-helper'],
    repoPath: 'C:/work/demo',
  });

  assert.equal(input.roomMode, undefined);
  assert.equal(input.leadParticipantId, 'cat-lead');
  assert.deepEqual(input.participantCatIds, ['cat-lead', 'cat-helper']);
  assert.equal(input.composerMode, undefined);
  assert.equal(input.skipBossCatGreeting, true);
});

test('buildNewChatChannelInput keeps solo new chats in solo mode with pending target', () => {
  const input = buildNewChatChannelInput({
    body: 'Ship the landing page',
    existingCount: 2,
    draftModel: {
      provider: 'claude',
      model: 'claude-opus-4-6',
      instance: 'native',
      modelSelection: null,
    },
  });

  assert.equal(input.roomMode, undefined);
  assert.equal(input.composerMode, 'solo');
  assert.equal(input.pendingProvider, 'claude');
  assert.equal(input.pendingModel, 'claude-opus-4-6');
  assert.equal(input.pendingInstance, 'native');
});

test('createOptimisticDraftPayload does not mark selected-cat new chats as direct lanes', () => {
  const optimistic = createOptimisticDraftPayload(
    createPayload(),
    'Build me a personal site',
    'cat-lead',
    { composerMode: 'cat_led' },
  );

  assert.equal(optimistic.payload.chat.channels[0]?.leadCatId, 'cat-lead');
  assert.notEqual(optimistic.payload.chat.channels[0]?.roomMode, 'direct_cat_chat');
  assert.equal(optimistic.payload.chat.selectedChannel?.roomRouting.mode, 'boss_chat');
});

test('isOptimisticDraftChannelId only matches optimistic draft routes', () => {
  assert.equal(isOptimisticDraftChannelId('draft-123'), true);
  assert.equal(isOptimisticDraftChannelId('7a6a9554-dc18-4a3d-8a5d-a54bdb2e31f4'), false);
  assert.equal(isOptimisticDraftChannelId(null), false);
});

test('preserveOptimisticUserMessageAfterRefresh keeps the first pending user turn after channel warmup', () => {
  const optimistic = createOptimisticDraftPayload(
    createPayload(),
    'Ship it',
    null,
    {
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: 'claude-opus-4-6',
      pendingInstance: 'native',
      pendingModelSelection: null,
    },
  );
  const refreshed = structuredClone(optimistic.payload);
  if (!refreshed.chat.selectedChannel) {
    throw new Error('Expected selected channel in refreshed payload.');
  }
  refreshed.chat.selectedChannel.messages = [];
  refreshed.chat.selectedChannel.lastMessageAt = null;
  if (refreshed.chat.channels[0]) {
    refreshed.chat.channels[0].lastMessageAt = null;
  }

  const preserved = preserveOptimisticUserMessageAfterRefresh(
    optimistic.payload,
    refreshed,
    optimistic.channelId,
  );

  assert.equal(preserved.chat.selectedChannel?.messages.length, 1);
  assert.equal(preserved.chat.selectedChannel?.messages[0]?.senderKind, 'user');
  assert.equal(preserved.chat.selectedChannel?.messages[0]?.body, 'Ship it');
  assert.equal(preserved.chat.channels[0]?.lastMessageAt, preserved.chat.selectedChannel?.messages[0]?.createdAt);
});

test('insertCreatedChannelIntoPayload promotes a real created channel without a draft route', () => {
  const payload = createPayload();
  const createdAt = '2026-03-27T10:00:00.000Z';
  const channel = {
    id: '3f2ad424-7a53-4e1f-9d74-9a6d6328a301',
    title: 'Real room',
    topic: 'Created by server',
    status: 'planned',
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: 'chat-default',
    mcpProfile: 'chat-memory',
    orchestratorRoles: [],
    composerMode: 'solo',
    pendingProvider: 'claude',
    pendingModel: 'claude-opus-4-6',
    pendingInstance: 'native',
    pendingModelSelection: null,
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: null,
    lastActivatedAt: null,
    orchestratorLease: {
      sessionId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: null,
      model: null,
      startedAt: null,
      lastUsedAt: null,
    },
    catAssignments: [],
    messages: [],
    assignedCats: [],
    roomRouting: {
      mode: 'boss_chat',
      trigger: 'user_message',
      blockedReason: null,
      workflow: {
        shape: 'single_turn',
        currentTurn: null,
        turnHistory: [],
        recentEvents: [],
        openApprovals: [],
        targets: [],
        checkpoints: [],
      },
    },
    workingMemory: undefined,
  } as const;

  const next = insertCreatedChannelIntoPayload(payload, channel);

  assert.equal(next.chat.selectedChannelId, channel.id);
  assert.equal(next.chat.selectedChannel?.id, channel.id);
  assert.equal(next.chat.channels[0]?.id, channel.id);
  assert.equal(next.chat.channels[0]?.roomMode, 'boss_chat');
});
