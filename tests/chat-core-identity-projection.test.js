import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildChatAssignedParticipantId,
  buildChatConversationId,
  buildChatOwnerParticipantId,
  buildChatParallelGroupContainerId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';
import {
  createChannel,
  createCat,
  createParallelChatGroup,
} from '../build/server/products/chat/state/model/index.js';
import { FileChatStore } from '../build/server/products/chat/state/store.js';

test('ChatStore projects direct-lane participants, temporary participant actors, and chat containers', async () => {
  const store = new FileChatStore(
    path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-core-projection-')), 'chat-state.json'),
  );
  const now = new Date('2026-04-14T00:00:00.000Z');
  let state = await store.read();

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion Direct',
      topic: 'Direct lanes should stay owner-to-cat in core projection.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );
  const directChannelId = state.selectedChannelId;

  state = createChannel(
    state,
    {
      title: 'Inline Review',
      topic: 'Temporary participants should materialize as chat participant actors.',
      temporaryParticipants: [
        {
          participantId: 'participant-inline',
          name: 'Inline Reviewer',
          provider: 'gemini',
          roleHint: 'Counterpoint',
        },
      ],
      skipBossCatGreeting: true,
    },
    now,
  );
  const temporaryChannelId = state.selectedChannelId;

  state = createParallelChatGroup(
    state,
    {
      title: 'Peer Code',
      targets: [
        { provider: 'claude', instance: null, model: 'claude-default' },
        { provider: 'gemini', instance: null, model: 'gemini-default' },
      ],
    },
    now,
  );
  const parallelGroupId = state.parallelChatGroups[0]?.id ?? null;

  await store.write(state);
  const core = await store.readCore();

  const directConversationId = buildChatConversationId(directChannelId);
  const directConversation = core.conversations.find(
    (conversation) => conversation.id === directConversationId,
  );
  assert.ok(directConversation);
  assert.equal(directConversation.kind, 'direct_message');
  assert.ok(directConversation.participantActorIds.includes('actor-owner'));
  assert.ok(directConversation.participantActorIds.includes(`actor-cat-${companionId}`));
  assert.ok(
    !directConversation.participantActorIds.includes('actor-orchestrator-global'),
    'direct lanes should not project the global orchestrator as a visible participant',
  );

  assert.ok(
    core.participants.some((participant) =>
      participant.id === buildChatOwnerParticipantId(directChannelId)
      && participant.conversationId === directConversationId
      && participant.agentId === 'actor-owner'),
  );
  assert.ok(
    core.participants.some((participant) =>
      participant.id === buildChatAssignedParticipantId(directChannelId, companionId)
      && participant.agentId === `actor-cat-${companionId}`),
  );

  const temporaryConversationId = buildChatConversationId(temporaryChannelId);
  const temporaryActor = core.actors.find((actor) => actor.source === 'chat_participant');
  assert.ok(temporaryActor);
  assert.equal(temporaryActor.name, 'Inline Reviewer');
  assert.ok(
    core.participants.some((participant) =>
      participant.conversationId === temporaryConversationId
      && participant.agentId === temporaryActor.id),
  );

  const rootContainer = core.containers.find((container) => container.id === CHAT_ROOT_CONTAINER_ID);
  assert.ok(rootContainer);
  assert.equal(rootContainer.kind, 'chat_root');
  assert.ok(rootContainer.metadata.channelIds.includes(directChannelId));

  assert.ok(parallelGroupId);
  const parallelContainer = core.containers.find((container) =>
    container.id === buildChatParallelGroupContainerId(parallelGroupId));
  assert.ok(parallelContainer);
  assert.equal(parallelContainer.kind, 'parallel_group');
  assert.equal(parallelContainer.parentContainerId, CHAT_ROOT_CONTAINER_ID);
});
