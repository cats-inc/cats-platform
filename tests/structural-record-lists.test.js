import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreContainer,
  upsertCoreConversation,
  upsertCoreParticipant,
} from '../build/server/core/model/index.js';
import {
  listContainers,
  listConversations,
  listParticipants,
} from '../build/server/core/structuralRecordLists.js';

test('structural record lists filter containers, conversations, and participants', () => {
  let core = createDefaultCoreState();

  core = upsertCoreContainer(
    core,
    {
      id: 'container-1',
      kind: 'chat_root',
      title: 'Chat root',
      status: 'active',
      parentContainerId: 'container-parent',
      createdAt: '2026-04-15T05:20:00.000Z',
    },
    new Date('2026-04-15T05:20:00.000Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Primary conversation',
      kind: 'direct_message',
      status: 'active',
      containerId: 'container-1',
      participantActorIds: ['actor-owner', 'actor-worker'],
      sourceChannelId: 'channel-1',
      repoPath: 'C:/repo-one',
      responseLanguage: 'en',
      createdAt: '2026-04-15T05:21:00.000Z',
    },
    new Date('2026-04-15T05:21:00.000Z'),
  ).core;

  core = upsertCoreParticipant(
    core,
    {
      id: 'participant-1',
      conversationId: 'conversation-1',
      agentId: 'actor-worker',
      role: 'assistant',
      status: 'active',
      joinedAt: '2026-04-15T05:22:00.000Z',
    },
    new Date('2026-04-15T05:22:00.000Z'),
  ).core;

  const containers = listContainers(core, {
    kinds: ['chat_root'],
    statuses: ['active'],
    parentContainerIds: ['container-parent'],
  });
  assert.equal(containers.length, 1);
  assert.equal(containers[0].id, 'container-1');

  const conversations = listConversations(core, {
    kinds: ['direct_message'],
    statuses: ['active'],
    containerIds: ['container-1'],
    participantActorIds: ['actor-worker'],
    sourceChannelIds: ['channel-1'],
    repoPaths: ['C:/repo-one'],
    responseLanguages: ['en'],
  });
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].id, 'conversation-1');

  const participants = listParticipants(core, {
    conversationIds: ['conversation-1'],
    agentIds: ['actor-worker'],
    roles: ['assistant'],
    statuses: ['active'],
  });
  assert.equal(participants.length, 1);
  assert.equal(participants[0].id, 'participant-1');
});
