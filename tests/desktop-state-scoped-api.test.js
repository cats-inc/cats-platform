import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../build/server/app/server/index.js';
import { loadConfig } from '../build/server/config.js';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { MemoryChatStore, normalizeImportedChatSnapshot } from '../build/server/products/chat/state/store.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { archiveDirectory } from '../build/server/products/chat/state/database/archiveAssets.js';
import { createChannel, removeChannelParticipant, updateChannelParticipant } from '../build/server/products/chat/state/model/index.js';
import { mergePreparedParticipantMutation, updateConversationState, updateConversationsState } from '../build/server/products/chat/api/scopedConversationState.js';
import { assertConversationWritable } from '../build/server/products/chat/shared/conversationArchive.js';
import { maybeAutoResumeRecoveredCatContinuation } from '../build/server/products/chat/api/routeContinuationRecovery.js';
import { buildWorkflowContinuationReplayRequest, readWorkflowContinuationReplay } from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import { createWorkflowEvent, createWorkflowTurn } from '../build/server/products/chat/state/room-routing/workflow.js';
import { withLockedParallelChatGroup } from '../build/server/products/chat/api/resources/parallelChatGroupSupport.js';
import { finalizeParallelChatBodies } from '../build/server/products/chat/api/resources/parallelChatGroupDispatch.js';
import { createChatEventHub } from '../build/server/products/chat/api/chatEventHub.js';
import { beginChannelMessageDispatch } from '../build/server/products/chat/state/runtimeActions.js';
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
  const eventHub = createChatEventHub();
  const server = createServer({ shared: { config, authStore: auth.authStore, now: () => now, runtimeClient },
    chat: { chatStore: store, eventHub, startCompanionLifeLoop: false } });
  t.after(async () => {
    await server.closeAppHosting(); await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  await server.startupRecovery; await server.appHostingReady(); runtimeCalls.length = 0;
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = 'GET', body, signal) => fetch(`${url}${route}`, { method, signal,
    headers: { cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const [id, other] = source.chat.channels.map(channel => channel.id);
  const noGlobal = () => {
    store.read = async () => { throw Error('Scoped API read all transcripts'); };
    store.updateSnapshot = async () => { throw Error('Scoped API wrote a global snapshot'); };
  };
  return { root, config, source, store, id, other, request, noGlobal, runtimeCalls, runtimeClient, eventHub, setCheckpoint(value) { checkpoint = value; } };
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

test('target metadata sets preserve database order and never decode any message body', async t => {
  const f = await fixture(t); f.noGlobal();
  const db = openStateDatabase({ file: databasePath(f.config.chatStatePath), mode: 'writer' });
  try { db.run('update messages set json = ?', '{deliberately invalid body'); } finally { db.close(); }
  const selected = await f.store.readChannelStates([f.other, f.id, f.other, 'missing'], { metadataOnly: true });
  assert.deepEqual(selected.channels.map(channel => channel.id), [f.id, f.other]);
  assert.ok(selected.channels.every(channel => channel.messages.length === 0));
  assert.equal((await f.store.readChannelStates([], { metadataOnly: true })).channels.length, 0);
  assert.equal((await f.store.readChannelStates(['missing'], { metadataOnly: true })).channels.length, 0);
  await assert.rejects(f.store.readChannelState(f.id), { code: 'invalid_database_record' });
});

test('activation, attachments, stream, cancel, export and sleep use only the healthy target', { timeout: 20_000 }, async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const db = openStateDatabase({ file: databasePath(f.config.chatStatePath), mode: 'writer' });
  try { db.run('update messages set json = ? where channel_id = ?', '{invalid sibling', f.other); } finally { db.close(); }
  f.runtimeClient.streamSession = async (_id, emit) => {
    f.runtimeCalls.push('stream');
    await emit({ event: 'text', data: { text: 'Synthetic streamed text' } });
    await emit({ event: 'result', data: { segments: [{ kind: 'text', text: 'Synthetic streamed text' }] } });
  };
  f.runtimeClient.cancelSession = async () => { f.runtimeCalls.push('cancel'); };
  f.noGlobal();
  const activated = await ok(await f.request(`/api/channels/${f.id}/activations`, 'POST'));
  assert.ok(activated.activation.results.some(result => result.status === 'started'));
  const files = [{ name: 'fixture.txt', data: Buffer.from('Metadata-only upload').toString('base64') }];
  await ok(await f.request(`/api/channels/${f.id}/attachments`, 'POST', { files }));
  const attachment = await f.request(`/api/channels/${f.id}/attachments/fixture.txt`);
  assert.equal(attachment.status, 200); assert.equal(await attachment.text(), 'Metadata-only upload');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await f.request(`/api/channels/${f.id}/stream`, 'GET', undefined, controller.signal);
    assert.equal(response.status, 200); assert.match(await response.text(), /Synthetic streamed text/);
  } finally { clearTimeout(timer); controller.abort(); }
  const cancelled = await ok(await f.request(`/api/channels/${f.id}/cancel`, 'POST'));
  assert.equal(cancelled.cancellation.cancelledSessionCount, 1);
  const exported = await ok(await f.request(`/api/channels/${f.id}/exports/latest`));
  assert.ok(exported.channel.messages.some(message => message.id === `${f.id}-message`));
  const stopped = await ok(await f.request(`/api/channels/${f.id}/deactivate`, 'POST'));
  assert.equal(stopped.deactivation.closedSessionCount, 1);
  assert.ok(f.runtimeCalls.includes('stream')); assert.ok(f.runtimeCalls.includes('cancel'));
  assert.ok(f.runtimeCalls.some(call => Array.isArray(call) && call[0] === 'close'));
});

test('corrupt cold evidence cannot force transcript reads for readonly admission, attachments or a closed stream', { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  const workspace = path.join(f.root, 'retained-workspace'); await mkdir(path.join(workspace, '.cats-attachments'), { recursive: true });
  await writeFile(path.join(workspace, '.cats-attachments', 'retained.txt'), 'Retained synthetic file');
  await f.store.updateChannel(f.id, channel => {
    channel.repoPath = workspace;
    channel.catAssignments[0].execution.lease = { ...channel.catAssignments[0].execution.lease,
      sessionId: 'retained-idle-session', status: 'ready', cwd: workspace };
    return { channel };
  });
  const archived = await f.store.archiveConversation(f.id, 'archive');
  const assets = archiveDirectory(databasePath(f.config.chatStatePath));
  const manifest = JSON.parse(await readFile(path.join(assets, `${archived.archiveId}.manifest.json`), 'utf8'));
  const payload = path.join(assets, manifest.file), bytes = await readFile(payload);
  await writeFile(payload, bytes.subarray(0, bytes.length - 1));
  f.noGlobal();
  f.store.readChannelState = async () => { throw Error('Readonly cold admission must not hydrate history'); };
  const metadataRead = f.store.readChannelStates.bind(f.store);
  f.store.readChannelStates = (ids, options) => {
    assert.equal(options?.metadataOnly, true); return metadataRead(ids, options);
  };
  const channel = await f.store.readChannelHeader(f.id), cat = channel.catAssignments[0];
  for (const [route, method, body] of [
    [`/api/channels/${f.id}/activations`, 'POST', undefined],
    [`/api/channels/${f.id}`, 'PATCH', { coordinatorParticipantId: cat.participantId }],
    [`/api/channels/${f.id}/participants/${cat.participantId}`, 'PATCH', { model: 'denied' }],
    [`/api/channels/${f.id}/participants/${cat.participantId}`, 'DELETE', undefined],
    [`/api/channels/${f.id}/cats/${cat.catId}`, 'PUT', {}],
    [`/api/channels/${f.id}/cats/${cat.catId}`, 'DELETE', undefined],
    [`/api/channels/${f.id}/attachments`, 'POST', { files: [{ name: 'denied', data: 'eA==' }] }],
  ]) {
    const response = await f.request(route, method, body);
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal((await response.json()).error.code, 'conversation_archived');
  }
  const attachment = await f.request(`/api/channels/${f.id}/attachments/retained.txt`);
  assert.equal(attachment.status, 200); assert.equal(await attachment.text(), 'Retained synthetic file');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await f.request(`/api/channels/${f.id}/stream`, 'GET', undefined, controller.signal);
    assert.equal(response.status, 200); assert.match(await response.text(), /session_closed/);
  } finally { clearTimeout(timer); controller.abort(); }
  assert.deepEqual(f.runtimeCalls, []);
  assert.equal((await f.request(`/api/channels/${f.id}/messages`)).status, 422);
  assert.equal((await f.request(`/api/channels/${f.other}/messages`)).status, 200);
});

test('a changed parallel audience is recaptured only after acquiring every current member gate', async t => {
  const f = await fixture(t, { grouped: true, temporary: true });
  const group = f.source.chat.parallelChatGroups[0], activeGates = new Set(), entries = [];
  const update = f.store.updateSnapshot.bind(f.store); let changed = false, operations = 0;
  f.noGlobal();
  const result = await withLockedParallelChatGroup({ dependencies: { chatStore: f.store, mutationGate: {
    async run(id, operation) {
      entries.push(id); activeGates.add(id);
      try {
        if (!changed) {
          changed = true;
          await update(({ chat, core }) => {
            chat.parallelChatGroups[0].memberChannelIds.push(f.id); return { chat, core };
          });
        }
        return await operation();
      } finally { activeGates.delete(id); }
    },
  } } }, group.id, async (state, current) => {
    operations++;
    assert.equal(current.memberChannelIds.length, 3);
    assert.ok(current.memberChannelIds.every(id => activeGates.has(id)));
    assert.deepEqual(new Set(state.channels.map(channel => channel.id)), new Set(current.memberChannelIds));
    return 'captured';
  });
  assert.equal(result, 'captured'); assert.equal(operations, 1); assert.equal(entries.length, 5);
});

test('activation publication after another store archives the channel closes the new unattached Runtime session', { timeout: 20_000 }, async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const competitor = new DatabaseChatStore(f.config.chatStatePath); await competitor.initialize();
  try {
    const create = f.runtimeClient.createSession.bind(f.runtimeClient);
    f.runtimeClient.createSession = async input => {
      const session = await create(input); await competitor.archiveConversation(f.id, 'archive'); return session;
    };
    f.noGlobal();
    const response = await f.request(`/api/channels/${f.id}/activations`, 'POST');
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal((await response.json()).error.code, 'conversation_archived');
    assert.ok(f.runtimeCalls.some(call => Array.isArray(call) && call[1] === 'fixture-new-session'));
    assert.equal((await f.store.readChannelHeader(f.id)).status, 'archived');
  } finally { await competitor.close(); }
});

