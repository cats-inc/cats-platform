import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreSession,
} from '../build/server/core/model/index.js';
import { listSessions } from '../build/server/core/sessionList.js';

test('listSessions filters sessions by canonical relationship ids and runtime fields', () => {
  let core = createDefaultCoreState();

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      laneId: 'lane-1',
      participantId: 'participant-1',
      agentId: 'actor-agent-1',
      transportBindingId: 'transport-binding-1',
      runtimeKey: 'claude:cli',
      status: 'active',
      createdAt: '2026-04-15T03:30:00.000Z',
      startedAt: '2026-04-15T03:30:00.000Z',
    },
    new Date('2026-04-15T03:30:00.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-2',
      conversationId: 'conversation-2',
      turnId: 'turn-2',
      laneId: 'lane-2',
      participantId: 'participant-2',
      agentId: 'actor-agent-2',
      transportBindingId: 'transport-binding-2',
      runtimeKey: 'gemini:cli',
      status: 'failed',
      createdAt: '2026-04-15T03:31:00.000Z',
      startedAt: '2026-04-15T03:31:00.000Z',
      completedAt: '2026-04-15T03:32:00.000Z',
    },
    new Date('2026-04-15T03:32:00.000Z'),
  ).core;

  const filtered = listSessions(core, {
    conversationIds: ['conversation-1'],
    turnIds: ['turn-1'],
    laneIds: ['lane-1'],
    participantIds: ['participant-1'],
    agentIds: ['actor-agent-1'],
    transportBindingIds: ['transport-binding-1'],
    runtimeKeys: ['claude:cli'],
    statuses: ['active'],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'session-1');
});

test('listSessions sorts by updatedAt descending and applies limit', () => {
  let core = createDefaultCoreState();

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      status: 'active',
      createdAt: '2026-04-15T03:40:00.000Z',
      startedAt: '2026-04-15T03:40:00.000Z',
    },
    new Date('2026-04-15T03:40:00.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-2',
      conversationId: 'conversation-2',
      status: 'failed',
      createdAt: '2026-04-15T03:41:00.000Z',
      startedAt: '2026-04-15T03:41:00.000Z',
      completedAt: '2026-04-15T03:42:00.000Z',
    },
    new Date('2026-04-15T03:42:00.000Z'),
  ).core;

  const limited = listSessions(core, { limit: 1 });

  assert.equal(limited.length, 1);
  assert.equal(limited[0].id, 'session-2');
});
