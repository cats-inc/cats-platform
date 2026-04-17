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
  createDraftTemporaryParticipant,
  createInitialGroupParticipants,
  createNextGroupTemporaryParticipant,
  createDraftTemporaryParticipantFromAssistantPreset,
  draftHasAssistantPresetParticipant,
  insertCreatedChannelIntoPayload,
  reconcileDraftAudienceKeysAfterParticipantRemoval,
  resolveDraftAudienceParticipantIds,
  resolveGenericDraftTemporaryParticipants,
  syncLeadDraftTemporaryParticipantWithTarget,
} from '../src/products/chat/renderer/chatUtils.tsx';
import {
  resolveDraftParticipantSelection,
  resolveDraftRouteContext,
  resolveDraftRoutePath,
  resolveMissingDraftDefaultRecipientPath,
} from '../src/products/chat/renderer/draftParticipants.ts';
import { createDefaultRoomRoutingState } from '../src/core/roomRoutingState.ts';
import {
  NEW_CHAT_PATH,
  buildChannelPath,
  buildMyCatPath,
  buildNewChatPath,
  isOptimisticDraftChannelId,
} from '../src/products/chat/shared/channelPaths.ts';

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
      parallelChatGroups: [],
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
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
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

test('buildNewChatChannelInput keeps default-recipient new chats as visible threads', () => {
  const input = buildNewChatChannelInput({
    body: 'Ship the landing page',
    existingCount: 2,
    originSurface: 'chat',
    entryKind: 'group',
    defaultRecipientCatId: 'cat-lead',
    participantCatIds: ['cat-lead', 'cat-helper'],
    repoPath: 'C:/work/demo',
  });

  assert.equal(input.entryKind, 'group');
  assert.equal(input.roomMode, undefined);
  assert.equal(input.defaultRecipientId, 'cat-lead');
  assert.deepEqual(input.participantCatIds, ['cat-lead', 'cat-helper']);
  assert.equal(input.composerMode, undefined);
  assert.equal(input.skipBossCatGreeting, true);
});

test('buildNewChatChannelInput keeps solo new chats in solo mode with pending target', () => {
  const input = buildNewChatChannelInput({
    body: 'Ship the landing page',
    existingCount: 2,
    originSurface: 'code',
    entryKind: 'solo',
    draftSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
    draftExecutionTarget: {
      provider: 'claude',
      model: 'claude-opus-4-6',
      instance: 'native',
      modelSelection: null,
    },
  });

  assert.equal(input.entryKind, 'solo');
  assert.equal(input.originSurface, 'code');
  assert.equal(input.roomMode, undefined);
  assert.equal(input.composerMode, 'solo');
  assert.equal(input.runtimeWorkspaceKind, 'worktree');
  assert.equal(input.runtimeWorkspaceAccess, 'read_only');
  assert.equal(input.runtimePermissionMode, 'default');
  assert.equal(input.pendingProvider, 'claude');
  assert.equal(input.pendingModel, 'claude-opus-4-6');
  assert.equal(input.pendingInstance, 'native');
});

test('buildNewChatChannelInput defaults repo-backed drafts to source workspace access', () => {
  const input = buildNewChatChannelInput({
    body: 'Inspect the current repo checkout',
    existingCount: 0,
    originSurface: 'code',
    entryKind: 'solo',
    repoPath: 'C:/repo/cats-platform',
  });

  assert.equal(input.runtimeWorkspaceKind, 'source');
  assert.equal(input.runtimeWorkspaceAccess, 'read_write');
  assert.equal(input.runtimePermissionMode, 'skip');
});

test('buildNewChatChannelInput lets explicit workspace overrides win over repo defaults', () => {
  const input = buildNewChatChannelInput({
    body: 'Stay isolated even with a repo selected',
    existingCount: 0,
    originSurface: 'code',
    entryKind: 'solo',
    repoPath: 'C:/repo/cats-platform',
    draftSessionPolicy: {
      workspaceKind: 'sandbox',
      workspaceAccess: 'read_only',
      permissionMode: 'whitelist',
    },
  });

  assert.equal(input.runtimeWorkspaceKind, 'sandbox');
  assert.equal(input.runtimeWorkspaceAccess, 'read_only');
  // This currently locks the runtime-level coercion: read_only sessions collapse
  // to the default permission gate even if an upstream caller supplied whitelist.
  assert.equal(input.runtimePermissionMode, 'default');
});

