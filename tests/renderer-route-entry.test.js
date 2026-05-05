import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  resolveSelectedChannelEntryLifecycle,
  shouldWakeRouteChannelOnEntry,
} from '../build/server/products/chat/shared/channelEntry.js';

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

test('renderer route entry only reselects when the route is not the hydrated selected room', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'sleeping',
    }),
    false,
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

test('workspace route hook uses the shared channel entry helper without sleeping reselect logic', async () => {
  const channelEntrySource = await readFile(
    path.join(process.cwd(), 'src/products/shared/channelEntry.ts'),
    'utf8',
  );
  const routingHookSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts'),
    'utf8',
  );

  assert.match(routingHookSource, /shouldWakeRouteChannelOnEntry/u);
  assert.doesNotMatch(channelEntrySource, /entryLifecycleState === 'sleeping'/u);
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

test('direct message entry lifecycle stays null when the direct recipient is missing instead of falling back to Boss Cat', () => {
  const lifecycle = resolveSelectedChannelEntryLifecycle({
    id: 'channel-1',
    title: 'Companion Direct',
    topic: '',
    channelKind: 'direct_message',
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
      mode: 'chat_channel',
      defaultRecipientId: 'companion-cat',
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

test('direct message entry lifecycle follows the lead participant execution lease status', () => {
  const lifecycle = resolveSelectedChannelEntryLifecycle({
    id: 'channel-direct',
    title: 'Companion Direct',
    topic: '',
    channelKind: 'direct_message',
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
    assignedCats: [
      {
        participantId: 'companion-cat',
        sourceKind: 'cat',
        sourceRefId: 'cat-1',
        catId: 'cat-1',
        name: 'Companion',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-03-23T00:00:00.000Z',
        leftAt: null,
        avatarColor: null,
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'cli',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: 'session-direct',
            status: 'initializing',
            cwd: null,
            lastError: null,
            provider: 'claude',
            model: 'claude-sonnet',
            laneId: 'lane-direct',
            startedAt: '2026-03-23T00:00:01.000Z',
            lastUsedAt: '2026-03-23T00:00:01.000Z',
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
    roomRouting: {
      mode: 'direct_message',
      defaultRecipientId: 'companion-cat',
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

  assert.equal(lifecycle, 'waking_up');
});

test('boss chat entry lifecycle follows the orchestrator execution lease status', () => {
  const lifecycle = resolveSelectedChannelEntryLifecycle({
    id: 'channel-boss',
    title: 'Boss Room',
    topic: '',
    channelKind: 'chat_channel',
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
      sessionId: 'session-boss',
      status: 'error',
      cwd: null,
      lastError: 'stale session',
      provider: 'claude',
      model: 'claude-sonnet',
      startedAt: null,
      lastUsedAt: null,
    },
    catAssignments: [],
    messages: [],
    assignedCats: [],
    roomRouting: {
      mode: 'chat_channel',
      defaultRecipientId: null,
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

  assert.equal(lifecycle, 'error');
});
