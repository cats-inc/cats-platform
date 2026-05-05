import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';
import { deriveAppRouteState as deriveChatAppRouteState } from '../src/products/chat/renderer/appViewState.ts';
import { deriveAppRouteState as deriveCodeAppRouteState } from '../src/products/code/renderer/appViewState.ts';
import { deriveAppViewState as deriveWorkAppViewState } from '../src/products/work/renderer/appViewState.ts';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: 'boss-cat',
      selectedChannelId: 'direct-lane-1',
      selectedChannel: {
        id: 'direct-lane-1',
        title: 'Companion',
        topic: '',
        channelKind: 'direct_lane',
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
        assignedCats: [
          {
            catId: 'companion-cat',
            name: 'Companion',
            roles: [],
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
        messages: [],
        roomRouting: {
          mode: 'direct_cat_chat',
          defaultRecipientId: 'companion-cat',
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
      },
      channels: [
        {
          id: 'direct-lane-1',
          title: 'Companion',
          topic: '',
          channelKind: 'direct_lane',
          status: 'active',
          unreadCount: 0,
          catCount: 1,
          activeCatCount: 1,
          repoPath: null,
          chatCwd: null,
          lastMessageAt: null,
          lastActivatedAt: null,
          pendingProvider: null,
          pendingModel: null,
          pendingModelSelection: null,
          defaultRecipientCatId: 'companion-cat',
          defaultRecipientLeaseStatus: 'ready',
          roomMode: 'direct_cat_chat',
          routingStatus: undefined,
          lastRoutingAt: null,
        },
      ],
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
          id: 'companion-cat',
          name: 'Companion',
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
      globalOrchestrator: {
        mode: 'global',
        status: 'ready',
        nextFocus: 'Steady state',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: {
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
        },
        executionModelSelection: null,
        systemPrompt: 'You are Boss Cat.',
        skillProfile: null,
        mcpProfile: null,
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
        telegramBotName: null,
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
      newChatDefaults: {
        provider: 'claude',
        instance: 'native',
        model: 'claude-sonnet',
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
        maxCats: 5,
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
        maxParallelChats: 5,
        availableSurfaces: ['chat', 'work', 'code'],
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  } as unknown as AppShellPayload;
}

test('Code app route state keeps shared direct-lane selection semantics', () => {
  const payload = createPayload();

  const routeState = deriveCodeAppRouteState({
    state: { status: 'ready', payload },
    routeChannelId: 'direct-lane-1',
    draftDefaultRecipientCatId: 'companion-cat',
    showingMyCatDirectLane: true,
  });

  assert.equal(routeState.routeChannelTitle, 'Companion');
  assert.equal(routeState.selectedChannel?.id, 'direct-lane-1');
  assert.equal(routeState.selectedDirectLane?.id, 'direct-lane-1');
  assert.equal(routeState.routeDirectLaneSummary?.id, 'direct-lane-1');
});

test('Chat app route state reuses the shared direct-lane selection semantics', () => {
  const payload = createPayload();

  const routeState = deriveChatAppRouteState({
    state: { status: 'ready', payload },
    routeChannelId: 'direct-lane-1',
    draftDefaultRecipientCatId: 'companion-cat',
    showingMyCatDirectLane: true,
  });

  assert.equal(routeState.routeChannelTitle, 'Companion');
  assert.equal(routeState.selectedChannel?.id, 'direct-lane-1');
  assert.equal(routeState.selectedDirectLane?.id, 'direct-lane-1');
  assert.equal(routeState.routeDirectLaneSummary?.id, 'direct-lane-1');
});

test('Work app view state keeps shared settings and direct-lane derivation semantics', () => {
  const payload = createPayload();
  const selectedDirectLane = payload.chat.selectedChannel;

  const viewState = deriveWorkAppViewState({
    pathname: '/settings/cats',
    payload,
    draftDefaultRecipientCatId: null,
    selectedChannel: null,
    selectedDirectLane,
    routeDirectLaneSummary: payload.chat.channels[0] ?? null,
    showingMyCatDirectLane: true,
    addCatOpen: false,
    showingNewChatDraft: false,
    draftCatIds: [],
  });

  assert.equal(viewState.surface, 'settings');
  assert.equal(viewState.activeMyCatId, 'companion-cat');
  assert.equal(viewState.showBossCatAvatar, true);
  assert.deepEqual(Array.from(viewState.assignedCatIds), ['companion-cat']);
});

test('Work app view state keeps the direct-lane boot surface only until the lane hydrates', () => {
  const payload = createPayload();
  const routeDirectLaneSummary = payload.chat.channels[0] ?? null;

  const bootingViewState = deriveWorkAppViewState({
    pathname: '/work/dm/companion-cat',
    payload,
    draftDefaultRecipientCatId: 'companion-cat',
    selectedChannel: null,
    selectedDirectLane: null,
    routeDirectLaneSummary,
    showingMyCatDirectLane: true,
    addCatOpen: false,
    showingNewChatDraft: false,
    draftCatIds: [],
  });
  const hydratedViewState = deriveWorkAppViewState({
    pathname: '/work/dm/companion-cat',
    payload,
    draftDefaultRecipientCatId: 'companion-cat',
    selectedChannel: null,
    selectedDirectLane: payload.chat.selectedChannel,
    routeDirectLaneSummary,
    showingMyCatDirectLane: true,
    addCatOpen: false,
    showingNewChatDraft: false,
    draftCatIds: [],
  });

  assert.equal(bootingViewState.showDirectLaneBoot, true);
  assert.equal(hydratedViewState.showDirectLaneBoot, false);
});

test('Work app view state only opens Add Cat for existing rooms or generic drafts', () => {
  const payload = createPayload();

  const existingRoomViewState = deriveWorkAppViewState({
    pathname: '/work/chats/direct-lane-1',
    payload,
    draftDefaultRecipientCatId: null,
    selectedChannel: payload.chat.selectedChannel,
    selectedDirectLane: null,
    routeDirectLaneSummary: null,
    showingMyCatDirectLane: false,
    addCatOpen: true,
    showingNewChatDraft: false,
    draftCatIds: [],
  });
  const genericDraftViewState = deriveWorkAppViewState({
    pathname: '/work/new',
    payload,
    draftDefaultRecipientCatId: null,
    selectedChannel: null,
    selectedDirectLane: null,
    routeDirectLaneSummary: null,
    showingMyCatDirectLane: false,
    addCatOpen: true,
    showingNewChatDraft: true,
    draftCatIds: [],
  });
  const directDraftViewState = deriveWorkAppViewState({
    pathname: '/work/new/companion-cat',
    payload,
    draftDefaultRecipientCatId: 'companion-cat',
    selectedChannel: null,
    selectedDirectLane: null,
    routeDirectLaneSummary: null,
    showingMyCatDirectLane: false,
    addCatOpen: true,
    showingNewChatDraft: true,
    draftCatIds: [],
  });

  assert.equal(existingRoomViewState.showAddCatPanel, true);
  assert.equal(genericDraftViewState.showAddCatPanel, true);
  assert.equal(directDraftViewState.showAddCatPanel, false);
});