test('activation cleanup retains a session attached by an interrupted durable publication', async t => {
  const f = await fixture(t, { runtimeSessions: true }); let interrupted = false;
  f.setCheckpoint(phase => {
    if (phase === 'database_committed' && f.runtimeCalls.includes('create') && !interrupted) {
      interrupted = true; throw Error('Injected activation publication interruption');
    }
  });
  f.noGlobal();
  const response = await f.request(`/api/channels/${f.id}/activations`, 'POST');
  assert.equal(response.status, 400, await response.clone().text()); assert.ok(interrupted);
  const current = await f.store.readChannelHeader(f.id);
  assert.equal(current.catAssignments[0].execution.lease.sessionId, 'fixture-new-session');
  assert.ok(!f.runtimeCalls.some(call => Array.isArray(call) && call[1] === 'fixture-new-session'));
});

test('activation setup failure closes a created session before attachment sync can publish its lease', async t => {
  const f = await fixture(t, { runtimeSessions: true });
  const workspace = path.join(f.root, 'activation-workspace'); await mkdir(path.join(workspace, '.cats-attachments'), { recursive: true });
  await writeFile(path.join(workspace, '.cats-attachments', 'fixture.txt'), 'Synthetic attachment');
  const badTarget = path.join(f.root, 'activation-not-a-directory'); await writeFile(badTarget, 'Synthetic blocker');
  const create = f.runtimeClient.createSession.bind(f.runtimeClient);
  f.runtimeClient.createSession = async input => ({ ...await create(input), cwd: badTarget });
  await f.store.updateChannel(f.id, channel => { channel.repoPath = workspace; return { channel }; });
  f.noGlobal();
  const response = await ok(await f.request(`/api/channels/${f.id}/activations`, 'POST'));
  assert.ok(response.activation.results.every(result => result.status !== 'started'));
  assert.equal((await f.store.readChannelHeader(f.id)).catAssignments[0].execution.lease.status, 'error');
  assert.ok(f.runtimeCalls.some(call => Array.isArray(call) && call[1] === 'fixture-new-session'));
  assert.equal(await readFile(badTarget, 'utf8'), 'Synthetic blocker');
});

