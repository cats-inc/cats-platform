import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { waitForCondition } from './testUtils.js';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  assignCatToChannel,
  createCat,
  createChannel,
  renameChannel,
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
  state = renameChannel(state, group, 'Release\u202E plan\u0007', at(399));
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
  assert.ok(['awake', 'asleep'].includes(mochi.lane.presence), 'awake or asleep, nothing finer');
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
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'owner' }), 'Plan');
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'manual' }), null,
    'manual is the creation default and older data, not proof the owner set it');
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'draft' }), null);
  assert.equal(readOwnerSetTitle({ title: 'Plan', titleSource: 'catlas' }), null);
  assert.equal(readOwnerSetTitle({ title: 'Plan' }), null, 'an unknown source is not the owner');
  assert.equal(readOwnerSetTitle({ title: '  ', titleSource: 'owner' }), null);
  // K3 creates conversations titled with the owner's goal text, and gets the default.
  const created = createChannel(createDefaultChatState(), { title: 'GOAL-TEXT', topic: '', originSurface: 'chat' }, NOW);
  assert.equal(readOwnerSetTitle(created.channels.find((entry) => entry.id === created.selectedChannelId)), null);
  const renamed = renameChannel(created, created.selectedChannelId, 'Owner title', NOW);
  assert.equal(readOwnerSetTitle(renamed.channels.find((entry) => entry.id === created.selectedChannelId)), 'Owner title');
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
  assert.deepEqual(Object.keys(release).sort(), ['conversationId', 'createdAt', 'redacted', 'surface'],
    'only hidden Cats take part, so the conversation shows as surface, id and age');
  assert.equal(release.redacted, true);

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
  // Newest first, as the workflow keeps it.
  channel.roomRouting.workflow.turnHistory = [
    turn(30, 'completed', ids.mochi),
    turn(60, 'failed', ids.kiki),
    turn(90, 'failed', ids.mochi),
    turn(120, 'cancelled', ids.kiki),
    turn(60 * 24 * 8, 'failed', ids.kiki),
  ];
  const board = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW });
  assert.deepEqual(board.cats.find((cat) => cat.catId === ids.kiki).problems,
    [{ conversationId: group, failed: 1, interrupted: 1 }]);
  assert.deepEqual(board.cats.find((cat) => cat.catId === ids.mochi).problems, [],
    'a later completed turn settles the earlier failure');
});

test('SPEC-139 FR-3: pending owner approvals on the Cat conversations are counted', () => {
  const { state, ids, group, code } = fixture();
  const conversationId = (channelId) => `conversation-channel-${channelId}`;
  const task = (id, channelId, status) => ({ id, conversationId: conversationId(channelId), approval: { status } });
  const core = {
    tasks: [task('t-1', group, 'pending'), task('t-2', group, 'approved'), task('t-3', code, 'pending'),
      { id: 't-4', conversationId: null, approval: { status: 'pending' } }],
    approvalBindings: [{ approvalTaskId: 't-4', conversationId: conversationId(group) }],
  };
  const board = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW, core });
  assert.equal(board.cats.find((cat) => cat.catId === ids.mochi).waitingApprovals, 2, 'group: t-1 and the bound t-4');
  assert.equal(board.cats.find((cat) => cat.catId === ids.kiki).waitingApprovals, 3, 'group and code');
});

