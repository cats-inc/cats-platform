import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { deriveAppViewState } from '../src/products/chat/renderer/appViewState.ts';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: 'boss-cat',
      botBindings: [],
      capabilities: {
        maxCats: 5,
        maxParallelChats: 5,
      },
      cats: [
        {
          id: 'boss-cat',
          name: 'Boss Cat',
          roles: ['boss'],
          skillProfile: null,
          mcpProfile: null,
          status: 'active',
          createdAt: '2026-04-08T00:00:00.000Z',
          updatedAt: '2026-04-08T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#8B7E74',
          avatarUrl: null,
          defaultExecutionTarget: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          defaultModelSelection: null,
          products: ['chat'],
          memory: {
            summary: null,
            facts: [],
            openLoops: [],
            updatedAt: null,
          },
        },
        {
          id: 'cat-reviewer',
          name: 'Reviewer',
          roles: [],
          skillProfile: null,
          mcpProfile: null,
          status: 'active',
          createdAt: '2026-04-08T00:00:00.000Z',
          updatedAt: '2026-04-08T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#5B8DEF',
          avatarUrl: null,
          defaultExecutionTarget: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          defaultModelSelection: null,
          products: ['chat'],
          memory: {
            summary: null,
            facts: [],
            openLoops: [],
            updatedAt: null,
          },
        },
      ],
    },
  } as unknown as AppShellPayload;
}

function createChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'channel-1',
    title: 'Group chat',
    topic: 'Testing',
    channelKind: 'multi_cat_room',
    status: 'active',
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: null,
    mcpProfile: null,
    orchestratorRoles: [],
    composerMode: 'cat_led',
    pendingProvider: null,
    pendingModel: null,
    pendingInstance: null,
    pendingModelSelection: null,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
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
    participantAssignments: [],
    assignedCats: [],
    assignedParticipants: [],
    messages: [],
    roomRouting: {
      mode: 'boss_chat',
      defaultRecipientId: null,
      lastOutcome: null,
      lastCheckpoint: null,
      lastWakeRequest: null,
      wakeHistory: [],
      workflow: {
        activeTurn: null,
        pendingContinuations: [],
        lastOutcomeEvent: null,
      },
    },
    workingMemory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
    ...overrides,
  };
}

test('deriveAppViewState does not auto-insert Boss Cat for multi-participant rooms', () => {
  const payload = createPayload();
  const selectedChannel = createChannel({
    assignedParticipants: [
      {
        participantId: 'participant-reviewer',
        sourceKind: 'cat',
        sourceRefId: 'cat-reviewer',
        catId: 'cat-reviewer',
        name: 'Reviewer',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-04-08T00:00:00.000Z',
        leftAt: null,
        avatarColor: '#5B8DEF',
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
      {
        participantId: 'participant-inline',
        sourceKind: 'adhoc',
        sourceRefId: null,
        name: 'Claude',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-04-08T00:00:00.000Z',
        leftAt: null,
        avatarColor: null,
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
    ],
    assignedCats: [
      {
        participantId: 'participant-reviewer',
        sourceKind: 'cat',
        sourceRefId: 'cat-reviewer',
        catId: 'cat-reviewer',
        name: 'Reviewer',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-04-08T00:00:00.000Z',
        leftAt: null,
        avatarColor: '#5B8DEF',
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
    ],
  });

  const viewState = deriveAppViewState({
    pathname: '/chat/chats/channel-1',
    payload,
    draftDefaultRecipientCatId: null,
    showingGenericNewChatDraft: false,
    selectedChannel: selectedChannel as never,
    selectedDirectLane: null,
    routeDirectLaneSummary: null,
    showingMyCatDirectLane: false,
    addCatOpen: false,
    draftCatIds: [],
  });

  assert.equal(viewState.showBossCatAvatar, false);
});

test('deriveAppViewState still shows Boss Cat avatar for cat-led threads without Boss assigned', () => {
  const payload = createPayload();
  const selectedChannel = createChannel({
    channelKind: 'boss_thread',
    assignedParticipants: [
      {
        participantId: 'participant-reviewer',
        sourceKind: 'cat',
        sourceRefId: 'cat-reviewer',
        catId: 'cat-reviewer',
        name: 'Reviewer',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-04-08T00:00:00.000Z',
        leftAt: null,
        avatarColor: '#5B8DEF',
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
    ],
    assignedCats: [
      {
        participantId: 'participant-reviewer',
        sourceKind: 'cat',
        sourceRefId: 'cat-reviewer',
        catId: 'cat-reviewer',
        name: 'Reviewer',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-04-08T00:00:00.000Z',
        leftAt: null,
        avatarColor: '#5B8DEF',
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
    ],
  });

  const viewState = deriveAppViewState({
    pathname: '/chat/chats/channel-1',
    payload,
    draftDefaultRecipientCatId: null,
    showingGenericNewChatDraft: false,
    selectedChannel: selectedChannel as never,
    selectedDirectLane: null,
    routeDirectLaneSummary: null,
    showingMyCatDirectLane: false,
    addCatOpen: false,
    draftCatIds: [],
  });

  assert.equal(viewState.showBossCatAvatar, true);
});
