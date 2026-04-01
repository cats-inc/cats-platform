import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveSelectedChannelEntryLifecycle,
  shouldAwaitSelectedChannelWakeBeforeSend,
  shouldWakeRouteChannelOnEntry,
} from '../dist-server/products/chat/shared/channelEntry.js';

test('renderer route entry wakes when a persisted room route is not yet the hydrated selected view', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: null,
      entryLifecycleState: null,
    }),
    true,
  );
});

test('renderer route entry wakes sleeping rooms but not awake or errored ones', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'sleeping',
    }),
    true,
  );

  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'awake',
    }),
    false,
  );

  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'error',
    }),
    false,
  );
});

test('composer waits for sleeping, waking, or errored selected channels before sending', () => {
  assert.equal(
    shouldAwaitSelectedChannelWakeBeforeSend({
      id: 'channel-1',
      title: 'Sleeping room',
      topic: '',
      channelKind: 'boss_thread',
      status: 'configured',
      unreadCount: 0,
      repoPath: null,
      chatCwd: null,
      language: null,
      responseLanguage: 'en',
      formationMode: 'manual',
      skillProfile: null,
      mcpProfile: null,
      orchestratorRoles: [],
      createdAt: '2026-03-23T00:00:00.000Z',
      updatedAt: '2026-03-23T00:00:00.000Z',
      lastMessageAt: null,
      lastActivatedAt: null,
      orchestratorLease: {
        sessionId: null,
        status: 'not_started',
        cwd: null,
        lastError: null,
        provider: 'claude',
        model: null,
        startedAt: null,
        lastUsedAt: null,
      },
      catAssignments: [],
      messages: [],
      assignedCats: [],
      roomRouting: {
        mode: 'boss_chat',
        leadParticipantId: null,
        maxContinuations: 6,
        maxDispatchesPerTurn: 12,
        maxTargetVisitsPerTurn: 2,
        lastOutcome: null,
        lastCheckpoint: null,
        lastWakeRequest: null,
        wakeHistory: [],
        workflow: {
          activeTurn: null,
          turnHistory: [],
          eventHistory: [],
          lastCheckpointEvent: null,
          lastOutcomeEvent: null,
        },
      },
      workingMemory: {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      },
    }),
    true,
  );

  assert.equal(
    shouldAwaitSelectedChannelWakeBeforeSend({
      id: 'channel-1',
      title: 'Awake room',
      topic: '',
      channelKind: 'boss_thread',
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
      createdAt: '2026-03-23T00:00:00.000Z',
      updatedAt: '2026-03-23T00:00:00.000Z',
      lastMessageAt: null,
      lastActivatedAt: null,
      orchestratorLease: {
        sessionId: 'session-1',
        status: 'ready',
        cwd: null,
        lastError: null,
        provider: 'claude',
        model: null,
        startedAt: null,
        lastUsedAt: null,
      },
      catAssignments: [],
      messages: [],
      assignedCats: [],
      roomRouting: {
        mode: 'boss_chat',
        leadParticipantId: null,
        maxContinuations: 6,
        maxDispatchesPerTurn: 12,
        maxTargetVisitsPerTurn: 2,
        lastOutcome: null,
        lastCheckpoint: null,
        lastWakeRequest: null,
        wakeHistory: [],
        workflow: {
          activeTurn: null,
          turnHistory: [],
          eventHistory: [],
          lastCheckpointEvent: null,
          lastOutcomeEvent: null,
        },
      },
      workingMemory: {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      },
    }),
    false,
  );
});

test('renderer route entry does not wake when the route channel is missing', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-404',
      routeChannelExists: false,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'sleeping',
    }),
    false,
  );
});

test('direct chat entry lifecycle stays null when the lead cat is missing instead of falling back to Boss Cat', () => {
  const lifecycle = resolveSelectedChannelEntryLifecycle({
    id: 'channel-1',
    title: 'Companion Direct',
    topic: '',
    channelKind: 'direct_lane',
    status: 'configured',
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: null,
    mcpProfile: null,
    orchestratorRoles: [],
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z',
    lastMessageAt: null,
    lastActivatedAt: null,
    orchestratorLease: {
      sessionId: null,
      status: 'ready',
      cwd: null,
      lastError: null,
      provider: 'claude',
      model: null,
      startedAt: null,
      lastUsedAt: null,
    },
    catAssignments: [],
    messages: [],
    assignedCats: [],
    roomRouting: {
      mode: 'boss_chat',
      leadParticipantId: 'companion-cat',
      maxContinuations: 6,
      maxDispatchesPerTurn: 12,
      maxTargetVisitsPerTurn: 2,
      lastOutcome: null,
      lastCheckpoint: null,
      lastWakeRequest: null,
      wakeHistory: [],
      workflow: {
        activeTurn: null,
        turnHistory: [],
        eventHistory: [],
        lastCheckpointEvent: null,
        lastOutcomeEvent: null,
      },
    },
    workingMemory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
  });

  assert.equal(lifecycle, null);
});