test('SPEC-139 FR-3 and Privacy: a direct lane leaves its Cat only as presence, message times and own initiative', () => {
  const { state, ids, lane, group } = fixture();
  const laneChannel = state.channels.find((entry) => entry.id === lane);
  const turn = (id, minutesAgo, targetStatus) => ({ id, status: targetStatus === 'running' ? 'running' : 'completed',
    sourceMessageId: 'm', sourceSenderKind: 'user', sourceSenderName: 'Owner', guard: null, stageId: 'dispatch',
    workflowShape: 'sequential', reviewRequired: false, lastCheckpointId: null, convergeTargetId: null,
    continuationCount: 0, dispatchCount: 1,
    targetStatuses: [{ status: targetStatus, participant: { participantKind: 'cat', participantId: ids.mochi, participantName: 'x' } }],
    events: [], startedAt: at(minutesAgo).toISOString(), updatedAt: at(minutesAgo).toISOString(), completedAt: null });
  laneChannel.roomRouting.workflow.activeTurn = turn('lane-running', 1, 'running');
  laneChannel.roomRouting.workflow.turnHistory = [turn('lane-failed', 15, 'failed'), turn('lane-cancelled', 16, 'cancelled')];
  laneChannel.messages.push({ ...laneChannel.messages.at(-1), id: 'lane-choice', createdAt: at(10).toISOString(),
    choices: [{ question: 'LANE-CHOICE-MARKER', options: [{ id: 'a', label: 'LANE-OPTION-MARKER' }] }] });
  const conversationId = (channelId) => `conversation-channel-${channelId}`;
  const core = {
    tasks: [{ id: 'lane-task', conversationId: conversationId(lane), approval: { status: 'pending' } },
      { id: 'lane-bound', conversationId: null, approval: { status: 'pending' } }],
    approvalBindings: [{ approvalTaskId: 'lane-bound', conversationId: conversationId(lane) }],
  };
  const setLaneLease = (status) => {
    for (const assignment of [...(laneChannel.participantAssignments ?? []), ...(laneChannel.catAssignments ?? [])]) {
      if (assignment.execution?.lease) Object.assign(assignment.execution.lease, { status, sessionId: 'lane-session' });
    }
  };
  setLaneLease('error');

  const board = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW, core });
  const mochi = board.cats.find((cat) => cat.catId === ids.mochi);
  assert.equal(mochi.turnRunning, false, 'a turn running in its direct lane is not shown');
  assert.deepEqual(mochi.problems, [], 'nor its failed or interrupted turns there');
  assert.equal(mochi.waitingChoices, 0, 'nor a choice waiting there');
  assert.equal(mochi.waitingApprovals, 0, 'nor an approval for it, by its own conversation or a binding');
  assert.equal(mochi.lane.lastOwnerMessageAt, at(30).toISOString(), 'its message times stay');
  assert.equal(mochi.lane.presence, 'asleep', 'a failing lane reads as asleep, not as an error');
  assert.equal(JSON.stringify(board).includes(lane), false, 'the lane is not named anywhere on the board');
  assert.doesNotMatch(JSON.stringify(board), /MARKER/u);
  setLaneLease('ready');
  assert.equal(buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW, core }).cats
    .find((cat) => cat.catId === ids.mochi).lane.presence, 'awake');

  // The same Cat's group conversations still count.
  const groupChannel = state.channels.find((entry) => entry.id === group);
  groupChannel.roomRouting.workflow.turnHistory = [turn('group-failed', 20, 'failed')];
  groupChannel.roomRouting.workflow.activeTurn = turn('group-running', 2, 'running');
  core.tasks.push({ id: 'group-task', conversationId: conversationId(group), approval: { status: 'pending' } });
  const again = buildBossCatBoard({ state, bossCatId: ids.boss, now: NOW, core }).cats.find((cat) => cat.catId === ids.mochi);
  assert.equal(again.turnRunning, true, 'a turn running in a group conversation still shows');
  assert.deepEqual(again.problems, [{ conversationId: group, failed: 1, interrupted: 0 }]);
  assert.equal(again.waitingApprovals, 1);
});

test('SPEC-139 FR-3: a one-to-one conversation is like a direct lane: who and when, never its turns, choices or approvals', () => {
  const { state, ids } = fixture();
  let next = createChannel(state, { title: 'Solo work', topic: '', originSurface: 'code' }, at(200));
  const solo = next.selectedChannelId;
  next = renameChannel(next, solo, 'Solo work', at(199));
  next = assignCatToChannel(next, solo, { catId: ids.kiki, provider: 'codex' }, at(200));
  next = appendMessage(next, solo, { senderKind: 'user', senderName: 'Owner', body: 'SOLO-OWNER-MARKER' }, at(25)).state;
  next = appendMessage(next, solo, { senderKind: 'agent', senderName: 'Kiki', body: 'SOLO-CHOICE-MARKER' }, at(24), {
    metadata: { targetId: ids.kiki }, choices: [{ question: 'SOLO-QUESTION-MARKER', options: [{ id: 'a', label: 'x' }] }],
  }).state;
  const channel = next.channels.find((entry) => entry.id === solo);
  const turn = (id, minutesAgo, status) => ({ id, status: status === 'running' ? 'running' : 'completed',
    sourceMessageId: 'm', sourceSenderKind: 'user', sourceSenderName: 'Owner', guard: null, stageId: 'dispatch',
    workflowShape: 'sequential', reviewRequired: false, lastCheckpointId: null, convergeTargetId: null,
    continuationCount: 0, dispatchCount: 1,
    targetStatuses: [{ status, participant: { participantKind: 'cat', participantId: ids.kiki, participantName: 'x' } }],
    events: [], startedAt: at(minutesAgo).toISOString(), updatedAt: at(minutesAgo).toISOString(), completedAt: null });
  channel.roomRouting.workflow.activeTurn = turn('solo-running', 1, 'running');
  channel.roomRouting.workflow.turnHistory = [turn('solo-failed', 20, 'failed')];
  const core = { tasks: [{ id: 'solo-task', conversationId: `conversation-channel-${solo}`, approval: { status: 'pending' } }],
    approvalBindings: [] };

  const board = buildBossCatBoard({ state: next, bossCatId: ids.boss, now: NOW, core });
  const kiki = board.cats.find((cat) => cat.catId === ids.kiki);
  assert.equal(kiki.problems.some((problem) => problem.conversationId === solo), false, 'its failed turn does not count');
  assert.equal(kiki.waitingChoices, 1, 'only the choice in the shared group counts');
  assert.equal(kiki.waitingApprovals, 0, 'nor its approval');
  assert.equal(kiki.turnRunning, false, 'nor its running turn');
  const entry = board.groups.find((group) => group.conversationId === solo);
  assert.deepEqual(entry, {
    conversationId: solo, surface: 'code', createdAt: at(200).toISOString(), redacted: false, oneToOne: true,
    title: 'Solo work', participantNames: ['Kiki'], bossCatIsMember: false,
    lastOwnerMessageAt: at(25).toISOString(), lastMessageAt: at(24).toISOString(),
  }, 'it stays on the board, so it can be joined, with who and when only');
  assert.doesNotMatch(JSON.stringify(board), /SOLO-.*MARKER/u);

  // A second Cat makes it shared, and its turns count again.
  next = assignCatToChannel(next, solo, { catId: ids.mochi, provider: 'claude' }, at(10));
  Object.assign(next.channels.find((entry) => entry.id === solo).roomRouting.workflow,
    { activeTurn: turn('solo-running', 1, 'running'), turnHistory: [turn('solo-failed', 20, 'failed')] });
  const shared = buildBossCatBoard({ state: next, bossCatId: ids.boss, now: NOW, core });
  assert.equal(shared.groups.find((group) => group.conversationId === solo).oneToOne, undefined);
  assert.deepEqual(shared.cats.find((cat) => cat.catId === ids.kiki).problems.find((problem) => problem.conversationId === solo),
    { conversationId: solo, failed: 1, interrupted: 0 });
});

