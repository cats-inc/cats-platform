import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  assignCatToChannel,
  buildChannelView,
  createCat,
  createChannel,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  BOSS_CREATE_GROUP,
  BOSS_JOIN_CONVERSATION,
  BOSS_LEAVE_CONVERSATION,
  BOSS_STATUS_BOARD,
  bossCatToolDescriptors,
  isBossCatGroupGuest,
  boundBossCatBoard,
  readBossCatTurnRecord,
  resolveBossCatTurnGate,
  runBossCatDecisionLoop,
} from '../build/server/products/chat/state/bossCatSurface.js';
import { resolveRuntimeEnvelopeForTarget } from '../build/server/products/chat/state/runtimeTargeting.js';
import { normalizeChatState } from '../build/server/products/chat/state/chat-snapshot/index.js';
import { buildCanonicalChatUserMessage } from '../build/server/products/chat/state/chatCoreInterop.js';
import { createAuthenticatedTestSession, createTestAuthConfig, waitForCondition } from './testUtils.js';

const NOW = new Date('2026-11-11T12:00:00.000Z');

/** Boss (admin) with its own lane, Kiki in a group, and Mochi with a lane of its own. */
function world(now = NOW) {
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, now);
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, now);
  state = createCat(state, { name: 'Mochi', provider: 'claude' }, now);
  const id = (name) => state.cats.find((cat) => cat.name === name).id;
  const ids = { boss: id('Boss'), kiki: id('Kiki'), mochi: id('Mochi') };
  const lane = (catId) => {
    state = createChannel(state, { title: 'Lane', topic: '', originSurface: 'chat',
      roomMode: 'direct_message', defaultRecipientId: catId }, now);
    const laneId = state.selectedChannelId;
    state = assignCatToChannel(state, laneId, { catId, provider: 'claude' }, now);
    return laneId;
  };
  const bossLane = lane(ids.boss);
  const mochiLane = lane(ids.mochi);
  state = appendMessage(state, bossLane, { senderKind: 'user', senderName: 'Owner', body: 'LANE-HISTORY-MARKER?' }, now).state;
  state = appendMessage(state, bossLane, { senderKind: 'agent', senderName: 'Boss', body: 'LANE-REPLY-MARKER' }, now,
    { metadata: { targetId: ids.boss } }).state;
  state = appendMessage(state, mochiLane, { senderKind: 'user', senderName: 'Owner', body: 'MOCHI-LANE-MARKER' }, now).state;
  state = createChannel(state, { title: 'Build', topic: 'GROUP-TOPIC-MARKER', originSurface: 'chat' }, now);
  const group = state.selectedChannelId;
  state = assignCatToChannel(state, group, { catId: ids.kiki, provider: 'codex' }, now);
  state = assignCatToChannel(state, group, { catId: ids.boss, provider: 'claude' }, now);
  state = appendMessage(state, group, { senderKind: 'user', senderName: 'Owner', body: 'GROUP-MESSAGE-MARKER' }, now).state;
  state.selectedChannelId = bossLane;
  return { state, ids, bossLane, mochiLane, group };
}

const ownerMessage = (channelId, body, ownerStarted = 'desktop') => ({
  id: 'message-1', channelId, senderKind: 'user', senderName: 'Owner', body, mentions: [],
  metadata: ownerStarted ? { ownerStarted } : {}, usage: null, createdAt: NOW.toISOString(),
});

test('SPEC-139 FR-1: the tools are offered only for an owner-started turn in the Boss Cat own lane', () => {
  const { state, ids, bossLane, mochiLane, group } = world();
  assert.equal(resolveBossCatTurnGate(state, bossLane, ownerMessage(bossLane, 'Who is stuck?')).bossCatId, ids.boss);
  assert.equal(resolveBossCatTurnGate(state, bossLane, ownerMessage(bossLane, 'Who is stuck?', 'mobile')).bossCatId, ids.boss);
  assert.equal(resolveBossCatTurnGate(state, bossLane, ownerMessage(bossLane, 'Who is stuck?', null)), null,
    'no stamp: Telegram, dispatch, schedules, heartbeats and other Cats');
  assert.equal(resolveBossCatTurnGate(state, bossLane, { ...ownerMessage(bossLane, 'A'),
    choiceResponse: { sourceMessageId: 'x', status: 'submitted', answers: [], submittedAt: NOW.toISOString() } }), null);
  assert.equal(resolveBossCatTurnGate(state, bossLane, { ...ownerMessage(bossLane, 'hi'), senderKind: 'agent' }), null);
  assert.equal(resolveBossCatTurnGate(state, bossLane, ownerMessage(bossLane, '/work plan')), null);
  assert.equal(resolveBossCatTurnGate(state, mochiLane, ownerMessage(mochiLane, 'Who is stuck?')), null, 'not an admin');
  assert.equal(resolveBossCatTurnGate(state, group, ownerMessage(group, 'Who is stuck?')), null, 'never in a group');
  assert.equal(resolveBossCatTurnGate(state, bossLane, ownerMessage(mochiLane, 'Who is stuck?')), null);
  const archived = structuredClone(state);
  archived.channels.find((entry) => entry.id === bossLane).status = 'archived';
  assert.equal(resolveBossCatTurnGate(archived, bossLane, ownerMessage(bossLane, 'Who is stuck?')), null);
  const demoted = structuredClone(state);
  demoted.cats.find((cat) => cat.id === ids.boss).group = 'standard';
  assert.equal(resolveBossCatTurnGate(demoted, bossLane, ownerMessage(bossLane, 'Who is stuck?')), null);
});