test('buildNewChatChannelInput marks direct drafts explicitly and preserves direct room mode', () => {
  const input = buildNewChatChannelInput({
    body: 'Wake up and check Telegram',
    existingCount: 2,
    originSurface: 'chat',
    entryKind: 'direct',
    defaultRecipientCatId: 'cat-lead',
    participantCatIds: ['cat-lead'],
  });

  assert.equal(input.entryKind, 'direct');
  assert.equal(input.roomMode, 'direct_cat_chat');
  assert.equal(input.defaultRecipientId, 'cat-lead');
  assert.deepEqual(input.participantCatIds, ['cat-lead']);
});

test('buildNewChatChannelInput forwards channel-only temporary participants for group drafts', () => {
  const input = buildNewChatChannelInput({
    body: 'Run a quick three-way review',
    existingCount: 2,
    originSurface: 'chat',
    entryKind: 'group',
    temporaryParticipants: [
      {
        participantId: 'participant-inline',
        name: 'Inline Reviewer',
        provider: 'gemini',
        instance: 'native',
        model: 'gemini-3.1-pro',
        modelSelection: null,
        roleHint: 'Counterpoint',
      },
    ],
  });

  assert.equal(input.entryKind, 'group');
  assert.equal(input.temporaryParticipants?.length, 1);
  assert.equal(input.temporaryParticipants?.[0]?.participantId, 'participant-inline');
  assert.equal(input.temporaryParticipants?.[0]?.name, 'Inline Reviewer');
  assert.equal(input.temporaryParticipants?.[0]?.provider, 'gemini');
  assert.equal(input.temporaryParticipants?.[0]?.roleHint, 'Counterpoint');
});

