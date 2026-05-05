import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConversationSidebarViewModel } from '../src/app/renderer/productShell/conversationSidebarViewModel.ts';
import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import type { ParticipantSessionStatus } from '../src/shared/roomRouting.ts';
import { buildDirectMessagePath } from '../src/shared/channelPaths.ts';
import { isChatCat } from '../src/products/chat/renderer/chatUtils.tsx';
import {
  findDirectLaneForCat,
  resolveMyCatNavigationTarget,
  resolveMyCatStatusDot,
} from '../src/products/chat/renderer/myCatNavigation.ts';
import { isDirectLaneSummary } from '../src/products/chat/shared/channelTopology.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

// This file verifies the DIRECT MESSAGES resolver/view-model route
// contract only. DOM row-click wiring is intentionally outside this
// SSR-safe coverage after the old React tree traversal test was
// removed.

function createChannel(
  overrides: Partial<ChatChannelSummary> & { id: string; title: string },
): ChatChannelSummary {
  return {
    id: overrides.id,
    title: overrides.title,
    topic: '',
    originSurface: 'chat',
    status: 'active',
    unreadCount: 0,
    catCount: 1,
    activeCatCount: 1,
    repoPath: null,
    chatCwd: null,
    lastMessageAt: null,
    lastActivatedAt: null,
    ...overrides,
  };
}

function createRuntime(reachable: boolean, status = 'ok') {
  return { baseUrl: 'http://localhost:3110', reachable, status, service: 'cats-runtime' };
}