test('SPEC-139 FR-3: a real failed turn shows on the Cat and the group', async (t) => {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-boss-board-'));
  const chatStore = new MemoryChatStore();
  let state = await chatStore.read();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, NOW);
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, NOW);
  state = createCat(state, { name: 'Nono', provider: 'codex' }, NOW);
  const bossId = state.cats.find((cat) => cat.name === 'Boss').id;
  const kikiId = state.cats.find((cat) => cat.name === 'Kiki').id;
  const nonoId = state.cats.find((cat) => cat.name === 'Nono').id;
  state = createChannel(state, { title: 'Build', topic: '', originSurface: 'chat', repoPath: platformDir }, NOW);
  const groupId = state.selectedChannelId;
  // Two Cats, so the conversation is shared and its turns count (FR-3).
  state = assignCatToChannel(state, groupId, { catId: kikiId, provider: 'codex' }, NOW);
  state = assignCatToChannel(state, groupId, { catId: nonoId, provider: 'codex' }, NOW);
  await chatStore.write(state);
  const runtimeClient = {
    async getHealth() { return { reachable: true, status: 'ok', version: '0.3.1' }; },
    async getProviderDiagnostics() { return { providers: [] }; },
    async getProviderConfig() { return {}; },
    async createSession(input) {
      return { id: 'kiki-session', provider: input.provider, model: input.model, status: 'ready', cwd: platformDir };
    },
    async observeSession(id) { return { session: { id, status: 'ready', provider: 'codex', model: 'fixture', cwd: platformDir } }; },
    async closeSession() {}, async cancelSession() {},
    async sendMessage() { throw new Error('ERROR-TEXT-MARKER'); },
  };
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '', platformDir, chatStatePath: join(platformDir, 'state/chat.json'), runtimeDataDir: join(platformDir, 'runtime') },
  runtimeClient }, chat: { chatStore } });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); await rm(platformDir, { recursive: true, force: true }); });
  const kiki = state.channels.find((entry) => entry.id === groupId).participantAssignments
    .find((assignment) => assignment.catId === kikiId || assignment.sourceRefId === kikiId);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/channels/${groupId}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'Run the build.', messageMetadata: { recipientParticipantIds: [kiki.participantId] } }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  await waitForCondition(async () => {
    const channel = (await chatStore.read()).channels.find((entry) => entry.id === groupId);
    return !channel.roomRouting.workflow.activeTurn && channel.roomRouting.workflow.turnHistory.length > 0;
  }, { timeoutMs: 15_000 });
  const board = buildBossCatBoard({ state: await chatStore.read(), bossCatId: bossId, now: new Date() });
  assert.doesNotMatch(JSON.stringify(board), /ERROR-TEXT-MARKER/u);
  assert.deepEqual(board.cats.find((cat) => cat.catId === kikiId).problems,
    [{ conversationId: groupId, failed: 1, interrupted: 0 }]);
  const build = board.groups.find((entry) => entry.conversationId === groupId);
  assert.equal(build.turnFailed, true);
  assert.equal(build.turnRunning, false);
});