test('an open idle Runtime stream observes another store archive without an event and releases its Runtime subscription', { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  await f.store.updateChannel(f.id, channel => {
    channel.catAssignments[0].execution.lease = { ...channel.catAssignments[0].execution.lease,
      sessionId: 'idle-stream-session', status: 'ready', cwd: path.join(f.root, 'idle-workspace') };
    return { channel };
  });
  let attachedResolve, released = 0;
  const attached = new Promise(resolve => { attachedResolve = resolve; });
  f.runtimeClient.streamSession = async (_id, emit, options) => {
    await emit({ event: 'text', data: { text: 'Idle synthetic stream' } }); attachedResolve();
    await new Promise(resolve => {
      if (options.signal.aborted) resolve();
      else options.signal.addEventListener('abort', resolve, { once: true });
    });
    released++;
  };
  f.noGlobal();
  const competitor = new DatabaseChatStore(f.config.chatStatePath); await competitor.initialize();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await f.request(`/api/channels/${f.id}/stream`, 'GET', undefined, controller.signal);
    await attached;
    await competitor.archiveConversation(f.id, 'archive');
    const output = await response.text();
    assert.match(output, /Idle synthetic stream/); assert.match(output, /session_closed/);
    assert.equal(released, 1); assert.equal(controller.signal.aborted, false);
  } finally { clearTimeout(timer); controller.abort(); await competitor.close(); }
});

