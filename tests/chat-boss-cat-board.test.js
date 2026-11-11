import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  assignCatToChannel,
  createCat,
  createChannel,
} from '../build/server/products/chat/state/model/index.js';
import { normalizeChatCat } from '../build/server/products/chat/state/chat-snapshot/entities.js';
import {
  BOSS_CAT_BOARD_TEXT_LIMIT,
  buildBossCatBoard,
  readOwnerSetTitle,
  sanitizeBoardText,
} from '../build/server/products/chat/state/bossCatBoard.js';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000);

/** Boss (admin), Mochi (companion) and Kiki, with a lane, a group and a Code conversation. */
function fixture() {
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, at(600));
  state = createCat(state, { name: 'Mochi', provider: 'claude', roles: ['companion'] }, at(600));
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, at(600));
  const id = (name) => state.cats.find((cat) => cat.name === name).id;
  const ids = { boss: id('Boss'), mochi: id('Mochi'), kiki: id('Kiki') };

  state = createChannel(state, { title: 'LANE-TITLE-MARKER', topic: 'LANE-TOPIC-MARKER', originSurface: 'chat',
    roomMode: 'direct_message', defaultRecipientId: ids.mochi }, at(500));
  const lane = state.selectedChannelId;
  state = assignCatToChannel(state, lane, { catId: ids.mochi, provider: 'claude' }, at(500));
  state = appendMessage(state, lane, { senderKind: 'user', senderName: 'Owner', body: 'LANE-OWNER-MARKER' }, at(30)).state;
  state = appendMessage(state, lane, { senderKind: 'agent', senderName: 'Mochi', body: 'LANE-CAT-MARKER' }, at(20),
    { metadata: { targetId: ids.mochi } }).state;

  state = createChannel(state, { title: 'Release‮ plan\u0007', topic: 'GROUP-TOPIC-MARKER', originSurface: 'chat',
    repoPath: '/REPO-PATH-MARKER' }, at(400));
  const group = state.selectedChannelId;
  for (const catId of [ids.mochi, ids.kiki]) state = assignCatToChannel(state, group, { catId, provider: 'claude' }, at(400));
  state = appendMessage(state, group, { senderKind: 'user', senderName: 'Owner', body: 'GROUP-OWNER-MARKER' }, at(15)).state;
  state = appendMessage(state, group, { senderKind: 'agent', senderName: 'Kiki', body: 'CHOICE-BODY-MARKER' }, at(10), {
    metadata: { targetId: ids.kiki },
    choices: [{ question: 'CHOICE-QUESTION-MARKER', options: [{ id: 'a', label: 'CHOICE-OPTION-MARKER' }] }],
  }).state;
  state = appendMessage(state, group, { senderKind: 'system', senderName: 'Runtime', body: 'ERROR-TEXT-MARKER' }, at(5),
    { metadata: { event: 'runtime_error' } }).state;

  state = createChannel(state, { title: 'Drafted from a message', topic: '', originSurface: 'code', titleSource: 'draft' }, at(300));
  const code = state.selectedChannelId;
  state = assignCatToChannel(state, code, { catId: ids.kiki, provider: 'codex' }, at(300));
  state = assignCatToChannel(state, code, { catId: ids.boss, provider: 'claude' }, at(300));
  return { state, ids, lane, group, code };
}

test('SPEC-139 FR-3/FR-4: the board has every field and no message text', () => {
  const { state, ids, lane, group, code } = fixture();
  const board = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW,
    lifeProfiles: new Map([[ids.mochi, { enabled: true, mode: 'auto', enabledAt: null }]]) });
  const text = JSON.stringify(board);
  assert.doesNotMatch(text, /MARKER/u, 'no message, topic, choice, error or path text');

  assert.deepEqual(board.cats.map((cat) => cat.name).sort(), ['Kiki', 'Mochi'], 'the Boss Cat is not on its own board');
  const mochi = board.cats.find((cat) => cat.catId === ids.mochi);
  assert.equal(mochi.hidden, false);
  assert.equal(mochi.lane.lastOwnerMessageAt, at(30).toISOString());
  assert.equal(mochi.lane.lastCatMessageAt, at(20).toISOString());
  assert.ok(['sleeping', 'waking_up', 'awake', 'error'].includes(mochi.lane.presence));
  assert.deepEqual(mochi.initiative, { mode: 'companion', unanswered: 0, waitingForOwner: false });
  const kiki = board.cats.find((cat) => cat.catId === ids.kiki);
  assert.equal(kiki.lane, null);
  assert.equal(kiki.initiative, null);
  assert.equal(kiki.waitingChoices, 1, 'the choice card Kiki posted waits for the owner');
  assert.equal(mochi.waitingChoices, 0);

  assert.equal(board.groups.some((entry) => entry.conversationId === lane), false, 'direct lanes are not groups');
  const release = board.groups.find((entry) => entry.conversationId === group);
  assert.equal(release.title, 'Release plan', 'control and bidi-override characters are removed');
  assert.equal(release.surface, 'chat');
  assert.deepEqual(release.participantNames.sort(), ['Kiki', 'Mochi']);
  assert.equal(release.bossCatIsMember, false);
  assert.equal(release.lastOwnerMessageAt, at(15).toISOString());
  assert.equal(release.lastMessageAt, at(5).toISOString());
  assert.equal(release.waitingChoice, true);
  assert.equal(release.turnRunning, false);
  const drafted = board.groups.find((entry) => entry.conversationId === code);
  assert.equal(drafted.title, null, 'a drafted title counts as message text');
  assert.equal(drafted.surface, 'code');
  assert.equal(drafted.bossCatIsMember, true);
  assert.deepEqual(drafted.participantNames, ['Kiki']);
});