test('assistant presets can be instantiated as draft temporary participants without becoming cats', () => {
  const participant = createDraftTemporaryParticipantFromAssistantPreset(
    {
      id: 'assistant-reviewer',
      name: 'Pair Reviewer',
      executionTarget: {
        provider: 'codex',
        instance: null,
        model: 'gpt-5.4',
      },
      modelSelection: null,
      roleHint: 'Checks draft routes before runtime dispatch.',
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
    {
      randomUUID: () => 'participant-from-assistant',
    },
  );

  assert.equal(participant.participantId, 'participant-from-assistant');
  assert.equal(participant.presetId, 'assistant-reviewer');
  assert.equal(participant.name, 'Pair Reviewer');
  assert.equal(participant.provider, 'codex');
  assert.equal(participant.model, 'gpt-5.4');
  assert.equal(
    draftHasAssistantPresetParticipant([participant], 'assistant-reviewer'),
    true,
  );
});

test('draft temporary participants auto-name from provider and avoid collisions', () => {
  const first = createDraftTemporaryParticipant({
    provider: 'claude',
    instance: 'native',
    takenNames: ['Milo'],
    randomUUID: () => 'participant-1',
  });
  const second = createDraftTemporaryParticipant({
    provider: 'claude',
    instance: 'native',
    takenNames: ['Milo', first.name],
    randomUUID: () => 'participant-2',
  });

  assert.equal(first.name, 'Claude-CLI');
  assert.equal(second.name, 'Claude-CLI 2');
  assert.equal(first.participantId, 'participant-1');
  assert.equal(second.participantId, 'participant-2');
});

test('group draft quick-add picks the next provider and keeps CLI naming aligned', () => {
  const first = createNextGroupTemporaryParticipant({
    baseProvider: 'claude',
    existingParticipants: [],
    randomUUID: () => 'participant-1',
  });
  const second = createNextGroupTemporaryParticipant({
    baseProvider: 'claude',
    existingParticipants: [first],
    randomUUID: () => 'participant-2',
  });
  const third = createNextGroupTemporaryParticipant({
    baseProvider: 'claude',
    existingParticipants: [first, second],
    randomUUID: () => 'participant-3',
  });

  assert.equal(first.provider, 'claude');
  assert.equal(first.name, 'Claude-CLI');
  assert.equal(second.provider, 'codex');
  assert.equal(second.name, 'Codex-CLI');
  assert.equal(third.provider, 'gemini');
  assert.equal(third.name, 'Gemini-CLI');
});

test('generic group draft route seeds default temporary participants when none exist yet', () => {
  const participants = resolveGenericDraftTemporaryParticipants(
    'group',
    [],
    () => createInitialGroupParticipants({
      provider: 'gemini',
      model: 'gemini-3.1-pro',
      instance: 'cli/native',
      modelSelection: null,
    }, 8),
  );

  assert.equal(participants.length, 2);
  assert.equal(participants[0]?.provider, 'gemini');
  assert.equal(participants[0]?.model, 'gemini-3.1-pro');
  assert.equal(participants[0]?.instance, 'cli/native');
  assert.notEqual(participants[1]?.provider, 'gemini');
});

test('initial group participants keep the default seed at two and still honor lower max caps', () => {
  const defaultSeed = createInitialGroupParticipants({
    provider: 'claude',
    model: 'claude-opus-4-6',
    instance: 'native',
    modelSelection: {
      mode: 'preset',
      presetId: 'deep_reasoning',
      controls: [],
    },
  }, 8);
  const limitedSeed = createInitialGroupParticipants({
    provider: 'claude',
    model: 'claude-opus-4-6',
    instance: 'native',
    modelSelection: null,
  }, 1);

  assert.equal(defaultSeed.length, 2);
  assert.equal(defaultSeed[0]?.provider, 'claude');
  assert.equal(defaultSeed[0]?.model, 'claude-opus-4-6');
  assert.equal(defaultSeed[0]?.instance, 'native');
  assert.deepEqual(defaultSeed[0]?.modelSelection, {
    mode: 'preset',
    presetId: 'deep_reasoning',
    controls: [],
  });
  assert.notEqual(defaultSeed[1]?.provider, 'claude');
  assert.equal(limitedSeed.length, 1);
  assert.equal(limitedSeed[0]?.provider, 'claude');
});

test('initial group participants keep the shared lead provider first even when it is not product-order first', () => {
  const seed = createInitialGroupParticipants({
    provider: 'gemini',
    model: 'gemini-3.1-pro',
    instance: 'cli/native',
    modelSelection: null,
  }, 2);

  assert.equal(seed[0]?.provider, 'gemini');
  assert.equal(seed[0]?.name, 'Gemini-CLI');
  assert.equal(seed[1]?.provider, 'claude');
});

test('syncLeadDraftTemporaryParticipantWithTarget keeps the group lead aligned with shared draft defaults', () => {
  const syncedParticipants = syncLeadDraftTemporaryParticipantWithTarget({
    participants: [
      {
        participantId: 'participant-1',
        name: 'Claude-CLI',
        provider: 'claude',
        instance: 'native',
        model: 'claude-opus-4-6',
        modelSelection: null,
      },
      {
        participantId: 'participant-2',
        name: 'Codex-CLI',
        provider: 'codex',
        instance: 'cli/native',
        model: 'gpt-5.4',
        modelSelection: null,
      },
    ],
    target: {
      provider: 'gemini',
      model: 'gemini-3.1-pro',
      instance: 'cli/native',
      modelSelection: {
        mode: 'preset',
        presetId: 'balanced',
        controls: [],
      },
    },
  });

  assert.equal(syncedParticipants[0]?.name, 'Gemini-CLI');
  assert.equal(syncedParticipants[0]?.provider, 'gemini');
  assert.equal(syncedParticipants[0]?.model, 'gemini-3.1-pro');
  assert.equal(syncedParticipants[0]?.instance, 'cli/native');
  assert.deepEqual(syncedParticipants[0]?.modelSelection, {
    mode: 'preset',
    presetId: 'balanced',
    controls: [],
  });
  assert.equal(syncedParticipants[1]?.provider, 'codex');
});

test('syncLeadDraftTemporaryParticipantWithTarget preserves explicit lead names', () => {
  const syncedParticipants = syncLeadDraftTemporaryParticipantWithTarget({
    participants: [
      {
        participantId: 'participant-1',
        name: 'Research Lead',
        provider: 'claude',
        instance: 'native',
        model: 'claude-opus-4-6',
        modelSelection: null,
      },
    ],
    target: {
      provider: 'gemini',
      model: 'gemini-3.1-pro',
      instance: 'cli/native',
      modelSelection: null,
    },
  });

  assert.equal(syncedParticipants[0]?.name, 'Research Lead');
  assert.equal(syncedParticipants[0]?.provider, 'gemini');
});

test('generic group draft route preserves existing temporary participants during route entry', () => {
  const participants = resolveGenericDraftTemporaryParticipants(
    'group',
    [
      {
        participantId: 'participant-existing',
        name: 'Existing Reviewer',
        provider: 'gemini',
        instance: 'native',
        model: 'gemini-3.1-pro',
        modelSelection: null,
      },
    ],
    () => {
      throw new Error('should not reseed existing draft participants');
    },
  );

  assert.equal(participants.length, 1);
  assert.equal(participants[0]?.provider, 'gemini');
});

test('resolveDraftAudienceParticipantIds preserves chip order and falls back to the first participant when keys go stale', () => {
  assert.deepEqual(
    resolveDraftAudienceParticipantIds({
      draftParticipantCatIds: ['cat-lead', 'cat-helper'],
      draftTemporaryParticipants: [
        {
          participantId: 'participant-reviewer',
        },
      ],
      draftAudienceKeys: ['temp:participant-reviewer', 'cat:cat-lead'],
      maxAudienceParticipants: 2,
    }),
    ['participant-reviewer', 'cat-lead'],
  );

  assert.deepEqual(
    resolveDraftAudienceParticipantIds({
      draftParticipantCatIds: ['cat-lead', 'cat-helper'],
      draftTemporaryParticipants: [],
      draftAudienceKeys: ['cat:missing'],
      maxAudienceParticipants: 2,
    }),
    ['cat-lead'],
  );

  assert.deepEqual(
    resolveDraftAudienceParticipantIds({
      draftParticipantCatIds: ['cat-lead', 'cat-helper', 'cat-third'],
      draftTemporaryParticipants: [
        {
          participantId: 'participant-reviewer',
        },
      ],
      draftAudienceKeys: null,
      maxAudienceParticipants: 3,
    }),
    ['cat-lead', 'cat-helper', 'cat-third'],
  );

  assert.deepEqual(
    resolveDraftAudienceParticipantIds({
      draftParticipantCatIds: ['cat-lead', 'cat-helper', 'cat-third'],
      draftTemporaryParticipants: [
        {
          participantId: 'participant-reviewer',
        },
      ],
      draftAudienceKeys: [
        'cat:cat-third',
        'temp:participant-reviewer',
        'cat:cat-helper',
        'cat:cat-lead',
      ],
      maxAudienceParticipants: 2,
    }),
    ['cat-third', 'participant-reviewer'],
  );
});

test('reconcileDraftAudienceKeysAfterParticipantRemoval shrinks the audience instead of backfilling another room member', () => {
  assert.deepEqual(
    reconcileDraftAudienceKeysAfterParticipantRemoval({
      draftAudienceKeys: ['cat:cat-lead', 'cat:cat-helper', 'temp:participant-reviewer'],
      previousParticipantKeys: [
        'cat:cat-lead',
        'cat:cat-helper',
        'temp:participant-analyst',
        'temp:participant-reviewer',
      ],
      nextParticipantKeys: [
        'cat:cat-helper',
        'temp:participant-analyst',
        'temp:participant-reviewer',
      ],
      removedParticipantKey: 'cat:cat-lead',
    }),
    ['cat:cat-helper', 'temp:participant-reviewer'],
  );
});

test('reconcileDraftAudienceKeysAfterParticipantRemoval does not force a backfill when the audience was manually below the cap', () => {
  assert.deepEqual(
    reconcileDraftAudienceKeysAfterParticipantRemoval({
      draftAudienceKeys: ['cat:cat-lead', 'temp:participant-reviewer'],
      previousParticipantKeys: [
        'cat:cat-lead',
        'cat:cat-helper',
        'temp:participant-analyst',
        'temp:participant-reviewer',
      ],
      nextParticipantKeys: [
        'cat:cat-helper',
        'temp:participant-analyst',
        'temp:participant-reviewer',
      ],
      removedParticipantKey: 'cat:cat-lead',
    }),
    ['temp:participant-reviewer'],
  );
});

test('reconcileDraftAudienceKeysAfterParticipantRemoval falls back to the first remaining member when the audience becomes empty', () => {
  assert.deepEqual(
    reconcileDraftAudienceKeysAfterParticipantRemoval({
      draftAudienceKeys: ['temp:participant-reviewer'],
      previousParticipantKeys: [
        'cat:cat-lead',
        'temp:participant-reviewer',
        'temp:participant-analyst',
      ],
      nextParticipantKeys: [
        'cat:cat-lead',
        'temp:participant-analyst',
      ],
      removedParticipantKey: 'temp:participant-reviewer',
    }),
    ['cat:cat-lead'],
  );
});

test('resolveDraftParticipantSelection dedupes toggled cats and keeps the route default recipient first', () => {
  const selection = resolveDraftParticipantSelection({
    draftDefaultRecipientCatId: 'cat-lead',
    draftCatIds: ['cat-helper', 'cat-lead', 'cat-helper', '   '],
  });

  assert.equal(selection.routeDefaultRecipientCatId, 'cat-lead');
  assert.deepEqual(selection.toggleCatIds, ['cat-helper', 'cat-lead']);
  assert.deepEqual(selection.participantCatIds, ['cat-lead', 'cat-helper']);
  assert.equal(selection.effectiveDefaultRecipientCatId, 'cat-lead');
  assert.equal(selection.hasRouteDefaultRecipient, true);
  assert.equal(selection.hasParticipants, true);
});

test('resolveDraftParticipantSelection falls back to the first selected cat when no route default recipient exists', () => {
  const selection = resolveDraftParticipantSelection({
    draftDefaultRecipientCatId: null,
    draftCatIds: ['cat-helper', 'cat-reviewer'],
  });

  assert.equal(selection.routeDefaultRecipientCatId, null);
  assert.deepEqual(selection.toggleCatIds, ['cat-helper', 'cat-reviewer']);
  assert.deepEqual(selection.participantCatIds, ['cat-helper', 'cat-reviewer']);
  assert.equal(selection.effectiveDefaultRecipientCatId, 'cat-helper');
  assert.equal(selection.hasRouteDefaultRecipient, false);
  assert.equal(selection.hasParticipants, true);
});

test('resolveDraftRouteContext distinguishes generic, lead-scoped, and direct-lane routes', () => {
  assert.deepEqual(
    resolveDraftRouteContext({
      draftDefaultRecipientCatId: null,
      showingMyCatDirectLane: false,
    }),
    {
      routeDefaultRecipientCatId: null,
      isDirectLaneRoute: false,
      isRecipientScopedNewChatRoute: false,
      isGenericNewChatRoute: true,
    },
  );

  assert.deepEqual(
    resolveDraftRouteContext({
      draftDefaultRecipientCatId: 'cat-lead',
      showingMyCatDirectLane: false,
    }),
    {
      routeDefaultRecipientCatId: 'cat-lead',
      isDirectLaneRoute: false,
      isRecipientScopedNewChatRoute: true,
      isGenericNewChatRoute: false,
    },
  );

  assert.deepEqual(
    resolveDraftRouteContext({
      draftDefaultRecipientCatId: 'cat-direct',
      showingMyCatDirectLane: true,
    }),
    {
      routeDefaultRecipientCatId: 'cat-direct',
      isDirectLaneRoute: true,
      isRecipientScopedNewChatRoute: false,
      isGenericNewChatRoute: false,
    },
  );
});

test('resolveDraftRoutePath keeps generic, lead-scoped, and direct draft entries aligned', () => {
  const genericRoute = resolveDraftRouteContext({
    draftDefaultRecipientCatId: null,
    showingMyCatDirectLane: false,
  });
  const leadScopedRoute = resolveDraftRouteContext({
    draftDefaultRecipientCatId: 'cat-lead',
    showingMyCatDirectLane: false,
  });
  const directLaneRoute = resolveDraftRouteContext({
    draftDefaultRecipientCatId: 'cat-direct',
    showingMyCatDirectLane: true,
  });

  assert.equal(resolveDraftRoutePath({ route: genericRoute }), NEW_CHAT_PATH);
  assert.equal(resolveDraftRoutePath({ route: leadScopedRoute }), buildNewChatPath('cat-lead'));
  assert.equal(resolveDraftRoutePath({ route: directLaneRoute }), buildMyCatPath('cat-direct'));
  assert.equal(
    resolveDraftRoutePath({ route: leadScopedRoute, nextDefaultRecipientCatId: 'cat-reviewer' }),
    buildNewChatPath('cat-reviewer'),
  );
  assert.equal(
    resolveDraftRoutePath({ route: directLaneRoute, nextDefaultRecipientCatId: 'cat-reviewer' }),
    buildMyCatPath('cat-reviewer'),
  );
});

test('resolveMissingDraftDefaultRecipientPath falls back to visible chats only for direct-lane drafts', () => {
  const visibleThread = {
    id: 'visible-thread',
    roomMode: 'boss_chat',
    channelKind: 'boss_thread',
  } as const;
  const hiddenDirectLane = {
    id: 'hidden-direct',
    roomMode: 'direct_cat_chat',
    channelKind: 'direct_lane',
  } as const;

  assert.equal(
    resolveMissingDraftDefaultRecipientPath({
      route: resolveDraftRouteContext({
        draftDefaultRecipientCatId: 'cat-direct',
        showingMyCatDirectLane: true,
      }),
      channels: [hiddenDirectLane, visibleThread],
      selectedChannelId: hiddenDirectLane.id,
    }),
    buildChannelPath(visibleThread.id),
  );
  assert.equal(
    resolveMissingDraftDefaultRecipientPath({
      route: resolveDraftRouteContext({
        draftDefaultRecipientCatId: 'cat-lead',
        showingMyCatDirectLane: false,
      }),
      channels: [hiddenDirectLane, visibleThread],
      selectedChannelId: visibleThread.id,
    }),
    NEW_CHAT_PATH,
  );
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
