import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AppShellPayload,
  ChatChannelView,
} from '../src/products/chat/api/contracts.ts';
import {
  applyPendingExecutionTargetPreview,
  buildAttachedFilesMessageBody,
  buildNewChatChannelInput,
  insertCreatedChannelIntoPayload,
} from '../src/products/chat/renderer/chatUtils.tsx';
import { resolveDraftParticipantSelection } from '../src/products/chat/renderer/draftParticipants.ts';
import { createDefaultRoomRoutingState } from '../src/core/roomRoutingState.ts';
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
      status: 'ok',
      service: 'cats-runtime',
    },
    metadata: {
      generatedAt: '2026-03-26T00:00:00.000Z',
      requestId: 'test-request',
      version: 'test',
    },
    chat: {
      id: 'chat',
      name: 'Cats Chat',
      channels: [],
      selectedChannelId: null,
      selectedChannel: null,
      concurrentGroups: [],
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
        memory: { summary: null, updatedAt: null },
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
        maxParallelChats: 5,
        availableSurfaces: ['chat'],
      },
      cats: [],
      botBindings: [],
      bossCatId: null,
      showVerboseMessages: false,
    },
  } as unknown as AppShellPayload;
}

function createChannelView(overrides: Partial<ChatChannelView> = {}): ChatChannelView {
  const createdAt = '2026-03-27T10:00:00.000Z';
  return {
    id: '3f2ad424-7a53-4e1f-9d74-9a6d6328a301',
    title: 'Real room',
    topic: 'Created by server',
    channelKind: 'boss_thread',
    status: 'planned',
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: null,
    mcpProfile: null,
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
    roomRouting: createDefaultRoomRoutingState(),
    workingMemory: undefined,
    ...overrides,
  } as ChatChannelView;
}

test('buildNewChatChannelInput keeps lead-cat new chats as visible threads', () => {
  const input = buildNewChatChannelInput({
    body: 'Ship the landing page',
    existingCount: 2,
    entryKind: 'group',
    leadCatId: 'cat-lead',
    participantCatIds: ['cat-lead', 'cat-helper'],
    repoPath: 'C:/work/demo',
  });

  assert.equal(input.entryKind, 'group');
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
    entryKind: 'solo',
    draftModel: {
      provider: 'claude',
      model: 'claude-opus-4-6',
      instance: 'native',
      modelSelection: null,
    },
  });

  assert.equal(input.entryKind, 'solo');
  assert.equal(input.roomMode, undefined);
  assert.equal(input.composerMode, 'solo');
  assert.equal(input.pendingProvider, 'claude');
  assert.equal(input.pendingModel, 'claude-opus-4-6');
  assert.equal(input.pendingInstance, 'native');
});

test('buildNewChatChannelInput marks direct drafts explicitly and preserves direct room mode', () => {
  const input = buildNewChatChannelInput({
    body: 'Wake up and check Telegram',
    existingCount: 2,
    entryKind: 'direct',
    leadCatId: 'cat-lead',
    participantCatIds: ['cat-lead'],
  });

  assert.equal(input.entryKind, 'direct');
  assert.equal(input.roomMode, 'direct_cat_chat');
  assert.equal(input.leadParticipantId, 'cat-lead');
  assert.deepEqual(input.participantCatIds, ['cat-lead']);
});

test('resolveDraftParticipantSelection dedupes toggled cats and keeps route lead first', () => {
  const selection = resolveDraftParticipantSelection({
    draftLeadCatId: 'cat-lead',
    draftCatIds: ['cat-helper', 'cat-lead', 'cat-helper', '   '],
  });

  assert.equal(selection.routeLeadCatId, 'cat-lead');
  assert.deepEqual(selection.toggleCatIds, ['cat-helper', 'cat-lead']);
  assert.deepEqual(selection.participantCatIds, ['cat-lead', 'cat-helper']);
  assert.equal(selection.effectiveLeadCatId, 'cat-lead');
  assert.equal(selection.hasRouteLeadCat, true);
  assert.equal(selection.hasParticipants, true);
});

test('resolveDraftParticipantSelection falls back to the first selected cat when no route lead exists', () => {
  const selection = resolveDraftParticipantSelection({
    draftLeadCatId: null,
    draftCatIds: ['cat-helper', 'cat-reviewer'],
  });

  assert.equal(selection.routeLeadCatId, null);
  assert.deepEqual(selection.toggleCatIds, ['cat-helper', 'cat-reviewer']);
  assert.deepEqual(selection.participantCatIds, ['cat-helper', 'cat-reviewer']);
  assert.equal(selection.effectiveLeadCatId, 'cat-helper');
  assert.equal(selection.hasRouteLeadCat, false);
  assert.equal(selection.hasParticipants, true);
});

test('buildAttachedFilesMessageBody keeps attachment refs with the user prompt', () => {
  assert.equal(
    buildAttachedFilesMessageBody('Describe this screenshot', [
      { relativePath: '.cats-attachments/capture.png' },
      { relativePath: '.cats-attachments/notes.txt' },
    ]),
    [
      '[Attached files in working directory:]',
      '- .cats-attachments/capture.png',
      '- .cats-attachments/notes.txt',
      '',
      'Describe this screenshot',
    ].join('\n'),
  );
});

test('isOptimisticDraftChannelId only matches optimistic draft routes', () => {
  assert.equal(isOptimisticDraftChannelId('draft-123'), true);
  assert.equal(isOptimisticDraftChannelId('7a6a9554-dc18-4a3d-8a5d-a54bdb2e31f4'), false);
  assert.equal(isOptimisticDraftChannelId(null), false);
});

test('applyPendingExecutionTargetPreview updates the local solo target before dispatch returns', () => {
  const channel = createChannelView();
  const payload = insertCreatedChannelIntoPayload(createPayload(), channel);

  const next = applyPendingExecutionTargetPreview(
    payload,
    channel.id,
    {
      pendingProvider: 'gemini',
      pendingModel: 'gemini-3.1-pro',
      pendingInstance: 'cli/native',
      pendingModelSelection: null,
    },
  );

  assert.equal(next.chat.selectedChannel?.pendingProvider, 'gemini');
  assert.equal(next.chat.selectedChannel?.pendingModel, 'gemini-3.1-pro');
  assert.equal(next.chat.selectedChannel?.pendingInstance, 'cli/native');
  assert.equal(next.chat.channels[0]?.pendingProvider, 'gemini');
  assert.equal(next.chat.channels[0]?.pendingModel, 'gemini-3.1-pro');
});

test('insertCreatedChannelIntoPayload promotes a real created channel without a draft route', () => {
  const payload = createPayload();
  const channel = createChannelView();

  const next = insertCreatedChannelIntoPayload(payload, channel);

  assert.equal(next.chat.selectedChannelId, channel.id);
  assert.equal(next.chat.selectedChannel?.id, channel.id);
  assert.equal(next.chat.channels[0]?.id, channel.id);
  assert.equal(next.chat.channels[0]?.roomMode, 'boss_chat');
  assert.equal(next.chat.selectedChannel?.roomRouting.mode, 'boss_chat');
});
