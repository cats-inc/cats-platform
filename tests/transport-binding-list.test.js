import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreTransportBinding,
} from '../build/server/core/model/index.js';
import { listTransportBindings } from '../build/server/core/transportBindingList.js';

test('listTransportBindings filters transport bindings by platform, direction, status, and scope', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-1',
      participantId: 'participant-1',
      agentId: 'actor-agent-1',
      externalThreadKey: 'telegram:thread:1',
      status: 'active',
      createdAt: '2026-04-15T03:00:00.000Z',
    },
    new Date('2026-04-15T03:00:00.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-2',
      platform: 'web',
      direction: 'inbound',
      conversationId: 'conversation-2',
      participantId: 'participant-2',
      agentId: 'actor-agent-2',
      externalThreadKey: 'web:thread:2',
      status: 'disabled',
      createdAt: '2026-04-15T03:01:00.000Z',
    },
    new Date('2026-04-15T03:01:00.000Z'),
  ).core;

  const filtered = listTransportBindings(core, {
    platforms: ['telegram'],
    directions: ['bidirectional'],
    statuses: ['active'],
    conversationIds: ['conversation-1'],
    participantIds: ['participant-1'],
    agentIds: ['actor-agent-1'],
    externalThreadKeys: ['telegram:thread:1'],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'transport-binding-1');
});

test('listTransportBindings sorts by updatedAt descending and applies limit', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      createdAt: '2026-04-15T03:10:00.000Z',
    },
    new Date('2026-04-15T03:10:00.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-2',
      platform: 'telegram',
      direction: 'bidirectional',
      createdAt: '2026-04-15T03:11:00.000Z',
    },
    new Date('2026-04-15T03:11:00.000Z'),
  ).core;

  const limited = listTransportBindings(core, {
    platforms: ['telegram'],
    limit: 1,
  });

  assert.equal(limited.length, 1);
  assert.equal(limited[0].id, 'transport-binding-2');
});
