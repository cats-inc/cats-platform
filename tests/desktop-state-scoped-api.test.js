import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../build/server/app/server/index.js';
import { loadConfig } from '../build/server/config.js';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { normalizeImportedChatSnapshot } from '../build/server/products/chat/state/store.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { createChannel, removeChannelParticipant, updateChannelParticipant } from '../build/server/products/chat/state/model/index.js';
import { mergePreparedParticipantMutation, updateConversationState } from '../build/server/products/chat/api/scopedConversationState.js';
import { maybeAutoResumeRecoveredCatContinuation } from '../build/server/products/chat/api/routeContinuationRecovery.js';
import { buildWorkflowContinuationReplayRequest, readWorkflowContinuationReplay } from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import { createWorkflowEvent, createWorkflowTurn } from '../build/server/products/chat/state/room-routing/workflow.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { createAuthenticatedTestSession, createTestAuthConfig } from './testUtils.js';

async function fixture(t, { grouped = false, temporary = false, runtimeSessions = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-scoped-api '));
  const config = loadConfig({ HOME: root, CATS_PLATFORM_DIR: path.join(root, 'platform') });
  config.auth = createTestAuthConfig();
  const now = new Date('2026-11-13T00:00:00Z');
  const auth = await createAuthenticatedTestSession({ now, sessionSecret: config.auth.sessionSecret, sessionTtlMs: config.auth.sessionTtlMs });
  let source = snapshot();
  if (!grouped) source.chat.parallelChatGroups = [];
  if (temporary) {
    source.chat = createChannel(source.chat, { originSurface: 'chat', title: 'Temporary', topic: '',
      temporaryParticipants: [
        { participantId: 'lead', name: 'Lead', provider: 'codex' },
        { participantId: 'other', name: 'Other', provider: 'claude' },
      ], skipBossCatGreeting: true }, now);
  }
  // This is a new synthetic world, not an edit of an imported Core relationship.
  source = normalizeImportedChatSnapshot(source.chat); source.setupCompleteAt = now.toISOString();
  await mkdir(path.dirname(config.chatStatePath), { recursive: true });
  await writeFile(config.chatStatePath, JSON.stringify(source));
  let checkpoint;
  const store = new DatabaseChatStore(config.chatStatePath, { checkpoint: phase => checkpoint?.(phase) }); await store.initialize();
  const runtimeCalls = [];
  const runtimeClient = {
    async getHealth() { return { reachable: false, status: 'unavailable' }; },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) { return { provider, backend: 'cli', instance: 'default', defaultModel: `${provider}-default`,
      source: 'config', cache: null, models: [{ id: `${provider}-default`, label: 'Fixture', default: true }], warnings: [] }; },
    async createSession(input) {
      runtimeCalls.push('create');
      if (!runtimeSessions) throw Error('Unexpected Runtime create');
      return { id: 'fixture-new-session', provider: input.provider, model: input.model ?? null, status: 'ready',
        cwd: input.cwd ?? path.join(root, 'runtime-fixture-session') };
    },
    async sendMessage() { runtimeCalls.push('send'); throw Error('Unexpected Runtime send'); },
    async closeSession(id) { runtimeCalls.push(['close', id]); },
  };
  const server = createServer({ shared: { config, authStore: auth.authStore, now: () => now, runtimeClient },
    chat: { chatStore: store, startCompanionLifeLoop: false } });
  t.after(async () => {
    await server.closeAppHosting(); await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  await server.startupRecovery; await server.appHostingReady(); runtimeCalls.length = 0;
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = 'GET', body) => fetch(`${url}${route}`, { method,
    headers: { cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const [id, other] = source.chat.channels.map(channel => channel.id);
  const noGlobal = () => {
    store.read = async () => { throw Error('Scoped API read all transcripts'); };
    store.updateSnapshot = async () => { throw Error('Scoped API wrote a global snapshot'); };
  };
  return { root, config, source, store, id, other, request, noGlobal, runtimeCalls, runtimeClient, setCheckpoint(value) { checkpoint = value; } };
}

async function ok(response, status = 200) {
  const text = await response.text(); assert.equal(response.status, status, text); return JSON.parse(text);
}

test('metadata, rename, coordinator, participant and scope routes ignore malformed sibling messages', async t => {
  const f = await fixture(t); f.noGlobal();
  const db = openStateDatabase({ file: databasePath(f.config.chatStatePath), mode: 'writer' });
  db.run('update messages set json = ? where channel_id = ?', '{malformed sibling', f.other);
  const before = db.all('select id, json from messages where channel_id = ?', f.other); db.close();
  assert.equal((await ok(await f.request('/api/channels'))).channels.length, 2);
  await ok(await f.request(`/api/channels/${f.id}`, 'PATCH', { title: 'Renamed' }));
  const channel = await f.store.readChannel(f.id), participant = channel.catAssignments[0].participantId;
  await ok(await f.request(`/api/channels/${f.id}`, 'PATCH', { coordinatorParticipantId: participant }));
  await ok(await f.request(`/api/channels/${f.id}/participants/${participant}`, 'PATCH', { model: 'scoped-model' }));
  const description = await ok(await f.request(`/api/channels/${f.id}/product-scope`));
  const raised = await ok(await f.request(`/api/channels/${f.id}/product-scope`, 'POST', { target: 'work', revision: description.revision }));
  assert.equal(raised.scope, 'work');
  assert.equal((await f.store.readChannel(f.id)).catAssignments[0].execution.target.model, 'scoped-model');
  await ok(await f.request(`/api/channels/${f.id}/work-project`));
  const check = openStateDatabase({ file: databasePath(f.config.chatStatePath), mode: 'reader' });
  try { assert.deepEqual(check.all('select id, json from messages where channel_id = ?', f.other), before); }
  finally { check.close(); }
});

test('same and trimmed member renames retain group membership and reject unrelated group changes atomically', async t => {
  const f = await fixture(t, { grouped: true }); f.noGlobal();
  const initial = await f.store.readCatalog(), title = initial.headers.find(channel => channel.id === f.id).title;
  for (const value of [title, ` ${title} `, 'New group title', 'New group title']) {
    await ok(await f.request(`/api/channels/${f.id}`, 'PATCH', { title: value }));
    const current = await f.store.readCatalog();
    assert.equal(current.metadata.parallelChatGroups[0].title, value.trim());
    assert.deepEqual(current.metadata.parallelChatGroups[0].memberChannelIds, initial.metadata.parallelChatGroups[0].memberChannelIds);
  }
  const before = await readFile(f.config.chatStatePath);
  await assert.rejects(f.store.updateChannel(f.id, (channel, context) => {
    const metadata = structuredClone(context.chat); metadata.parallelChatGroups[0].memberChannelIds = [f.id];
    channel.title = 'Refused'; return { channel, metadata };
  }), /scoped channel mutation/);
  assert.deepEqual(await readFile(f.config.chatStatePath), before);
  assert.equal((await f.store.readChannelHeader(f.id)).title, 'New group title');
});

test('cat add, retarget, remove and reactivate persist through the scoped owner path', async t => {
  const f = await fixture(t); f.noGlobal();
  const channel = await f.store.readChannel(f.id), catId = (await f.store.readChannel(f.other)).catAssignments[0].catId;
  const originalId = channel.catAssignments[0].participantId;
  await ok(await f.request(`/api/channels/${f.id}/cats/${catId}`, 'PUT', {}), 201);
  let added = (await f.store.readChannel(f.id)).catAssignments.find(assignment => assignment.catId === catId);
  assert.equal(added.status, 'active');
  await ok(await f.request(`/api/channels/${f.id}/cats/${catId}`, 'PUT', { provider: 'codex', model: 'owner-target' }));
  added = (await f.store.readChannel(f.id)).catAssignments.find(assignment => assignment.catId === catId);
  assert.equal(added.execution.target.provider, 'codex'); assert.equal(added.execution.target.model, 'owner-target');
  await ok(await f.request(`/api/channels/${f.id}/participants/${originalId}`, 'DELETE'));
  assert.equal((await f.store.readChannel(f.id)).catAssignments.find(assignment => assignment.participantId === originalId).status, 'removed');
  const originalCatId = channel.catAssignments[0].catId;
  await ok(await f.request(`/api/channels/${f.id}/cats/${originalCatId}`, 'PUT', {}));
  assert.equal((await f.store.readChannel(f.id)).catAssignments.find(assignment => assignment.catId === originalCatId).status, 'active');
});

test('prepared temporary removal retains a concurrent append and conflicts with a concurrent participant edit', async t => {
  const f = await fixture(t, { temporary: true }); f.noGlobal();
  const baseline = await f.store.readChannelState(f.id);
  const prepared = removeChannelParticipant(baseline, f.id, 'lead', new Date('2026-11-13T00:01:00Z'));
  const append = { id: 'concurrent-message', channelId: f.id, senderKind: 'user', senderName: 'Owner', body: 'Concurrent',
    mentions: [], metadata: { keep: true }, usage: null, createdAt: '2026-11-13T00:02:00Z' };
  await f.store.updateChannel(f.id, channel => { channel.messages.push(append); channel.updatedAt = append.createdAt; return { channel }; });
  await updateConversationState(f.store, f.id, state => ({ ...state, channels: [mergePreparedParticipantMutation(
    state.channels[0], baseline.channels[0], prepared.channels.find(channel => channel.id === f.id))] }));
  let current = await f.store.readChannel(f.id);
  assert.ok(current.messages.some(message => message.id === append.id));
  assert.equal(current.participantAssignments.find(assignment => assignment.participantId === 'lead').status, 'removed');
  const fresh = await f.store.readChannelState(f.id);
  const pending = updateChannelParticipant(fresh, f.id, 'other', { name: 'Prepared name' });
  await updateConversationState(f.store, f.id, state => updateChannelParticipant(state, f.id, 'other', { name: 'Concurrent name' }));
  await assert.rejects(updateConversationState(f.store, f.id, state => ({ ...state, channels: [mergePreparedParticipantMutation(
    state.channels[0], fresh.channels[0], pending.channels[0])] })), { code: 'conversation_changed' });
  current = await f.store.readChannel(f.id);
  assert.equal(current.participantAssignments.find(assignment => assignment.participantId === 'other').name, 'Concurrent name');
});

test('a conflicting prepared participant update preserves the newer membership and closes only its uncommitted session', async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const workspace = path.join(f.root, 'workspace'); await mkdir(workspace);
  await f.store.updateChannel(f.id, channel => { channel.repoPath = workspace; return { channel }; });
  const original = f.store.updateChannel.bind(f.store);
  const catId = (await f.store.readChannel(f.other)).catAssignments[0].catId;
  let injected = false;
  f.store.updateChannel = async (id, mutator) => {
    if (id === f.id && f.runtimeCalls.includes('create') && !injected) {
      injected = true;
      await original(id, channel => { channel.catAssignments[0].roles = ['reviewer']; return { channel }; });
    }
    return original(id, mutator);
  };
  f.noGlobal();
  const response = await f.request(`/api/channels/${f.id}/cats/${catId}`, 'PUT', {});
  assert.equal(response.status, 409, await response.clone().text());
  assert.equal((await response.json()).error.code, 'conversation_changed');
  assert.ok(injected); assert.ok(f.runtimeCalls.some(call => Array.isArray(call) && call[1] === 'fixture-new-session'));
  const current = await f.store.readChannel(f.id);
  assert.ok(!current.catAssignments.some(assignment => assignment.catId === catId));
  assert.deepEqual(current.catAssignments[0].roles, ['reviewer']);
});

test('participant cleanup recovers a durable handoff and retains the session already attached by that commit', async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const workspace = path.join(f.root, 'workspace'); await mkdir(workspace);
  await f.store.updateChannel(f.id, channel => { channel.repoPath = workspace; return { channel }; });
  const catId = (await f.store.readChannel(f.other)).catAssignments[0].catId;
  let interrupted = false;
  f.setCheckpoint(phase => {
    if (phase === 'database_committed' && f.runtimeCalls.includes('create') && !interrupted) {
      interrupted = true; throw Error('Injected post-commit publication interruption');
    }
  });
  f.noGlobal();
  const response = await f.request(`/api/channels/${f.id}/cats/${catId}`, 'PUT', {});
  assert.equal(response.status, 400, await response.clone().text());
  assert.ok(interrupted);
  const current = await f.store.readChannel(f.id), added = current.catAssignments.find(assignment => assignment.catId === catId);
  assert.equal(added?.status, 'active'); assert.equal(added.execution.lease.sessionId, 'fixture-new-session');
  assert.ok(!f.runtimeCalls.some(call => Array.isArray(call) && call[1] === 'fixture-new-session'));
});

test('attachment setup failure closes a created session even before its ID reaches the prepared lease', async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const workspace = path.join(f.root, 'workspace'); await mkdir(path.join(workspace, '.cats-attachments'), { recursive: true });
  await writeFile(path.join(workspace, '.cats-attachments', 'fixture.txt'), 'Synthetic attachment');
  const badTarget = path.join(f.root, 'not-a-directory'); await writeFile(badTarget, 'Synthetic blocker');
  const create = f.runtimeClient.createSession.bind(f.runtimeClient);
  f.runtimeClient.createSession = async input => ({ ...await create(input), cwd: badTarget });
  await f.store.updateChannel(f.id, channel => { channel.repoPath = workspace; return { channel }; });
  const catId = (await f.store.readChannel(f.other)).catAssignments[0].catId; f.noGlobal();
  await ok(await f.request(`/api/channels/${f.id}/cats/${catId}`, 'PUT', {}), 201);
  const added = (await f.store.readChannel(f.id)).catAssignments.find(assignment => assignment.catId === catId);
  assert.equal(added.status, 'active'); assert.equal(added.execution.lease.status, 'error');
  assert.equal(added.execution.lease.sessionId, null);
  assert.ok(f.runtimeCalls.some(call => Array.isArray(call) && call[1] === 'fixture-new-session'));
  assert.equal(await readFile(badTarget, 'utf8'), 'Synthetic blocker');
});

test('a retained eligible continuation executes with global transcript reads and writes forbidden', async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const state = await f.store.readChannelState(f.id), channel = state.channels[0], cat = channel.catAssignments[0];
  const name = state.cats.find(value => value.id === cat.catId).name;
  const target = { participantKind: 'cat', participantId: cat.catId, participantName: name, laneId: null, sessionId: null };
  const now = new Date('2026-11-13T00:05:00Z'), taskId = `task-channel-${f.id}`;
  const replay = buildWorkflowContinuationReplayRequest({ channelId: f.id, checkpointId: 'retained-checkpoint',
    sourceMessageId: channel.messages[0].id, sourceParticipant: null, targets: [target],
    branchStrategy: 'transplant_context', workflowStageId: 'continuation_handoff', workflowShape: 'sequential',
    continuationSource: 'workflow_recommendation', blockedReason: 'no_valid_targets',
    workflowRecommendation: { source: 'checkpoint', workflowShape: 'sequential', reviewRequired: false,
      candidateTargets: [target], branchStrategy: 'transplant_context', rationale: 'Recovered synthetic target' },
    unresolvedTargets: [name], recordedAt: now.toISOString() });
  // Retained Core replay metadata is derived from its actual blocked workflow.
  await f.store.updateChannel(f.id, current => {
    const turn = createWorkflowTurn(current.messages[0], now.toISOString(), 'continuation_handoff', 'sequential');
    turn.status = 'blocked'; turn.completedAt = now.toISOString();
    const event = createWorkflowEvent(turn.id, 'checkpoint', 'blocked', 'Waiting for a synthetic participant',
      now.toISOString(), null, current.messages[0].id, [target], { checkpointId: replay.checkpointId, metadata: {
        checkpointKind: 'no_targets', blockedReason: 'no_valid_targets', workflowShape: 'sequential',
        continuationSourceMessageId: current.messages[0].id, continuationSource: 'workflow_recommendation',
        workflowRecommendation: replay.workflowRecommendation, branchStrategy: 'transplant_context',
      } });
    turn.events.push(event); current.roomRouting.workflow.turnHistory.unshift(turn);
    current.roomRouting.workflow.eventHistory.unshift(event); return { channel: current };
  });
  const retained = (await f.store.readCore()).tasks.find(task => task.id === taskId);
  assert.ok(retained, 'Retained replay task exists');
  assert.ok(readWorkflowContinuationReplay(retained.metadata), JSON.stringify(retained.metadata));
  f.runtimeClient.sendMessage = async () => {
    f.runtimeCalls.push('send');
    return { segments: [{ kind: 'text', text: 'Synthetic continuation completed.', toolName: null, toolId: null }],
      inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
  };
  f.noGlobal();
  await maybeAutoResumeRecoveredCatContinuation({ dependencies: { config: f.config, chatStore: f.store,
    runtimeClient: f.runtimeClient, now: () => now } }, f.id, cat.catId, now);
  const core = await f.store.readCore();
  assert.ok(core.activities.some(activity => activity.taskId === taskId && activity.metadata?.replayPhase === 'replay_dispatched'),
    JSON.stringify(core.activities.filter(activity => activity.taskId === taskId).map(activity => activity.metadata)));
  assert.ok(f.runtimeCalls.includes('send'));
  assert.ok((await f.store.readChannel(f.id)).messages.some(message => message.body.includes('Synthetic continuation completed.')));
});

test('cold broadcast, relay, attachment and participant mutations refuse before Runtime or filesystem writes', async t => {
  const f = await fixture(t, { grouped: true });
  await f.store.updateChannel(f.id, channel => { channel.repoPath = path.join(f.root, 'cold-workspace'); return { channel }; });
  await f.store.updateChannel(f.other, channel => { channel.repoPath = path.join(f.root, 'hot-workspace'); return { channel }; });
  await f.store.archiveConversation(f.id, 'archive');
  const before = await f.store.readChannel(f.id), groupId = f.source.chat.parallelChatGroups[0].id;
  const files = [{ name: 'fixture.txt', data: Buffer.from('Synthetic only').toString('base64') }];
  const cat = before.catAssignments[0];
  for (const [route, method, body] of [
    [`/api/parallel-chat-groups/${groupId}/messages`, 'POST', { activeChannelId: f.other, body: 'Broadcast', attachments: files }],
    [`/api/parallel-chat-groups/${groupId}/messages`, 'POST', { activeChannelId: f.other, body: 'Broadcast' }],
    ...[false, true].map(reverse => [`/api/parallel-chat-groups/${groupId}/relay`, 'POST', { activeChannelId: f.other,
      sourceChannelId: reverse ? f.other : f.id, sourceMessageId: `${reverse ? f.other : f.id}-message`,
      targetPolicy: 'single', targetChannelId: reverse ? f.id : f.other, command: 'check_this' }]),
    [`/api/channels/${f.id}/attachments`, 'POST', { files }],
    [`/api/channels/${f.id}/participants/${cat.participantId}`, 'PATCH', { model: 'refused-model' }],
    [`/api/channels/${f.id}/participants/${cat.participantId}`, 'DELETE', undefined],
    [`/api/channels/${f.id}/cats/${cat.catId}`, 'PUT', { model: 'refused-model' }],
  ]) {
    const response = await f.request(route, method, body);
    assert.equal(response.status, 409, `${route}: ${await response.clone().text()}`);
    assert.equal((await response.json()).error.code, 'conversation_archived');
  }
  assert.deepEqual(f.runtimeCalls, []);
  assert.deepEqual((await f.store.readChannel(f.id)).messages, before.messages);
  for (const folder of ['cold-workspace', 'hot-workspace']) await assert.rejects(access(path.join(f.root, folder)), { code: 'ENOENT' });
});
