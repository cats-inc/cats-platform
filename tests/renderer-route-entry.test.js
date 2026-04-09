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
