import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSessionHealthSummary } from '../dist-server/products/chat/shared/sessionHealth.js';

function buildChannel(kind = 'direct_lane', topic = '', leaseStatuses = ['ready']) {
  return {
    id: 'ch-1',
    title: 'Test',
    topic,
    status: 'active',
    channelKind: kind,
    catAssignments: leaseStatuses.map((status, i) => ({
      catId: `cat-${i}`,
      assignedAt: '',
      execution: {
        target: { provider: 'claude', instance: null, model: null },
        lease: { sessionId: null, status, cwd: null, lastError: null, provider: null, model: null, startedAt: null, lastUsedAt: null },
      },
    })),
    messages: [],
    composerMode: 'cat_led',
    createdAt: '',
    updatedAt: '',
    lastMessageAt: null,
    lastActivatedAt: '2026-01-01T00:00:00Z',
    orchestratorLease: { sessionId: null, status: 'not_started', cwd: null, lastError: null, provider: null, model: null, startedAt: null, lastUsedAt: null },
  };
}

test('buildSessionHealthSummary returns correct topology for direct_lane', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_lane'));
  assert.equal(summary.topology, 'direct_lane');
  assert.equal(summary.allowsSleep, true);
  assert.equal(summary.allowsResume, true);
});

test('buildSessionHealthSummary returns telegram_private_lane for telegram topic', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_lane', 'Telegram private'));
  assert.equal(summary.topology, 'telegram_private_lane');
  assert.equal(summary.idleTimeoutMs, 15 * 60 * 1000);
});

test('buildSessionHealthSummary counts active sessions', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_lane', '', ['ready', 'ready']));
  assert.equal(summary.activeSessions, 2);
  assert.equal(summary.sleepingSessions, 0);
});

test('buildSessionHealthSummary counts sleeping sessions', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_lane', '', ['not_started', 'closed']));
  assert.equal(summary.activeSessions, 0);
  assert.equal(summary.sleepingSessions, 2);
});

test('buildSessionHealthSummary counts error sessions', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_lane', '', ['error']));
  assert.equal(summary.erroredSessions, 1);
});

test('buildSessionHealthSummary reports memoryFlushOnReset correctly', () => {
  const directLane = buildSessionHealthSummary(buildChannel('direct_lane'));
  assert.equal(directLane.memoryFlushOnReset, true);

  const soloThread = buildSessionHealthSummary(buildChannel('boss_thread'));
  assert.equal(soloThread.memoryFlushOnReset, false);
});