function createGroup(input) {
  return { contractVersion: 1, kind: 'tool_request', decisionId: 'create-group', confidence: 'high',
    toolName: BOSS_CREATE_GROUP, target: { kind: 'worker_tool', toolName: BOSS_CREATE_GROUP }, input,
    expectedOutputSchemaRef: { id: `${BOSS_CREATE_GROUP}.output`, version: '1.0', format: 'json_schema' },
    rationaleSummary: 'The owner asked for a group.' };
}

/** Reads the board this session received and picks Cats from it by name. */
function boardCatIds(envelope, ...names) {
  const board = envelope.toolResults?.find((entry) => entry.toolName === BOSS_STATUS_BOARD)?.result?.result;
  return names.map((name) => board?.cats.find((cat) => cat.name === name)?.catId ?? `missing-${name}`);
}

function decision(kind) {
  if (kind === 'garbage') return 'not a decision';
  return kind === 'board'
    ? { contractVersion: 1, kind: 'tool_request', decisionId: 'read-board', confidence: 'high',
      toolName: BOSS_STATUS_BOARD, target: { kind: 'worker_tool', toolName: BOSS_STATUS_BOARD }, input: {},
      expectedOutputSchemaRef: { id: `${BOSS_STATUS_BOARD}.output`, version: '1.0', format: 'json_schema' },
      rationaleSummary: 'The owner asked about other Cats.' }
    : { contractVersion: 1, kind: 'semantic_plan', decisionId: 'respond', planId: 'respond', confidence: 'high',
      rationaleSummary: 'Nothing to read.', steps: [{ stepId: 'respond', summary: 'Reply.', action: 'respond' }] };
}

