import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSessionHealthSummary } from '../build/server/products/chat/shared/sessionHealth.js';

function buildChannel(kind = 'direct_message', topic = '', leaseStatuses = ['ready']) {
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
    createdAt: '',
    updatedAt: '',
    lastMessageAt: null,
    lastActivatedAt: '2026-01-01T00:00:00Z',
    orchestratorLease: { sessionId: null, status: 'not_started', cwd: null, lastError: null, provider: null, model: null, startedAt: null, lastUsedAt: null },
  };
}

test('buildSessionHealthSummary returns correct topology for direct_message', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_message'));
  assert.equal(summary.topology, 'direct_message');
  assert.equal(summary.allowsSleep, true);
  assert.equal(summary.allowsResume, true);
});

test('buildSessionHealthSummary returns telegram_direct_message for telegram topic', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_message', 'Telegram direct message'));
  assert.equal(summary.topology, 'telegram_direct_message');
  assert.equal(summary.idleTimeoutMs, 15 * 60 * 1000);
});

test('buildSessionHealthSummary counts active sessions', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_message', '', ['ready', 'ready']));
  assert.equal(summary.activeSessions, 2);
  assert.equal(summary.sleepingSessions, 0);
});

test('buildSessionHealthSummary counts sleeping sessions', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_message', '', ['not_started', 'closed']));
  assert.equal(summary.activeSessions, 0);
  assert.equal(summary.sleepingSessions, 2);
});

test('buildSessionHealthSummary counts error sessions', () => {
  const summary = buildSessionHealthSummary(buildChannel('direct_message', '', ['error']));
  assert.equal(summary.erroredSessions, 1);
});

test('buildSessionHealthSummary reports memoryFlushOnReset correctly', () => {
  const directLane = buildSessionHealthSummary(buildChannel('direct_message'));
  assert.equal(directLane.memoryFlushOnReset, true);

  const defaultChat = buildSessionHealthSummary(buildChannel('chat_channel'));
  assert.equal(defaultChat.memoryFlushOnReset, false);
});
