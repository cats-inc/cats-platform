import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreSession,
  upsertCoreTransportBinding,
} from '../build/server/core/model/index.js';
import { buildTransportStateProjection } from '../build/server/core/transportStateProjection.js';

test('buildTransportStateProjection links transport bindings to latest session', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-1',
      agentId: 'actor-agent-1',
      externalThreadKey: 'bot:test',
      status: 'active',
      createdAt: '2026-04-14T22:00:00.000Z',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      transportBindingId: 'transport-binding-1',
      status: 'active',
      createdAt: '2026-04-14T22:01:00.000Z',
      startedAt: '2026-04-14T22:01:00.000Z',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const projection = buildTransportStateProjection(core);

  assert.equal(projection.summary.total, 1);
  assert.equal(projection.summary.telegram, 1);
  assert.equal(projection.summary.withSession, 1);
  assert.equal(projection.summary.activeSession, 1);
  assert.equal(projection.items.length, 1);
  assert.equal(projection.items[0].transportBinding.id, 'transport-binding-1');
  assert.equal(projection.items[0].latestSession?.id, 'session-1');
});

test('buildTransportStateProjection filters bindings by platform, agent, and session flags', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-1',
      agentId: 'actor-agent-1',
      externalThreadKey: 'bot:test',
      status: 'active',
      createdAt: '2026-04-14T23:00:00.000Z',
    },
    new Date('2026-04-14T23:00:00.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-2',
      platform: 'web',
      direction: 'bidirectional',
      conversationId: 'conversation-2',
      agentId: 'actor-agent-2',
      externalThreadKey: 'web:test',
      status: 'disabled',
      createdAt: '2026-04-14T23:01:00.000Z',
    },
    new Date('2026-04-14T23:01:00.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      transportBindingId: 'transport-binding-1',
      status: 'active',
      createdAt: '2026-04-14T23:02:00.000Z',
      startedAt: '2026-04-14T23:02:00.000Z',
    },
    new Date('2026-04-14T23:02:00.000Z'),
  ).core;

  const activeTelegram = buildTransportStateProjection(core, {
    platforms: ['telegram'],
    activeSession: true,
  });
  assert.equal(activeTelegram.items.length, 1);
  assert.equal(activeTelegram.items[0].transportBinding.id, 'transport-binding-1');

  const webOnly = buildTransportStateProjection(core, {
    agentIds: ['actor-agent-2'],
    hasSession: false,
    statuses: ['disabled'],
    limit: 1,
  });
  assert.equal(webOnly.items.length, 1);
  assert.equal(webOnly.items[0].transportBinding.id, 'transport-binding-2');
});