test('SPEC-139 FR-4: only owner-set titles, cut to 80 characters', () => {
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'manual' }), 'Plan');
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'draft' }), null);
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'catlas' }), null);
  assert.equal(readOwnerSetTitle({ title: 'Plan' }), null, 'an unknown source is not the owner');
  assert.equal(readOwnerSetTitle({ title: '  ', titleSource: 'manual' }), null);
  const long = sanitizeBoardText('貓'.repeat(200));
  assert.equal(Array.from(long).length, BOSS_CAT_BOARD_TEXT_LIMIT);
  assert.equal(sanitizeBoardText('a⁦b⁩\nc‏'), 'a b c');
});

test('SPEC-139 FR-15: a hidden Cat shows only its name, and leaves group participant lists', () => {
  const { state, ids, group } = fixture();
  for (const cat of state.cats) if (cat.id !== ids.boss) cat.hiddenFromBossCat = true;
  const board = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW });
  for (const cat of board.cats) assert.deepEqual(Object.keys(cat).sort(), ['catId', 'hidden', 'name']);
  const release = board.groups.find((entry) => entry.conversationId === group);
  assert.deepEqual(release.participantNames, []);
  assert.equal(release.title, null, 'only hidden Cats take part, so the conversation shows as surface, id and age');

  // Only Kiki hidden: Mochi stays, and the owner-set title stays.
  for (const cat of state.cats) delete cat.hiddenFromBossCat;
  state.cats.find((cat) => cat.id === ids.kiki).hiddenFromBossCat = true;
  const partial = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW });
  const partialRelease = partial.groups.find((entry) => entry.conversationId === group);
  assert.deepEqual(partialRelease.participantNames, ['Mochi']);
  assert.equal(partialRelease.title, 'Release plan');
});

test('SPEC-139 FR-15: the visibility switch survives a persist and reload, absent meaning visible', () => {
  const { state, ids } = fixture();
  const kiki = state.cats.find((cat) => cat.id === ids.kiki);
  assert.equal(normalizeChatCat(JSON.parse(JSON.stringify(kiki))).hiddenFromBossCat, undefined);
  assert.equal(normalizeChatCat(JSON.parse(JSON.stringify({ ...kiki, hiddenFromBossCat: true }))).hiddenFromBossCat, true);
  assert.equal(normalizeChatCat(JSON.parse(JSON.stringify({ ...kiki, hiddenFromBossCat: 'yes' }))).hiddenFromBossCat, undefined);
});

test('SPEC-139 FR-3: failed and interrupted turns of the last 7 days, per conversation', () => {
  const { state, ids, group } = fixture();
  const channel = state.channels.find((entry) => entry.id === group);
  const turn = (minutesAgo, targetStatus, catId) => ({ id: `turn-${minutesAgo}`, status: 'completed', sourceMessageId: 'm',
    sourceSenderKind: 'user', sourceSenderName: 'Owner', guard: null, stageId: 'dispatch', workflowShape: 'sequential',
    reviewRequired: false, lastCheckpointId: null, convergeTargetId: null, continuationCount: 0, dispatchCount: 1,
    targetStatuses: [{ status: targetStatus, participant: { participantKind: 'cat', participantId: catId, participantName: 'x' } }],
    events: [], startedAt: at(minutesAgo).toISOString(), updatedAt: at(minutesAgo).toISOString(), completedAt: null });
  channel.roomRouting.workflow.turnHistory = [
    turn(60, 'failed', ids.kiki),
    turn(120, 'cancelled', ids.kiki),
    turn(60 * 24 * 8, 'failed', ids.kiki),
    turn(90, 'failed', ids.mochi),
  ];
  const board = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW });
  assert.deepEqual(board.cats.find((cat) => cat.catId === ids.kiki).problems,
    [{ conversationId: group, failed: 1, interrupted: 1 }]);
  assert.deepEqual(board.cats.find((cat) => cat.catId === ids.mochi).problems,
    [{ conversationId: group, failed: 1, interrupted: 0 }]);
});