test('parallel acknowledgement and completion remain scoped with a malformed unrelated conversation', async t => {
  const f = await fixture(t, { grouped: true });
  let third;
  await f.store.updateSnapshot(({ chat, core }) => {
    const next = createChannel(chat, { originSurface: 'work', title: 'Unrelated', topic: '',
      temporaryParticipants: [{ name: 'Unrelated', provider: 'codex' }], skipBossCatGreeting: true });
    third = next.selectedChannelId; return { chat: next, core };
  });
  const db = openStateDatabase({ file: databasePath(f.config.chatStatePath), mode: 'writer' });
  db.run('update messages set json = ? where channel_id = ?', '{malformed unrelated', third); db.close();
  const sessions = new Map(); let sequence = 0;
  f.runtimeClient.getHealth = async () => ({ reachable: true, status: 'ok' });
  f.runtimeClient.createSession = async input => {
    const session = { id: `parallel-session-${++sequence}`, provider: input.provider, model: input.model ?? null,
      status: 'ready', cwd: path.join(f.root, `parallel-session-${sequence}`) };
    sessions.set(session.id, session); f.runtimeCalls.push(['create', session.id]); return session;
  };
  f.runtimeClient.getSession = async id => sessions.get(id);
  f.runtimeClient.sendMessage = async id => {
    f.runtimeCalls.push(['send', id]);
    return { segments: [{ kind: 'text', text: `Scoped parallel reply ${id}`, toolName: null, toolId: null }],
      inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
  };
  f.noGlobal();
  const globalReads = [];
  f.store.read = async () => { globalReads.push(new Error('Unexpected full read').stack); throw Error('Scoped API read all transcripts'); };
  for (const name of ['writeCore', 'updateCore']) {
    const original = f.store[name].bind(f.store);
    f.store[name] = async (...args) => {
      try { return await original(...args); }
      catch (error) { globalReads.push(new Error(`${name}: ${error.message}`).stack); throw error; }
    };
  }
  let publications = 0, finalBatchPublished = false, finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const updateBatch = f.store.updateChannels.bind(f.store);
  f.store.updateChannels = async (...args) => {
    const result = await updateBatch(...args);
    if (++publications === 2) finalBatchPublished = true;
    return result;
  };
  const unsubscribe = f.eventHub.subscribe(event => {
    if (finalBatchPublished && event.kind === 'recents_changed') finish();
  });
  const group = f.source.chat.parallelChatGroups[0];
  const acknowledged = await ok(await f.request(`/api/parallel-chat-groups/${group.id}/messages`, 'POST', {
    activeChannelId: f.id, body: 'Scoped parallel request',
  }));
  assert.equal(acknowledged.phase, 'acknowledged'); assert.equal(acknowledged.results.length, 2);
  let timer;
  try { await Promise.race([finished, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Parallel finalize timed out')), 10_000); })]); }
  finally { clearTimeout(timer); unsubscribe(); }
  const current = await f.store.readChannelStates(group.memberChannelIds);
  for (const channel of current.channels) {
    assert.ok(channel.messages.some(message => message.body.startsWith('Scoped parallel reply')),
      `${globalReads.join('\n')}\n${JSON.stringify(channel.messages.map(({ body, metadata }) => ({ body, event: metadata.event })))}\n${JSON.stringify(f.runtimeCalls)}`);
    assert.equal(channel.messages.filter(message => message.body === 'Scoped parallel request').length, 1);
  }
  assert.equal(f.runtimeCalls.filter(call => Array.isArray(call) && call[0] === 'send').length, 2);
  assert.deepEqual(globalReads, []);
});

for (const change of ['archive', 'participant', 'membership', 'active turn']) {
  test(`parallel publication rejects concurrent ${change} before committing any acknowledged member`, async t => {
    const f = await fixture(t, { grouped: true });
    const original = f.store.updateChannels.bind(f.store), update = f.store.updateSnapshot.bind(f.store);
    let injected = false;
    f.store.updateChannels = async (...args) => {
      if (!injected) {
        injected = true;
        if (change === 'archive') await f.store.archiveConversation(f.other, 'archive');
        else if (change === 'participant') await updateConversationState(f.store, f.other, state =>
          updateChannelParticipant(state, f.other, state.channels[0].catAssignments[0].participantId, { model: 'Concurrent owner model' }));
        else if (change === 'active turn') {
          const state = await f.store.readChannelState(f.other), channel = state.channels[0];
          const newer = await beginChannelMessageDispatch(state, f.other, { body: 'Newer owner turn', messageMetadata: {
            recipientParticipantIds: [channel.catAssignments[0].participantId] } }, f.runtimeClient);
          assert.ok(newer.preparedTurn);
          await f.store.updateChannel(f.other, () => ({ channel: newer.state.channels[0] }));
        }
        else await update(({ chat, core }) => {
          chat.parallelChatGroups[0].memberChannelIds.reverse(); return { chat, core };
        });
      }
      return original(...args);
    };
    f.noGlobal();
    const group = f.source.chat.parallelChatGroups[0];
    const response = await f.request(`/api/parallel-chat-groups/${group.id}/messages`, 'POST', {
      activeChannelId: f.id, body: 'Must never be acknowledged',
    });
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal((await response.json()).error.code, change === 'archive' ? 'conversation_archived'
      : change === 'participant' || change === 'active turn' ? 'conversation_changed' : 'parallel_group_changed');
    for (const id of group.memberChannelIds) {
      assert.equal((await f.store.readChannel(id)).messages.some(message => message.body === 'Must never be acknowledged'), false);
    }
    assert.deepEqual(f.runtimeCalls, []);
  });
}

test('parallel failure settlement ignores damaged cold siblings and settles the surviving hot turn', async t => {
  const f = await fixture(t, { grouped: true }), now = new Date('2026-11-13T00:00:00Z');
  await f.store.updateChannels([f.other], state => { state.selectedChannelId = f.other; return state; });
  const baseline = await f.store.readChannelState(f.other);
  const begun = await beginChannelMessageDispatch(baseline, f.other, { body: 'Settle healthy member', messageMetadata: {
    recipientParticipantIds: [baseline.channels[0].catAssignments[0].participantId] } }, f.runtimeClient, now);
  assert.ok(begun.preparedTurn);
  await f.store.updateChannel(f.other, () => ({ channel: begun.state.channels[0] }));
  const archive = await f.store.archiveConversation(f.id, 'archive');
  const assets = archiveDirectory(databasePath(f.config.chatStatePath));
  const manifest = JSON.parse(await readFile(path.join(assets, `${archive.archiveId}.manifest.json`), 'utf8'));
  const payload = path.join(assets, manifest.file), bytes = await readFile(payload);
  await writeFile(payload, bytes.subarray(0, bytes.length - 1));
  f.noGlobal();
  f.store.updateChannel = async () => { throw Error('Injected continuation write failure'); };
  const group = f.source.chat.parallelChatGroups[0];
  const response = await finalizeParallelChatBodies({ dependencies: {
    config: f.config, chatStore: f.store, runtimeClient: f.runtimeClient, now: () => now,
    mutationGate: { run: (_id, operation) => operation() },
  } }, {
    groupId: group.id, now, nowIso: now.toISOString(), lockedChannelIds: group.memberChannelIds,
    acknowledgedState: begun.state,
    begunDispatches: [{ channelId: f.id, begun: null, status: 'skipped' },
      { channelId: f.other, begun, status: 'sent' }],
  });
  assert.equal(response.phase, 'completed');
  const current = await f.store.readChannel(f.other);
  assert.ok(current.messages.some(message => message.metadata.event === 'runtime_error' && message.metadata.phase === 'dispatch_continue'));
  assert.equal(current.roomRouting.workflow.activeTurn, null);
  assert.ok(current.roomRouting.workflow.turnHistory.some(turn => turn.id === begun.preparedTurn.activeTurn.id && turn.status === 'failed'));
  assert.equal((await f.request(`/api/channels/${f.id}/messages`)).status, 422);
});

test('parallel cold admission and a skipped cold member do not decode damaged archive evidence', async t => {
  const f = await fixture(t, { grouped: true });
  const archive = await f.store.archiveConversation(f.other, 'archive');
  const assets = archiveDirectory(databasePath(f.config.chatStatePath));
  const manifest = JSON.parse(await readFile(path.join(assets, `${archive.archiveId}.manifest.json`), 'utf8'));
  const payload = path.join(assets, manifest.file), bytes = await readFile(payload);
  await writeFile(payload, bytes.subarray(0, bytes.length - 1));
  f.noGlobal();
  const route = `/api/parallel-chat-groups/${f.source.chat.parallelChatGroups[0].id}/messages`;
  const refused = await f.request(route, 'POST', { activeChannelId: f.id, body: 'Cold required recipient' });
  assert.equal(refused.status, 409, await refused.clone().text());
  assert.equal((await refused.json()).error.code, 'conversation_archived');
  assert.deepEqual(f.runtimeCalls, []);
  const acknowledged = await ok(await f.request(route, 'POST', { activeChannelId: f.id, body: '', channelInputs: [
    { channelId: f.id, body: '' }, { channelId: f.other, body: '' },
  ] }));
  assert.ok(acknowledged.results.every(result => result.status === 'skipped'));
  assert.equal((await f.store.readChannelHeader(f.other)).status, 'archived');
  assert.deepEqual(f.runtimeCalls, []);
});

test('parallel acknowledgement retains a newer concurrent title and channel/group timestamps', async t => {
  const f = await fixture(t, { grouped: true });
  const original = f.store.updateChannels.bind(f.store); let injected = false;
  const future = '2026-11-14T00:00:00.000Z';
  f.store.updateChannels = async (...args) => {
    if (!injected) {
      injected = true;
      await f.store.updateChannel(f.id, (channel, context) => {
        channel.title = 'Newer owner title'; channel.updatedAt = future;
        const metadata = structuredClone(context.chat);
        metadata.parallelChatGroups[0].title = channel.title; metadata.parallelChatGroups[0].updatedAt = future;
        return { channel, metadata };
      });
    }
    return original(...args);
  };
  f.noGlobal();
  const group = f.source.chat.parallelChatGroups[0];
  await ok(await f.request(`/api/parallel-chat-groups/${group.id}/messages`, 'POST', { activeChannelId: f.id, body: '' }));
  const current = await f.store.readChannelHeader(f.id), catalog = await f.store.readCatalog();
  assert.equal(current.title, 'Newer owner title'); assert.equal(current.updatedAt, future);
  assert.equal(catalog.metadata.parallelChatGroups[0].title, current.title);
  assert.equal(catalog.metadata.parallelChatGroups[0].updatedAt, future);
  assert.deepEqual(f.runtimeCalls, []);
});

test('fallback batch admission sees only requested headers and preserves unrelated archived messages', async () => {
  const source = snapshot(), ids = source.chat.channels.map(channel => channel.id);
  const chat = createChannel(source.chat, { originSurface: 'work', title: 'Unrelated archived', topic: '',
    temporaryParticipants: [{ name: 'Unrelated', provider: 'codex' }], skipBossCatGreeting: true });
  const third = chat.channels.find(channel => !ids.includes(channel.id)); third.status = 'archived';
  const store = new MemoryChatStore(chat), before = await store.read();
  await updateConversationsState(store, ids, state => state, { excludeArchived: true, preflight: headers => {
    assert.deepEqual(new Set(headers.channels.map(channel => channel.id)), new Set(ids));
    for (const channel of headers.channels) { assert.deepEqual(channel.messages, []); assertConversationWritable(channel); }
  } });
  assert.deepEqual((await store.read()).channels.find(channel => channel.id === third.id).messages,
    before.channels.find(channel => channel.id === third.id).messages);
});
