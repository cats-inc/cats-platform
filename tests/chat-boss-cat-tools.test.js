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
  createCat,
  createChannel,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  BOSS_STATUS_BOARD,
  bossCatToolDescriptors,
  resolveBossCatTurnGate,
  runBossCatDecisionLoop,
} from '../build/server/products/chat/state/bossCatSurface.js';
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
  const calls = { decisionCreates: [], decisionSends: [], laneSends: [], closed: [], cancelled: [], failLane };
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
      return { id: 'lane-session', provider: input.provider, model: input.model, status: 'ready', cwd: platformDir };
    },
    async observeSession(id) { return { session: { id, status: 'ready', provider: 'claude', model: 'fixture', cwd: platformDir } }; },
    async cancelSession(id) { calls.cancelled.push(id); },
    async closeSession(id) { calls.closed.push(id); },
    async sendMessage(sessionId, content, options) {
      if (sessionId === 'decision-session') {
        calls.decisionSends.push(content);
        const value = decide(calls.decisionSends.length - 1);
        if (typeof value === 'string') {
          return { segments: [{ kind: 'text', text: value, toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
        }
        return { segments: [{ kind: 'text', text: JSON.stringify(decide(calls.decisionSends.length - 1)), toolName: null, toolId: null }],
          inputTokens: 10, outputTokens: 10, tokensUsed: 20 };
      }
      if (sessionId === 'other-decision-session') {
        return { segments: [{ kind: 'text', text: JSON.stringify(decision('respond')), toolName: null, toolId: null }],
          inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
      }
      calls.laneSends.push({ content, instructions: options?.instructions ?? '' });
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
  assert.equal(h.calls.decisionSends.length, 1, 'the board leaves nothing more to decide');
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
