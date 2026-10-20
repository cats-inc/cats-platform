import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  LAST_PARTICIPANT_ERROR,
  archiveCat,
  assignCatToChannel,
  bindChannelCoordinator,
  buildChannelView,
  createCat,
  createChannel,
  rememberNewChatDefaultParticipant,
  removeChannelParticipant,
  setCatGroup,
  updateNewChatDefaults,
} from '../build/server/products/chat/state/model/index.js';
import {
  messageLacksAudience,
  resolveMessageAudienceTargets,
} from '../build/server/products/chat/state/mentionRouter.js';
import {
  isAdminCoordinator,
  targetRoutesOn,
} from '../build/server/products/chat/state/coordinator.js';

const NOW = new Date('2026-10-20T00:00:00.000Z');

function withCats(...names) {
  let state = createDefaultChatState();
  for (const name of names) {
    state = createCat(state, { name, provider: 'claude', model: 'opus' }, NOW);
  }
  const idOf = (name) => state.cats.find((cat) => cat.name === name).id;
  return { state, idOf };
}

function activeParticipants(state, channelId) {
  return buildChannelView(state, channelId).assignedParticipants
    .filter((participant) => participant.status === 'active');
}

function createRoom(state, input = {}) {
  return createChannel(state, { title: 'Room', topic: '', originSurface: 'chat', ...input }, NOW);
}

test('a conversation created without participants starts with the remembered provider/model', () => {
  const state = updateNewChatDefaults(createDefaultChatState(), {
    provider: 'codex', instance: null, model: 'gpt-sol', modelSelection: null,
  });
  const created = createRoom(state);
  const [participant, ...rest] = activeParticipants(created, created.selectedChannelId);

  assert.equal(rest.length, 0);
  assert.equal(participant.sourceKind, 'adhoc');
  assert.equal(participant.execution.target.provider, 'codex');
  assert.equal(participant.execution.target.model, 'gpt-sol');
  assert.equal(buildChannelView(created, created.selectedChannelId).coordinatorParticipantId, participant.participantId);
});

test('a remembered cat is the default participant while it can still chat', () => {
  const { state, idOf } = withCats('Milo');
  const remembered = updateNewChatDefaults(state, { catId: idOf('Milo') });
  const created = createRoom(remembered);

  assert.deepEqual(activeParticipants(created, created.selectedChannelId).map((p) => p.participantId), [idOf('Milo')]);

  const archived = archiveCat(remembered, idOf('Milo'), NOW);
  const fallback = createRoom(archived);
  assert.equal(activeParticipants(fallback, fallback.selectedChannelId)[0].sourceKind, 'adhoc');
});

test('participants keep the requested order, the first is the coordinator and the remembered default', () => {
  const { state, idOf } = withCats('Milo');
  const created = createRoom(state, {
    participantCatIds: [idOf('Milo')],
    temporaryParticipants: [{ participantId: 'aria', name: 'Aria', provider: 'claude', model: 'sonnet' }],
    participantOrder: ['temp:aria', `cat:${idOf('Milo')}`],
  });
  const channelId = created.selectedChannelId;

  assert.deepEqual(activeParticipants(created, channelId).map((p) => p.participantId), ['aria', idOf('Milo')]);
  assert.equal(buildChannelView(created, channelId).coordinatorParticipantId, 'aria');

  const remembered = rememberNewChatDefaultParticipant(created, channelId);
  assert.equal(remembered.newChatDefaults.catId, null);
  assert.equal(remembered.newChatDefaults.model, 'sonnet');

  const catFirst = createRoom(state, { participantCatIds: [idOf('Milo')] });
  assert.equal(rememberNewChatDefaultParticipant(catFirst, catFirst.selectedChannelId).newChatDefaults.catId, idOf('Milo'));
});

test('a cat that rejoins goes to the end, and the participant limit counts everyone', () => {
  const { state, idOf } = withCats('Milo', 'Nova');
  let next = createRoom(state, { participantCatIds: [idOf('Milo'), idOf('Nova')] });
  const channelId = next.selectedChannelId;
  next = removeChannelParticipant(next, channelId, idOf('Milo'), NOW);
  next = assignCatToChannel(next, channelId, { catId: idOf('Milo') }, NOW);

  assert.deepEqual(activeParticipants(next, channelId).map((p) => p.participantId), [idOf('Nova'), idOf('Milo')]);

  const full = { ...next, capabilities: { ...next.capabilities, maxChatParticipants: 2 } };
  const { state: withThird, idOf: idOfThird } = (() => {
    const grown = createCat(full, { name: 'Pip', provider: 'claude' }, NOW);
    return { state: grown, idOf: (name) => grown.cats.find((cat) => cat.name === name).id };
  })();
  assert.throws(
    () => assignCatToChannel(withThird, channelId, { catId: idOfThird('Pip') }, NOW),
    /participant limit/u,
  );
});