function runtime(platformDir, { decide = () => decision('board'), failLane = false } = {}) {
  const calls = { decisionCreates: [], decisionSends: [], ordinaryCreates: [], laneSends: [], closed: [], cancelled: [], failLane };
  return {
    calls,
    async getHealth() { return { reachable: true, status: 'ok', version: '0.3.1' }; },
    async getProviderDiagnostics() { return { providers: [] }; },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) {
      return { provider, backend: 'cli', instance: 'default', defaultModel: null, source: 'config', cache: null, models: [], warnings: [] };
    },
    async createSession(input) {
      if (input.context?.reason === 'chat-boss-cat-decision-session') {
        calls.decisionCreates.push(input);
        return { id: 'decision-session', provider: input.provider, model: input.model, status: 'ready', cwd: null };
      }
      if (input.context?.source === 'automation') {
        // Any other decision (companion posts, Work intake) answers with a plain respond.
        return { id: 'other-decision-session', provider: input.provider, model: input.model, status: 'ready', cwd: null };
      }
      const id = `session-${calls.ordinaryCreates.length + 1}`;
      calls.ordinaryCreates.push({ id, input });
      return { id, provider: input.provider, model: input.model, status: 'ready', cwd: input.cwd ?? platformDir };
    },
    async observeSession(id) { return { session: { id, status: 'ready', provider: 'claude', model: 'fixture', cwd: platformDir } }; },
    async cancelSession(id) { calls.cancelled.push(id); },
    async closeSession(id) { calls.closed.push(id); },
    async sendMessage(sessionId, content, options) {
      if (sessionId === 'decision-session') {
        calls.decisionSends.push(content);
        const value = await decide(calls.decisionSends.length - 1, JSON.parse(content));
        if (typeof value === 'string') {
          return { segments: [{ kind: 'text', text: value, toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
        }
        return { segments: [{ kind: 'text', text: JSON.stringify(value), toolName: null, toolId: null }],
          inputTokens: 10, outputTokens: 10, tokensUsed: 20 };
      }
      if (sessionId === 'other-decision-session') {
        return { segments: [{ kind: 'text', text: JSON.stringify(decision('respond')), toolName: null, toolId: null }],
          inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
      }
      calls.laneSends.push({ sessionId, content, instructions: options?.instructions ?? '' });
      if (calls.failLane) throw new Error('Injected lane failure.');
      return { segments: [{ kind: 'text', text: 'Lane reply.', toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
    },
  };
}

async function start(t, { withAuth = true, decisionEnabled = true, seed, ...runtimeOptions } = {}) {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-boss-tools-'));
  const authConfig = withAuth ? createTestAuthConfig() : undefined;
  const auth = withAuth
    ? await createAuthenticatedTestSession({ now: new Date(), sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs })
    : null;
  const chatStore = new MemoryChatStore();
  const fixture = world(new Date());
  seed?.(fixture.state);
  await chatStore.write(fixture.state);
  // In the app `chatStatePath` is a file; evidence must not be written beneath it.
  await mkdir(join(platformDir, 'state'), { recursive: true });
  await writeFile(join(platformDir, 'state/chat.json'), '{}');
  const runtimeClient = runtime(platformDir, runtimeOptions);
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '', platformDir, chatStatePath: join(platformDir, 'state/chat.json'), runtimeDataDir: join(platformDir, 'runtime'),
    chatProviderAgentDecisionEnabled: decisionEnabled, ...(authConfig ? { auth: authConfig } : {}) },
  ...(auth ? { authStore: auth.authStore } : {}), runtimeClient }, chat: { chatStore } });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); await rm(platformDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:8181',
    ...(auth ? { cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken } : {}) };
  const laneMessages = async () => (await chatStore.read()).channels.find((entry) => entry.id === fixture.bossLane).messages;
  const send = async (body) => {
    const before = runtimeClient.calls.laneSends.length;
    const response = await fetch(`${base}/api/channels/${fixture.bossLane}/messages`, { method: 'POST', headers, body: JSON.stringify({ body }) });
    assert.equal(response.status, 200, await response.clone().text());
    const { message } = await response.json();
    await waitForCondition(async () => runtimeClient.calls.laneSends.length > before
      && !(await chatStore.read()).channels.find((entry) => entry.id === fixture.bossLane).roomRouting.workflow.activeTurn,
    { timeoutMs: 15_000 });
    return message.id;
  };
  return { ...fixture, base, headers, chatStore, platformDir, calls: runtimeClient.calls, laneMessages, send };
}

test('SPEC-139 FR-1/FR-2: an isolated session reads the board, and the lane reply receives it', async (t) => {
  const h = await start(t);
  const messageId = await h.send('Which Cats need my attention?');

  assert.equal(h.calls.decisionCreates.length, 1);
  const created = h.calls.decisionCreates[0];
  assert.equal(created.workspaceKind, 'sandbox');
  assert.equal(created.workspaceAccess, 'read_only');
  assert.equal(created.permissionMode, 'default');
  assert.equal(created.sharingMode, 'isolated');
  assert.deepEqual(created.skills, { requestedSkills: [], strict: true });
  assert.equal(created.cwd, undefined);
  // The board call, then one more where the board-bound tools are offered; the stub declines.
  assert.deepEqual(h.calls.decisionSends.map((content) =>
    JSON.parse(content).observation.availableTools.map((entry) => entry.manifest.name)),
  [[BOSS_STATUS_BOARD], [BOSS_CREATE_GROUP, BOSS_JOIN_CONVERSATION, BOSS_LEAVE_CONVERSATION]]);
  const decisionInput = h.calls.decisionSends.join('\n');
  assert.match(decisionInput, /Which Cats need my attention\?/u);
  assert.doesNotMatch(decisionInput, /LANE-HISTORY-MARKER|LANE-REPLY-MARKER|GROUP-MESSAGE-MARKER|MOCHI-LANE-MARKER/u);
  assert.deepEqual(h.calls.closed.filter((id) => id === 'decision-session'), ['decision-session']);

  const lane = h.calls.laneSends.at(-1);
  assert.match(lane.instructions, /Status board \(JSON\)/u);
  assert.match(lane.instructions, /"name":"Kiki"/u);
  assert.doesNotMatch(lane.instructions, /GROUP-MESSAGE-MARKER|GROUP-TOPIC-MARKER|MOCHI-LANE-MARKER/u);

  const source = (await h.laneMessages()).find((message) => message.id === messageId);
  assert.equal(source.metadata.ownerStarted, 'desktop');
  assert.equal(source.metadata.bossCatTurn.receipts[0].status, 'applied');
  assert.equal(source.metadata.bossCatTurn.receipts[0].board, undefined, 'a settled reply drops the stored board');
  assert.equal((await h.chatStore.read()).bossCatUsage.filter((entry) => entry.kind === 'board').length, 1);

  // FR-16: the supervision record names the call with ids only.
  const evidence = await readFile(join(h.platformDir, 'state/evidence',
    `conversation-channel-${h.bossLane}.jsonl`), 'utf8');
  assert.match(evidence, /chat\.boss\.status_board/u);
  assert.doesNotMatch(evidence, /Kiki|Mochi|Which Cats/u);
});

test('SPEC-139 FR-2: the 31st board within an hour is refused, and the reply is told so', async (t) => {
  const h = await start(t, { seed: (state) => {
    state.bossCatUsage = Array.from({ length: 30 }, () => ({ kind: 'board', at: new Date().toISOString() }));
  } });
  const messageId = await h.send('Which Cats need my attention?');
  const receipt = (await h.laneMessages()).find((message) => message.id === messageId).metadata.bossCatTurn.receipts[0];
  assert.deepEqual([receipt.status, receipt.reason, receipt.board], ['refused', 'rate_limited', undefined]);
  assert.match(h.calls.laneSends.at(-1).instructions, /chat\.boss\.status_board: refused \(rate_limited\)/u);
  assert.equal((await h.chatStore.read()).bossCatUsage.length, 30);
});

test('SPEC-139 FR-1: no tools without an authenticated owner, with the flag off, or when the Boss Cat declines', async (t) => {
  for (const options of [{ withAuth: false }, { decisionEnabled: false }, { decide: () => decision('respond') }]) {
    const h = await start(t, options);
    const messageId = await h.send('Which Cats need my attention?');
    if (!options.decide) assert.equal(h.calls.decisionCreates.length, 0, JSON.stringify(options));
    assert.doesNotMatch(h.calls.laneSends.at(-1).instructions, /Status board/u);
    const source = (await h.laneMessages()).find((message) => message.id === messageId);
    assert.equal(source.metadata.bossCatTurn, undefined);
  }
});

test('SPEC-139: a retry replays the receipts and calls no tool again', async (t) => {
  const h = await start(t, { failLane: true });
  const messageId = await h.send('Which Cats need my attention?');
  assert.equal(h.calls.decisionCreates.length, 1);
  const failedSends = h.calls.laneSends.length;
  h.calls.failLane = false;
  const retry = await fetch(`${h.base}/api/channels/${h.bossLane}/messages/${messageId}/retry`, { method: 'POST', headers: h.headers });
  assert.equal(retry.status, 200, await retry.clone().text());
  await waitForCondition(() => h.calls.laneSends.length > failedSends, { timeoutMs: 15_000 });
  assert.equal(h.calls.decisionCreates.length, 1, 'no second decision session');
  assert.match(h.calls.laneSends.at(-1).instructions, /Status board \(JSON\)/u);
  assert.equal((await h.chatStore.read()).bossCatUsage.length, 1);
});

test('SPEC-139: a malformed decision closes its session, and the reply still arrives', async (t) => {
  const h = await start(t, { decide: () => decision('garbage') });
  const messageId = await h.send('Which Cats need my attention?');
  assert.equal(h.calls.decisionCreates.length, 1);
  assert.ok(h.calls.closed.includes('decision-session'));
  assert.ok(h.calls.cancelled.includes('decision-session'), 'a stopped decision is cancelled first');
  assert.doesNotMatch(h.calls.laneSends.at(-1).instructions, /Status board/u);
  const source = (await h.laneMessages()).find((message) => message.id === messageId);
  assert.equal(source.metadata.bossCatTurn, undefined);
});

test('SPEC-139: a decision that never answers stops at its deadline and closes its session', async () => {
  const { state, ids, bossLane } = world();
  const calls = { cancelled: [], closed: [] };
  const runtimeClient = {
    async createSession() { return { id: 'decision-session', status: 'ready' }; },
    async sendMessage() { return new Promise(() => {}); },
    async cancelSession(id) { calls.cancelled.push(id); },
    async closeSession(id) { calls.closed.push(id); },
  };
  const started = Date.now();
  const record = await runBossCatDecisionLoop({
    channelId: bossLane, sourceMessageId: 'message-1', bossCatId: ids.boss,
    observation: { observationId: 'o', runId: 'r', availableTools: bossCatToolDescriptors(),
      actor: { actorRef: `cat:${ids.boss}` }, policy: { dials: { toolScope: 'read_only' } },
      budget: { maxDurationMs: 50, hardStop: true } },
    runtimeClient,
    readState: async () => state,
    updateState: async (mutate) => mutate(state),
    request: async (_observation, runtime) => {
      const created = await runtime.createSession({});
      return runtime.sendMessage(created.id, 'x');
    },
  });
  assert.equal(record, null);
  assert.ok(Date.now() - started < 3_000);
  assert.deepEqual(calls.cancelled, ['decision-session']);
  assert.deepEqual(calls.closed, ['decision-session']);
});

test('SPEC-139: a Desktop retry of a message that was not owner-started runs no tool', async (t) => {
  const h = await start(t, { failLane: true, decide: () => decision('respond') });
  const messageId = await h.send('Which Cats need my attention?');
  // As if it had come from Telegram: the stored message carries no stamp.
  const state = await h.chatStore.read();
  delete state.channels.find((entry) => entry.id === h.bossLane).messages
    .find((message) => message.id === messageId).metadata.ownerStarted;
  await h.chatStore.write(state);
  const decisions = h.calls.decisionCreates.length;
  const failedSends = h.calls.laneSends.length;
  h.calls.failLane = false;
  const retry = await fetch(`${h.base}/api/channels/${h.bossLane}/messages/${messageId}/retry`, { method: 'POST', headers: h.headers });
  assert.equal(retry.status, 200, await retry.clone().text());
  await waitForCondition(() => h.calls.laneSends.length > failedSends, { timeoutMs: 15_000 });
  assert.equal(h.calls.decisionCreates.length, decisions);
  const source = (await h.laneMessages()).find((message) => message.id === messageId);
  assert.equal(source.metadata.ownerStarted, undefined);
  assert.equal(source.metadata.bossCatTurn, undefined);
});

const withGroup = (input) => (index, envelope) => index === 0 ? decision('board')
  : createGroup(typeof input === 'function' ? input(envelope) : input);

test('SPEC-139 FR-5: create_group makes a blank read-only Chat group that waits for the owner', async (t) => {
  const h = await start(t, { decide: withGroup((envelope) => ({ title: 'Release check',
    catIds: boardCatIds(envelope, 'Kiki', 'Mochi'), openingMessage: 'Kiki and Mochi, let us review the release.' })) });
  const messageId = await h.send('Start a group with Kiki and Mochi about the release.');
  const state = await h.chatStore.read();
  const receipts = state.channels.find((entry) => entry.id === h.bossLane).messages
    .find((message) => message.id === messageId).metadata.bossCatTurn.receipts;
  assert.deepEqual(receipts.map((receipt) => [receipt.toolName, receipt.status]),
    [[BOSS_STATUS_BOARD, 'applied'], [BOSS_CREATE_GROUP, 'applied']]);
  const group = state.channels.find((entry) => entry.id === receipts[1].conversationId);
  assert.equal(group.originSurface, 'chat');
  assert.equal(group.repoPath ?? null, null);
  assert.equal(group.chatCwd ?? null, null);
  assert.equal(group.runtimeWorkspaceAccess, 'read_only');
  assert.equal(group.runtimePermissionMode, 'default');
  assert.deepEqual(group.bossCatGroup.bossCatId, h.ids.boss);
  const active = group.participantAssignments.filter((entry) => entry.status === 'active');
  assert.deepEqual(active.map((entry) => entry.sourceRefId ?? entry.participantId).sort(),
    [h.ids.boss, h.ids.kiki, h.ids.mochi].sort());
  assert.equal(group.coordinatorParticipantId, active.find((entry) => (entry.sourceRefId ?? entry.participantId) === h.ids.boss).participantId);
  assert.deepEqual(group.messages.filter((message) => message.senderKind !== 'system')
    .map((message) => [message.senderKind, message.senderName, message.body]),
    [['agent', 'Boss', 'Kiki and Mochi, let us review the release.']]);
  assert.equal(group.roomRouting.workflow.activeTurn, null, 'R1: nothing is dispatched until the owner writes');
  assert.equal(h.calls.ordinaryCreates.some(({ input }) => JSON.stringify(input).includes(group.id)), false,
    'no session opens for the group before the owner writes');
  assert.equal(state.selectedChannelId, h.bossLane, 'the owner stays where they were');
  assert.ok(state.channels.find((entry) => entry.id === h.bossLane).messages
    .some((message) => message.metadata?.event === 'boss_cat_group_created' && message.metadata.conversationId === group.id));
  assert.equal(state.bossCatUsage.filter((entry) => entry.kind === 'group').length, 1);
  assert.match(h.calls.laneSends.at(-1).instructions, new RegExp(`create_group: applied\\. The group conversation ${group.id}`, 'u'));
  // A retry of the message rebuilt from Core finds the tools already ran.
  const rebuilt = buildCanonicalChatUserMessage(await h.chatStore.readCore(), h.bossLane, messageId);
  assert.equal(readBossCatTurnRecord(rebuilt)?.bossCatId, h.ids.boss);
  // R2: the invited Cats carry no companion memory in it; the Boss Cat itself is not a guest.
  assert.equal(isBossCatGroupGuest(group, h.ids.kiki), true);
  assert.equal(isBossCatGroupGuest(group, h.ids.boss), false);
  assert.equal(isBossCatGroupGuest({}, h.ids.kiki), false);
  assert.deepEqual(buildChannelView(state, group.id).bossCatGroup, group.bossCatGroup, 'the prompt path sees the marker');
  assert.deepEqual(normalizeChatState(JSON.parse(JSON.stringify(state))).channels
    .find((entry) => entry.id === group.id).bossCatGroup, group.bossCatGroup, 'the marker survives a reload');

  // The owner writes to Kiki in the group: the session Runtime receives is read-only with
  // default permissions and no repository, and Kiki's prompt carries the opening message.
  const kiki = active.find((entry) => (entry.sourceRefId ?? entry.participantId) === h.ids.kiki);
  const sendsBefore = h.calls.laneSends.length;
  const response = await fetch(`${h.base}/api/channels/${group.id}/messages`, { method: 'POST', headers: h.headers,
    body: JSON.stringify({ body: 'Kiki, start with the changelog.', messageMetadata: { recipientParticipantIds: [kiki.participantId] } }) });
  assert.equal(response.status, 200, await response.clone().text());
  await waitForCondition(() => h.calls.laneSends.length > sendsBefore, { timeoutMs: 15_000 });
  const groupSession = h.calls.ordinaryCreates.find(({ input }) => JSON.stringify(input).includes(group.id));
  assert.ok(groupSession, 'a session opened for the group once the owner wrote');
  assert.equal(groupSession.input.workspaceAccess, 'read_only');
  assert.equal(groupSession.input.permissionMode, 'default');
  assert.equal(groupSession.input.repoPath ?? null, null);
  assert.ok(!String(groupSession.input.cwd ?? '').includes('cats-platform'));
  const groupSend = h.calls.laneSends.find((entry) => entry.sessionId === groupSession.id);
  assert.match(`${groupSend.content}\n${groupSend.instructions}`, /let us review the release/u);
});

test('SPEC-139 R2: an invited Cat hydrates no companion memory in a Boss Cat group, as it would elsewhere', async () => {
  const { state, ids } = world();
  state.cats.find((cat) => cat.id === ids.kiki).roles = ['companion'];
  const companionStore = {
    async getBoxSummary() { return { box: { sourceIds: [], derivedIds: [] } }; },
    async buildSessionContext() { return { ownerNotes: ['COMPANION-NOTE-MARKER'] }; },
  };
  const hydrated = async (bossGroup) => {
    let next = createChannel(state, { title: 'Group', topic: '', originSurface: 'chat',
      participantCatIds: [ids.boss, ids.kiki] }, NOW);
    const channelId = next.selectedChannelId;
    if (bossGroup) next.channels.find((entry) => entry.id === channelId).bossCatGroup = { bossCatId: ids.boss, createdAt: NOW.toISOString() };
    const view = buildChannelView(next, channelId);
    const kiki = view.assignedParticipants.find((entry) => (entry.sourceRefId ?? entry.participantId) === ids.kiki);
    const envelope = await resolveRuntimeEnvelopeForTarget(next, view,
      { participantKind: 'cat', participantId: kiki.participantId, participantName: kiki.name }, undefined, null, NOW, companionStore);
    return JSON.stringify(envelope.companionSession ?? null);
  };
  assert.match(await hydrated(false), /COMPANION-NOTE-MARKER/u, 'positive control: an ordinary group carries the note');
  assert.doesNotMatch(await hydrated(true), /COMPANION-NOTE-MARKER/u);
});

test('SPEC-139: a full board fits the decision session envelope, attention first', () => {
  const iso = NOW.toISOString();
  const name = (index) => `${'N'.repeat(76)}${String(index).padStart(4, '0')}`;
  const cats = Array.from({ length: 60 }, (_, index) => ({ catId: `cat-${index}`, name: name(index), hidden: false,
    group: 'standard', lane: { presence: 'sleeping', lastOwnerMessageAt: iso, lastCatMessageAt: iso },
    initiative: null, turnRunning: false, waitingChoices: 0, waitingApprovals: 0,
    problems: index === 59 ? [{ conversationId: 'c', failed: 1, interrupted: 0 }] : [] }));
  const groups = Array.from({ length: 50 }, (_, index) => ({ conversationId: `g-${index}`, surface: 'chat', createdAt: iso,
    redacted: false, title: name(index), participantNames: [name(1), name(2), name(3)], bossCatIsMember: false,
    lastOwnerMessageAt: iso, lastMessageAt: new Date(NOW.getTime() - index * 1000).toISOString(),
    turnRunning: false, turnFailed: false, waitingChoice: false }));
  const board = boundBossCatBoard({ generatedAt: iso, cats, groups });
  const feedback = [{ toolName: BOSS_STATUS_BOARD, decisionId: 'read-board', result: { status: 'applied', result: board } }];
  assert.ok(JSON.stringify(feedback).length < 24_000 - 2_000, `${JSON.stringify(feedback).length} characters`);
  assert.equal(board.cats[0].catId, 'cat-59', 'the Cat with a failed turn comes first');
  assert.equal(board.groups[0].conversationId, 'g-0', 'the most recent group comes first');
  assert.equal(board.omittedCats + board.cats.length, 60);
  assert.equal(board.omittedGroups + board.groups.length, 50);
});

test('SPEC-139 FR-5/FR-7: ids not on the board, bad input and the sixth group in an hour are refused', async (t) => {
  const cases = [
    [{ title: 'X', catIds: ['cat-not-on-board'], openingMessage: 'Hi' }, 'cats_not_on_board'],
    [(envelope) => ({ title: 'X', catIds: boardCatIds(envelope, 'Boss'), openingMessage: 'Hi' }), 'cats_not_on_board'],
    [(envelope) => ({ title: 'x'.repeat(81), catIds: boardCatIds(envelope, 'Kiki'), openingMessage: 'Hi' }), 'title_invalid'],
    [(envelope) => ({ title: 'X', catIds: boardCatIds(envelope, 'Kiki'), openingMessage: '' }), 'opening_message_invalid'],
    [(envelope) => ({ title: 'X', catIds: boardCatIds(envelope, 'Kiki'), openingMessage: 'Hi', repoPath: '/x' }), 'input_invalid'],
  ];
  for (const [input, reason] of cases) {
    const h = await start(t, { decide: withGroup(input) });
    const channelsBefore = (await h.chatStore.read()).channels.length;
    const messageId = await h.send('Start a group.');
    const receipt = (await h.laneMessages()).find((message) => message.id === messageId).metadata.bossCatTurn.receipts[1];
    assert.deepEqual([receipt.status, receipt.reason], ['refused', reason]);
    assert.equal((await h.chatStore.read()).channels.length, channelsBefore);
  }
  const limited = await start(t, {
    decide: withGroup((envelope) => ({ title: 'X', catIds: boardCatIds(envelope, 'Kiki'), openingMessage: 'Hi' })),
    seed: (state) => { state.bossCatUsage = Array.from({ length: 5 }, () => ({ kind: 'group', at: new Date().toISOString() })); },
  });
  const messageId = await limited.send('Start a group.');
  const receipt = (await limited.laneMessages()).find((message) => message.id === messageId).metadata.bossCatTurn.receipts[1];
  assert.deepEqual([receipt.status, receipt.reason], ['refused', 'rate_limited']);
});

test('SPEC-139 FR-5: create_group is not offered before a board was read in the session', async (t) => {
  const h = await start(t, { decide: () => createGroup({ title: 'X', catIds: ['any'], openingMessage: 'Hi' }) });
  const firstTools = [];
  const messageId = await h.send('Start a group.');
  for (const content of h.calls.decisionSends) {
    firstTools.push(JSON.parse(content).observation.availableTools.map((entry) => entry.manifest.name));
  }
  assert.deepEqual(firstTools[0], [BOSS_STATUS_BOARD]);
  assert.equal((await h.laneMessages()).find((message) => message.id === messageId).metadata.bossCatTurn, undefined);
});

function toolCall(name, input) {
  return { contractVersion: 1, kind: 'tool_request', decisionId: `${name}-${Math.random().toString(36).slice(2, 8)}`,
    confidence: 'high', toolName: name, target: { kind: 'worker_tool', toolName: name }, input,
    expectedOutputSchemaRef: { id: `${name}.output`, version: '1.0', format: 'json_schema' },
    rationaleSummary: 'The owner asked.' };
}

/** Reads the board first, then performs `hooks.action` on `hooks.conversationId` when offered. */
function membershipDecider(hooks) {
  return async (_index, envelope) => {
    const offered = envelope.observation.availableTools.map((entry) => entry.manifest.name);
    if (offered.includes(BOSS_STATUS_BOARD)) return decision('board');
    const tool = hooks.action === 'join' ? BOSS_JOIN_CONVERSATION : BOSS_LEAVE_CONVERSATION;
    if (!offered.includes(tool)) return decision('respond');
    await hooks.beforeAction?.();
    return toolCall(tool, { conversationId: hooks.conversationId });
  };
}

/** A Code conversation, Kiki and Mochi, no coordinator, with an old marker more than 8 messages back. */
function seedOps(hooks, policy = 'allow') {
  return (state) => {
    const ids = Object.fromEntries(state.cats.map((cat) => [cat.name.toLowerCase(), cat.id]));
    const base = Date.now() - 60 * 60_000;
    const next = createChannel(state, { title: 'Ops', topic: '', originSurface: 'code',
      participantCatIds: [ids.kiki, ids.mochi] }, new Date(base));
    const ops = next.channels.find((entry) => entry.id === next.selectedChannelId);
    ops.coordinatorParticipantId = null;
    const kiki = ops.participantAssignments.find((entry) => entry.sourceRefId === ids.kiki || entry.participantId === ids.kiki);
    const at = (minute) => new Date(base + minute * 60_000).toISOString();
    const message = (minute, senderKind, senderName, body, metadata = {}) => ({ id: `ops-${minute}`, channelId: ops.id,
      senderKind, senderName, body, mentions: [], metadata, usage: null, createdAt: at(minute) });
    ops.messages.push(message(1, 'user', 'Owner', 'OLD-MARKER secret plan', { recipientParticipantIds: [kiki.participantId] }));
    ops.messages.push(message(2, 'agent', 'Kiki', 'Kiki heard the plan.', { targetId: kiki.participantId,
      targetKind: 'cat', sessionId: 'kiki-old-session', event: 'assistant_turn_segment' }));
    for (let minute = 3; minute < 15; minute += 1) {
      ops.messages.push(message(minute, 'user', 'Owner', `filler ${minute}`, { recipientParticipantIds: [kiki.participantId] }));
    }
    Object.assign(state, next, { selectedChannelId: state.selectedChannelId });
    state.channels = next.channels;
    // null: the owner never set it, which must read as 「每次問我」.
    if (policy === null) delete state.bossCatJoinPolicy;
    else state.bossCatJoinPolicy = policy;
    hooks.conversationId = ops.id;
    hooks.kikiParticipantId = kiki.participantId;
  };
}

async function sendInConversation(h, channelId, participantId, body) {
  const before = h.calls.laneSends.length;
  const response = await fetch(`${h.base}/api/channels/${channelId}/messages`, { method: 'POST', headers: h.headers,
    body: JSON.stringify({ body, messageMetadata: { recipientParticipantIds: [participantId] } }) });
  assert.equal(response.status, 200, await response.clone().text());
  await waitForCondition(async () => h.calls.laneSends.length > before
    && !(await h.chatStore.read()).channels.find((entry) => entry.id === channelId).roomRouting.workflow.activeTurn,
  { timeoutMs: 15_000 });
  const sessions = new Set(h.calls.ordinaryCreates.filter(({ input }) => JSON.stringify(input).includes(channelId)).map(({ id }) => id));
  return h.calls.laneSends.slice(before).filter((entry) => sessions.has(entry.sessionId))
    .map((entry) => `${entry.content}\n${entry.instructions}`).join('\n');
}

async function replaceSession(h, channelId, catId) {
  const state = await h.chatStore.read();
  const channel = state.channels.find((entry) => entry.id === channelId);
  for (const assignment of [...channel.participantAssignments, ...channel.catAssignments]) {
    if ((assignment.sourceRefId ?? assignment.catId ?? assignment.participantId) !== catId) continue;
    assignment.execution.lease = { ...assignment.execution.lease, sessionId: null, status: 'not_started' };
  }
  await h.chatStore.write(state);
}

const membershipOf = (state, channelId, catId) => state.channels.find((entry) => entry.id === channelId)
  .participantAssignments.find((entry) => entry.status === 'active' && (entry.sourceRefId ?? entry.participantId) === catId);

test('SPEC-139 FR-11/FR-12: a join changes nothing else, and the Boss Cat sees 8 messages before it, in every session', async (t) => {
  const hooks = { action: 'join' };
  const h = await start(t, { seed: seedOps(hooks), decide: membershipDecider(hooks) });
  const stable = (state) => {
    const ops = state.channels.find((entry) => entry.id === hooks.conversationId);
    return JSON.stringify([ops.coordinatorParticipantId, ops.roomRouting.defaultRecipientId, ops.channelKind, ops.status,
      ops.originSurface, ops.repoPath ?? null, ops.chatCwd ?? null, ops.runtimeWorkspaceAccess ?? null,
      ops.runtimePermissionMode ?? null, ops.title, ops.titleSource]);
  };

  // Positive control: Kiki, an ordinary participant, gets the full transcript in a new session.
  await replaceSession(h, hooks.conversationId, h.ids.kiki);
  const kikiSeen = await sendInConversation(h, hooks.conversationId, hooks.kikiParticipantId, 'Kiki, status?');
  assert.match(kikiSeen, /OLD-MARKER/u, 'positive control');
  const before = stable(await h.chatStore.read());

  const messageId = await h.send('Join Ops.');
  let state = await h.chatStore.read();
  const receipt = state.channels.find((entry) => entry.id === h.bossLane).messages
    .find((message) => message.id === messageId).metadata.bossCatTurn.receipts.find((entry) => entry.toolName === BOSS_JOIN_CONVERSATION);
  assert.deepEqual([receipt.status, receipt.conversationId], ['applied', hooks.conversationId]);
  assert.equal(stable(state), before, 'coordinator, audience, workspace, permissions and title are unchanged');
  const ops = state.channels.find((entry) => entry.id === hooks.conversationId);
  assert.ok(ops.messages.some((message) => message.metadata?.event === 'cat_assigned' && message.metadata.catId === h.ids.boss),
    'the conversation shows the join');
  assert.ok(ops.bossCatJoins[h.ids.boss].since);
  assert.ok(state.channels.find((entry) => entry.id === h.bossLane).messages
    .some((message) => message.metadata?.event === 'boss_cat_joined' && message.metadata.conversationId === hooks.conversationId));
  assert.equal(state.bossCatUsage.filter((entry) => entry.kind === 'join_request').length, 1);
  const boss = membershipOf(state, hooks.conversationId, h.ids.boss);

  // First turn, then a replaced session: never the old marker.
  const first = await sendInConversation(h, hooks.conversationId, boss.participantId, 'Q1-AFTER-JOIN');
  assert.match(first, /Q1-AFTER-JOIN/u);
  assert.doesNotMatch(first, /OLD-MARKER/u);
  await replaceSession(h, hooks.conversationId, h.ids.boss);
  const replaced = await sendInConversation(h, hooks.conversationId, boss.participantId, 'Q2-AFTER-REPLACE');
  assert.match(replaced, /Q1-AFTER-JOIN/u, 'a replaced session still carries what came after the join');
  assert.doesNotMatch(replaced, /OLD-MARKER/u);

  // Leave, the owner talks while the Boss Cat is away, then it rejoins.
  hooks.action = 'leave';
  await h.send('Leave Ops.');
  state = await h.chatStore.read();
  assert.equal(membershipOf(state, hooks.conversationId, h.ids.boss), undefined);
  assert.equal(state.channels.find((entry) => entry.id === hooks.conversationId).bossCatJoins, undefined);
  await sendInConversation(h, hooks.conversationId, hooks.kikiParticipantId, 'AWAY-MARKER while the Boss is out');
  for (let index = 0; index < 9; index += 1) {
    await sendInConversation(h, hooks.conversationId, hooks.kikiParticipantId, `away filler ${index}`);
  }
  hooks.action = 'join';
  await h.send('Join Ops again.');
  state = await h.chatStore.read();
  const rejoined = membershipOf(state, hooks.conversationId, h.ids.boss);
  const afterRejoin = await sendInConversation(h, hooks.conversationId, rejoined.participantId, 'Q3-AFTER-REJOIN');
  assert.match(afterRejoin, /Q3-AFTER-REJOIN/u);
  assert.doesNotMatch(afterRejoin, /OLD-MARKER|AWAY-MARKER/u);

  const evidence = await readFile(join(h.platformDir, 'state/evidence', `conversation-channel-${h.bossLane}.jsonl`), 'utf8');
  assert.match(evidence, /"action":"join"/u);
  assert.match(evidence, /"action":"leave"/u);
  assert.match(evidence, new RegExp(`"targetConversationId":"${hooks.conversationId}"`, 'u'));
});

test('SPEC-139 FR-8/FR-9: the policy decides when the join runs, and every refusal holds', async (t) => {
  const outcomes = [];
  const run = async (options) => {
    const hooks = { action: options.action ?? 'join' };
    const h = await start(t, { seed: seedOps(hooks, options.policy), decide: membershipDecider(hooks) });
    if (options.beforeAction) hooks.beforeAction = () => options.beforeAction(h, hooks);
    if (options.prepare) await options.prepare(h, hooks);
    const messageId = await h.send('Do it.');
    const turn = (await h.laneMessages()).find((message) => message.id === messageId).metadata.bossCatTurn;
    const receipt = turn.receipts.find((entry) => entry.toolName !== BOSS_STATUS_BOARD);
    outcomes.push([options.label, receipt.status, receipt.reason]);
    assert.equal(membershipOf(await h.chatStore.read(), hooks.conversationId, h.ids.boss) !== undefined,
      ['already member', 'leave without a join'].includes(options.label), options.label);
  };
  await run({ label: 'ask is the default', policy: null });
  await run({ label: 'never', policy: 'never' });
  await run({ label: 'policy flipped after the board', policy: 'allow', beforeAction: async (h) => {
    const state = await h.chatStore.read(); state.bossCatJoinPolicy = 'never'; await h.chatStore.write(state);
  } });
  await run({ label: 'archived after the board', policy: 'allow', beforeAction: async (h, hooks) => {
    const state = await h.chatStore.read();
    state.channels.find((entry) => entry.id === hooks.conversationId).status = 'archived';
    await h.chatStore.write(state);
  } });
  await run({ label: 'already member', policy: 'allow', prepare: async (h, hooks) => {
    const state = await h.chatStore.read();
    await h.chatStore.write(assignCatToChannel(state, hooks.conversationId, { catId: h.ids.boss }, new Date()));
  } });
  await run({ label: 'rate limited', policy: 'allow', prepare: async (h) => {
    const state = await h.chatStore.read();
    state.bossCatUsage = Array.from({ length: 10 }, () => ({ kind: 'join_request', at: new Date().toISOString() }));
    await h.chatStore.write(state);
  } });
  await run({ label: 'leave without a join', action: 'leave', policy: 'allow', prepare: async (h, hooks) => {
    const state = await h.chatStore.read();
    await h.chatStore.write(assignCatToChannel(state, hooks.conversationId, { catId: h.ids.boss }, new Date()));
  } });
  assert.deepEqual(outcomes, [
    ['ask is the default', 'refused', 'owner_card_required'],
    ['never', 'refused', 'policy_never'],
    ['policy flipped after the board', 'refused', 'policy_never'],
    ['archived after the board', 'refused', 'conversation_archived'],
    ['already member', 'refused', 'already_member'],
    ['rate limited', 'refused', 'rate_limited'],
    ['leave without a join', 'refused', 'not_joined'],
  ]);
});