function createPayload(channels: ChatChannelSummary[], runtime?: { baseUrl: string; reachable: boolean; status: string; service: string }): AppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    setupCompleteAt: '2026-03-23T00:00:00.000Z',
    lastProductSurface: 'chat',
    guideCat: null,
    app: { name: 'cats', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
    products: [],
    desktop: {
      startAtLogin: false,
      openWindowOnStartup: true,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'full',
      cats: [],
    },
    runtime: runtime ?? createRuntime(true, 'ok'),
    runtimeSetup: {
      complete: true,
      checklist: [],
      availableProviders: [],
    },
    metadata: {
      generatedAt: '2026-03-23T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    chat: {
      id: 'chat',
      name: 'Cats Chat',
      bossCatId: 'boss-cat',
      cats: [
        {
          id: 'boss-cat',
          name: 'Boss Cat',
          provider: 'openai',
          instance: null,
          model: 'gpt-5',
          status: 'active',
          createdAt: '2026-03-23T00:00:00.000Z',
          updatedAt: '2026-03-23T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#8B7E74',
          defaultExecutionTarget: { provider: 'openai', instance: null, model: 'gpt-5' },
          memory: { summary: null, updatedAt: null },
          skillProfile: null,
          mcpProfile: null,
        },
        {
          id: 'companion-cat',
          name: 'Companion',
          provider: 'openai',
          instance: null,
          model: 'gpt-5-mini',
          status: 'active',
          createdAt: '2026-03-23T00:00:00.000Z',
          updatedAt: '2026-03-23T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#5B8DEF',
          defaultExecutionTarget: { provider: 'openai', instance: null, model: 'gpt-5-mini' },
          memory: { summary: null, updatedAt: null },
          skillProfile: null,
          mcpProfile: null,
        },
      ],
      channels,
      selectedChannel: null,
      selectedChannelId: null,
      globalOrchestrator: {
        mode: 'global',
        status: 'ready',
        nextFocus: 'Steady state',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: { provider: 'openai', instance: null, model: 'gpt-5' },
        executionModelSelection: null,
        systemPrompt: 'You are Boss Cat.',
        skillProfile: null,
        mcpProfile: null,
        memory: { summary: null, updatedAt: null },
        telegramBotName: null,
        updatedAt: '2026-03-23T00:00:00.000Z',
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
        maxCats: 8,
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
        maxParallelChats: 5,
        availableSurfaces: ['chat'],
      },
      newChatDefaults: {
        provider: 'openai',
        instance: null,
        model: 'gpt-5',
        modelSelection: null,
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  } as AppShellPayload;
}

const t = createTranslator('en');

function createSidebarViewModel(payload: AppShellPayload) {
  return buildConversationSidebarViewModel({
    payload,
    currentPath: '/chat',
    shellSurface: 'chat',
    helpers: {
      isVisibleCat: isChatCat,
      isDirectLaneSummary,
    },
    t,
  });
}

function resolveDirectMessagesClickPath(
  payload: AppShellPayload,
  catId: string,
): string {
  return resolveMyCatNavigationTarget(payload.chat.channels, catId).path;
}

function readRecentChannels(
  payload: AppShellPayload,
): Array<{ id: string; title: string }> {
  const viewModel = createSidebarViewModel(payload);
  return viewModel.resolvedRecentEntries.flatMap((entry) =>
    entry.kind === 'group'
      ? entry.channels.map((channel) => ({ id: channel.channel.id, title: channel.channel.title }))
      : [{ id: entry.channel.id, title: entry.channel.title }],
  );
}

function readRuntimeFooterLabel(payload: AppShellPayload): string {
  return createSidebarViewModel(payload).runtimeFooterLabel;
}

test('clicking a Direct Messages entry without an existing direct lane opens that Cat lane in place', () => {
  const payload = createPayload([]);

  assert.equal(
    resolveDirectMessagesClickPath(payload, 'companion-cat'),
    buildDirectMessagePath('companion-cat'),
  );
});

test('clicking a Direct Messages entry with an existing hidden direct lane stays on the Direct Messages route', () => {
  const payload = createPayload([
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      channelKind: 'direct_lane',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  assert.equal(
    resolveDirectMessagesClickPath(payload, 'companion-cat'),
    buildDirectMessagePath('companion-cat'),
  );
});

test('Direct Messages lookup still finds direct lanes by channelKind when roomMode is legacy-mismatched', () => {
  const channels = [
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      channelKind: 'direct_lane',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'boss_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ];

  assert.equal(findDirectLaneForCat(channels, 'companion-cat')?.id, 'direct-thread-1');
});

test('direct_cat_chat channels are excluded from the Recents list', () => {
  const payload = createPayload([
    createChannel({ id: 'boss-thread', title: 'Daily standup' }),
    createChannel({
      id: 'direct-thread',
      title: 'Companion',
      channelKind: 'direct_lane',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'boss_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);

  const rendered = readRecentChannels(payload);

  assert.ok(
    rendered.some((ch) => ch.id === 'boss-thread'),
    'boss_chat channel should appear in Recents',
  );
  assert.ok(
    !rendered.some((ch) => ch.id === 'direct-thread'),
    'direct_cat_chat channel should not appear in Recents',
  );
});

// --- Status Dot Tests ---

test('Cat with no existing direct lane shows no dot', () => {
  const channels: ChatChannelSummary[] = [];
  const lane = findDirectLaneForCat(channels, 'companion-cat');
  assert.equal(lane, null);
  assert.equal(resolveMyCatStatusDot(lane?.defaultRecipientLeaseStatus), 'no_dot');
});

test('Cat with direct lane + ready shows awake (green)', () => {
  const lane = createChannel({
    id: 'dl-1', title: 'C', channelKind: 'direct_lane', defaultRecipientCatId: 'companion-cat', roomMode: 'boss_chat',
    defaultRecipientLeaseStatus: 'ready',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.defaultRecipientLeaseStatus), 'awake');
});

test('Cat with direct lane + initializing shows waking_up (yellow)', () => {
  const lane = createChannel({
    id: 'dl-2', title: 'C', defaultRecipientCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    defaultRecipientLeaseStatus: 'initializing',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.defaultRecipientLeaseStatus), 'waking_up');
});

test('Cat with direct lane + not_started shows sleeping (gray)', () => {
  const lane = createChannel({
    id: 'dl-3', title: 'C', defaultRecipientCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    defaultRecipientLeaseStatus: 'not_started',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.defaultRecipientLeaseStatus), 'sleeping');
});

test('Cat with direct lane + closed shows sleeping (gray)', () => {
  assert.equal(resolveMyCatStatusDot('closed' as ParticipantSessionStatus), 'sleeping');
});

test('Cat with direct lane + removed shows sleeping (gray)', () => {
  assert.equal(resolveMyCatStatusDot('removed' as ParticipantSessionStatus), 'sleeping');
});

test('Cat with direct lane + error shows error (red)', () => {
  assert.equal(resolveMyCatStatusDot('error' as ParticipantSessionStatus), 'error');
});

test('Cat active in non-direct room only does not affect Direct Messages dot', () => {
  const channels = [
    createChannel({ id: 'boss-room', title: 'Work', defaultRecipientCatId: 'companion-cat' }),
  ];
  const lane = findDirectLaneForCat(channels, 'companion-cat');
  assert.equal(lane, null, 'boss_chat room should not be found as direct lane');
  assert.equal(resolveMyCatStatusDot(lane?.defaultRecipientLeaseStatus), 'no_dot');
});

test('clicking Direct Messages row still preserves existing navigation behavior with status dots', () => {
  const payload = createPayload([
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
      defaultRecipientLeaseStatus: 'ready',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  assert.equal(
    resolveDirectMessagesClickPath(payload, 'companion-cat'),
    buildDirectMessagePath('companion-cat'),
  );
});

// --- Runtime Footer Status Dot Tests ---

test('no runtime health yet shows gray dot with unknown tooltip', () => {
  const payload = createPayload([], {
    baseUrl: 'http://localhost:3110',
    reachable: undefined as unknown as boolean,
    status: null as unknown as string,
    service: 'cats-runtime',
  });
  assert.equal(readRuntimeFooterLabel(payload), 'Checking Cats Runtime status…');
});

test('reachable healthy runtime shows green dot', () => {
  const payload = createPayload([], createRuntime(true, 'ok'));
  assert.equal(readRuntimeFooterLabel(payload), 'Cats Runtime is connected');
});

test('reachable degraded runtime shows yellow dot', () => {
  const payload = createPayload([], createRuntime(true, 'degraded'));
  assert.equal(readRuntimeFooterLabel(payload), 'Cats Runtime is starting up');
});

test('unreachable runtime shows red dot', () => {
  const payload = createPayload([], createRuntime(false, 'error'));
  assert.equal(readRuntimeFooterLabel(payload), 'Cats Runtime is offline');
});

test('changing selected chat does not affect footer runtime dot', () => {
  const payload = createPayload(
    [createChannel({ id: 'ch-1', title: 'Work' })],
    createRuntime(true, 'ok'),
  );
  assert.equal(readRuntimeFooterLabel(payload), 'Cats Runtime is connected');
});

test('Direct Messages status dots and footer runtime dot coexist', () => {
  const payload = createPayload(
    [createChannel({
      id: 'dl-1', title: 'Companion', defaultRecipientCatId: 'companion-cat',
      roomMode: 'direct_cat_chat', defaultRecipientLeaseStatus: 'ready',
    } as Partial<ChatChannelSummary> & { id: string; title: string })],
    createRuntime(true, 'ok'),
  );
  assert.equal(readRuntimeFooterLabel(payload), 'Cats Runtime is connected');
});
