import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreContainer,
  upsertCoreConversation,
  upsertCoreParticipant,
} from '../build/server/core/model/index.js';

test('core structural record helpers persist containers, conversations, and participants', () => {
  let core = createDefaultCoreState();

  core = upsertCoreContainer(
    core,
    {
      id: 'container-1',
      kind: 'chat_root',
      title: 'Chat Root',
      createdAt: '2026-04-14T22:00:00.000Z',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Primary conversation',
      kind: 'direct_message',
      status: 'active',
      containerId: 'container-1',
      participantActorIds: ['actor-owner', 'actor-orchestrator-global'],
      createdAt: '2026-04-14T22:01:00.000Z',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  core = upsertCoreParticipant(
    core,
    {
      id: 'participant-1',
      conversationId: 'conversation-1',
      agentId: 'actor-orchestrator-global',
      role: 'assistant',
      joinedAt: '2026-04-14T22:02:00.000Z',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;

  assert.equal(core.containers.length, 1);
  assert.equal(core.containers[0].title, 'Chat Root');
  assert.equal(core.conversations.length, 1);
  assert.equal(core.conversations[0].kind, 'direct_message');
  assert.equal(core.conversations[0].containerId, 'container-1');
  assert.equal(core.participants.length, 1);
  assert.equal(core.participants[0].agentId, 'actor-orchestrator-global');
});