test('the last participant cannot leave, and removing the coordinator clears the binding', () => {
  const { state, idOf } = withCats('Milo');
  let next = createRoom(state, {
    participantCatIds: [idOf('Milo')],
    temporaryParticipants: [{ participantId: 'aria', name: 'Aria', provider: 'claude' }],
  });
  const channelId = next.selectedChannelId;
  assert.equal(buildChannelView(next, channelId).coordinatorParticipantId, idOf('Milo'));

  next = removeChannelParticipant(next, channelId, idOf('Milo'), NOW);
  assert.equal(buildChannelView(next, channelId).coordinatorParticipantId, null);
  assert.throws(() => removeChannelParticipant(next, channelId, 'aria', NOW), new RegExp(LAST_PARTICIPANT_ERROR, 'u'));
});

test('a cat leaving a conversation empty brings back the remembered default', () => {
  const { state, idOf } = withCats('Milo');
  const created = createRoom(state, { participantCatIds: [idOf('Milo')] });
  const archived = archiveCat(created, idOf('Milo'), NOW);
  const participants = activeParticipants(archived, created.selectedChannelId);

  assert.equal(participants.length, 1);
  assert.equal(participants[0].sourceKind, 'adhoc');
});

test('the coordinator can move or clear, but a DM stays bound to its cat', () => {
  const { state, idOf } = withCats('Milo', 'Nova');
  let next = createRoom(state, { participantCatIds: [idOf('Milo'), idOf('Nova')] });
  const channelId = next.selectedChannelId;

  next = bindChannelCoordinator(next, channelId, idOf('Nova'));
  assert.equal(buildChannelView(next, channelId).coordinatorParticipantId, idOf('Nova'));
  next = bindChannelCoordinator(next, channelId, null);
  assert.equal(buildChannelView(next, channelId).coordinatorParticipantId, null);
  assert.throws(() => bindChannelCoordinator(next, channelId, 'nobody'), /participant not found/u);

  const dm = createRoom(state, { roomMode: 'direct_message', participantCatIds: [idOf('Milo')], defaultRecipientId: idOf('Milo') });
  assert.equal(buildChannelView(dm, dm.selectedChannelId).coordinatorParticipantId, idOf('Milo'));
  assert.throws(() => bindChannelCoordinator(dm, dm.selectedChannelId, null), /direct message/u);
});

test('a message names its audience: chosen participants, then the ones it mentions', () => {
  const { state, idOf } = withCats('Milo', 'Nova');
  const created = createRoom(state, { participantCatIds: [idOf('Milo'), idOf('Nova')] });
  const channelId = created.selectedChannelId;

  assert.deepEqual(
    resolveMessageAudienceTargets(created, channelId, 'and @Milo too', [idOf('Nova')]).map((t) => t.participantId),
    [idOf('Nova'), idOf('Milo')],
  );
  assert.equal(messageLacksAudience(created, channelId, { body: 'hello', recipientParticipantIds: [] }), true);
  assert.equal(messageLacksAudience(created, channelId, { body: 'hi @Nova' }), false);

  const dm = createRoom(state, { roomMode: 'direct_message', participantCatIds: [idOf('Milo')], defaultRecipientId: idOf('Milo') });
  assert.equal(messageLacksAudience(dm, dm.selectedChannelId, { body: 'hello' }), false);
});

test('only the coordinator routes turns on, and only an admin coordinator acts as a Boss Cat', () => {
  const { state, idOf } = withCats('Boss', 'Milo');
  const grouped = setCatGroup(state, idOf('Boss'), 'admin');
  const created = createRoom(grouped, { participantCatIds: [idOf('Boss'), idOf('Milo')] });
  const channelId = created.selectedChannelId;
  const target = (participantId) => ({ participantKind: 'cat', participantId });

  assert.equal(targetRoutesOn(created, channelId, target(idOf('Boss'))), true);
  assert.equal(targetRoutesOn(created, channelId, target(idOf('Milo'))), false);
  assert.equal(isAdminCoordinator(created, channelId, idOf('Boss')), true);
  assert.equal(isAdminCoordinator(created, channelId, idOf('Milo')), false);

  const milosRoom = bindChannelCoordinator(created, channelId, idOf('Milo'));
  assert.equal(isAdminCoordinator(milosRoom, channelId, idOf('Milo')), false);
  assert.equal(isAdminCoordinator(milosRoom, channelId, idOf('Boss')), false);
});

test('every conversation belongs to the platform owner, also when an old snapshot lacks it', async () => {
  const room = createRoom(createDefaultChatState());
  assert.equal(buildChannelView(room, room.selectedChannelId).ownerActorId, 'actor-owner');

  const { normalizeChatState } = await import('../build/server/products/chat/state/chat-snapshot/index.js');
  const snapshot = structuredClone(room);
  delete snapshot.channels[0].ownerActorId;
  assert.equal(normalizeChatState(snapshot).channels[0].ownerActorId, 'actor-owner');
});
