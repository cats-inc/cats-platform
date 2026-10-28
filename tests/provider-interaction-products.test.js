import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel } from '../build/server/products/chat/state/model/index.js';
import { routeChannelMessage } from '../build/server/products/chat/state/runtime-dispatch/routing.js';
import { buildChatConversationId } from '../build/server/shared/chatCoreIds.js';
import { currentProviderBindings } from '../build/server/products/chat/api/providerInteractionBindings.js';
import { routeProviderInteractions } from '../build/server/products/shared/api/providerInteractions.js';
import { createProviderInteractionControl } from '../build/server/platform/runtime/providerInteractionControl.js';
import { withProviderRunInteractions as bindProviderRunInteractions } from '../build/server/platform/runtime/providerInteractionAdmission.js';
import { withConversationBrowserIntegration } from '../build/server/platform/runtime/providerBrowserIntegration.js';
import { upsertCoreRun, upsertCoreTask } from '../build/server/core/model/index.js';
import { createWorkSupervisedRunPayload, createWorkSupervisedRunLifecycleActionPayload } from '../build/server/products/work/api/index.js';
import { stopRun } from '../build/server/platform/supervision/runCancellation.js';
import { createWorkGoldenPathRuntimeExecutor } from '../build/server/products/work/state/workGoldenPathRuntimeExecutor.js';

function withProviderRunInteractions(runtime, store, chatStore = store) {
  return bindProviderRunInteractions(runtime, store, async id => {
    try { await currentProviderBindings(chatStore, id, store); return true; } catch { return false; }
  });
}

function fixture(surface = 'chat') {
  const state = createChannel(createDefaultChatState(), { title: 'Native controls fixture', topic: '', originSurface: surface,
    entryKind: 'direct', roomMode: 'direct_message', cats: [{ name: 'Fixture Cat', provider: 'codex', instance: 'native', model: 'test' }] });
  const store = new MemoryChatStore(state), channelId = state.selectedChannelId;
  return { state, store, channelId, conversationId: buildChatConversationId(channelId) };
}
function nativeRuntime() {
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const request = { interactionId: 'question', sessionId: 'session', workerGeneration: 'worker', executionId: 'execution', revision: 1,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), status: 'pending', kind: 'user_input',
    prompt: { kind: 'user_input', title: 'Continue?', fields: [{ id: 'answer', type: 'string', required: true, secret: true, label: 'Answer' }] } };
  const calls = { create: [], messages: 0, responses: [], close: [] };
  const runtime = {
    async createSession(input) { calls.create.push(input); return { id: 'session', provider: 'codex', model: 'test', status: 'ready', cwd: null }; },
    async sendMessage() { calls.messages++; started(); return new Promise(resolve => { release = resolve; }); },
    async getSessionInteractions() { return { version: 1, sessionId: 'session', workerGeneration: 'worker', revision: 1, interactions: [structuredClone(request)] }; },
    async respondSessionInteraction(...args) {
      calls.responses.push(args); request.status = 'resolved'; delete request.prompt;
      release?.({ segments: [{ kind: 'text', text: 'Native response received.', toolId: null, toolName: null }], tokensUsed: 1 });
      return structuredClone(request);
    },
    async closeSession(id) { calls.close.push(id); },
    async resumeSession() { return { id: 'session' }; },
  };
  return { runtime, waiting, calls, request };
}
const answer = i => ({ binding: i.binding, workerGeneration: i.workerGeneration, executionId: i.executionId,
  expectedRevision: i.revision, idempotencyKey: 'same-request', answer: { action: 'accept', values: { answer: 'private-fixture-answer' } } });

for (const surface of ['chat', 'code', 'work']) test(`${surface} conversation answers its existing native execution without another message`, async () => {
  const f = fixture(surface), n = nativeRuntime();
  const dispatch = routeChannelMessage(f.state, f.channelId, { body: 'Ask the owner', senderName: 'Owner' }, n.runtime, new Date(), { chatStore: f.store });
  await n.waiting;
  const control = createProviderInteractionControl({ runtime: n.runtime, bindings: id => currentProviderBindings(f.store, id) });
  const snapshot = await control.snapshot(f.conversationId);
  assert.equal(snapshot.interactions.length, 1); assert.equal(snapshot.interactions[0].status, 'pending');
  assert.ok(snapshot.interactions[0].binding.turnId); assert.equal(n.calls.create[0].interactionHost.version, 1);
  await control.respond(f.conversationId, 'session', 'question', answer(snapshot.interactions[0]));
  const result = await dispatch;
  assert.equal(n.calls.messages, 1); assert.equal(n.calls.responses.length, 1);
  assert.equal(JSON.stringify(result.state).includes('private-fixture-answer'), false);
});

async function addRun(f, id = 'work-run', status = 'running') {
  await f.store.updateCore(core => {
    const task = upsertCoreTask(core, { id: `task-${id}`, title: 'Owned task', ownerActorId: core.ownerProfile.actorId,
      status: 'in_progress', conversationId: f.conversationId });
    return upsertCoreRun(task.core, { id, title: 'Supervised fixture', status, taskId: task.task.id, conversationId: f.conversationId }).core;
  });
}
const supervised = { provider: 'codex', workspaceKind: 'worktree', workspaceAccess: 'read_write', permissionMode: 'whitelist',
  allowedTools: ['read_file'], context: { metadata: { supervisionProduct: 'cats-work', supervisionRunId: 'work-run' } } };

test('supervised Work attaches before send, retains allowlist, and cancel revokes native responses', async () => {
  const f = fixture('work'), n = nativeRuntime(); await addRun(f);
  const client = withProviderRunInteractions(n.runtime, f.store);
  await client.createSession(supervised);
  const run = (await f.store.readCore()).runs.find(r => r.id === 'work-run');
  assert.equal(run.metadata.supervision.runtimeBridge.sessionId, 'session');
  assert.deepEqual(n.calls.create[0].allowedTools, ['read_file']); assert.equal(n.calls.create[0].executionPolicy, undefined);
  const message = client.sendMessage('session', 'ask'); await n.waiting;
  const control = createProviderInteractionControl({ runtime: client, bindings: id => currentProviderBindings(f.store, id) });
  const request = (await control.snapshot(f.conversationId)).interactions[0];
  assert.equal(request.binding.runId, 'work-run');
  await control.respond(f.conversationId, 'session', 'question', answer(request)); await message;
  await f.store.updateCore(core => { core.runs.find(r => r.id === 'work-run').status = 'cancelled'; return core; });
  await assert.rejects(control.respond(f.conversationId, 'session', 'question', answer(request)));
  await assert.rejects(client.resumeSession('session'));
  assert.equal(n.calls.messages, 1); assert.equal(n.calls.responses.length, 1);
});

test('supervised Work admission never requests Claude in Chrome even while the setting is on', async () => {
  const f = fixture('work'), n = nativeRuntime(); await addRun(f);
  // Same order as server dependencies: the conversation wrapper sits outside Work admission.
  const client = withConversationBrowserIntegration(withProviderRunInteractions(n.runtime, f.store), async () => true);
  await client.createSession(supervised);
  assert.ok(n.calls.create[0].interactionHost, 'Work admission negotiated its own host');
  assert.equal(n.calls.create[0].browserIntegration, undefined);
  await client.createSession({ provider: 'claude', interactionHost: n.calls.create[0].interactionHost });
  assert.equal(n.calls.create[1].browserIntegration, true, 'a conversation caller that hosts cards still opts in');
});

test('failed persistence or cancellation during Work admission closes its unbound worker', async () => {
  for (const failure of ['disk', 'cancel']) {
    const f = fixture('work'), n = nativeRuntime(); await addRun(f);
    const core = await f.store.readCore();
    let writes = 0, saved = core;
    const store = { readCore: async () => structuredClone(saved), updateCore: async fn => {
      const next = structuredClone(saved); writes++;
      if (failure === 'cancel' && writes === 2) next.runs.find(r => r.id === 'work-run').status = 'cancelled';
      fn(next); if (failure === 'disk' && writes === 2) throw new Error('disk unavailable'); saved = next; return next;
    } };
    await assert.rejects(withProviderRunInteractions(n.runtime, store, f.store).createSession(supervised));
    assert.deepEqual(n.calls.close, ['session']);
  }
});

test('two simultaneous Work launch requests cannot create two native workers for one run', async () => {
  const f = fixture('work');
  await f.store.updateCore(core => upsertCoreTask(core, { id: 'task', title: 'Concurrent launch', status: 'in_progress',
    ownerActorId: core.ownerProfile.actorId, conversationId: f.conversationId }).core);
  let started, release; const creating = new Promise(resolve => { started = resolve; });
  let creates = 0, messages = 0;
  const raw = { async createSession() { creates++; started(); return new Promise(resolve => { release = () => resolve({ id: 'session', provider: 'codex', cwd: null }); }); },
    async sendMessage() { messages++; return { segments: [], tokensUsed: 0 }; }, async closeSession() {} };
  const dependencies = { coreStore: f.store, runtimeClient: withProviderRunInteractions(raw, f.store), runtimeTarget: { provider: 'codex' } };
  const first = createWorkSupervisedRunPayload(dependencies, 'task'); await creating;
  const duplicate = await createWorkSupervisedRunPayload(dependencies, 'task');
  assert.equal(duplicate.created, false); assert.equal(creates, 1);
  release(); await first;
  assert.equal(messages, 1); assert.equal((await f.store.readCore()).runs.find(r => r.taskId === 'task').metadata.providerInteraction.sessionId, 'session');
});

test('old completed Work history does not crowd out the current native request', async () => {
  const f = fixture('work'), n = nativeRuntime();
  for (let i = 0; i < 35; i++) await addRun(f, `old-${i}`, 'completed');
  await f.store.updateCore(core => { for (const run of core.runs) run.metadata.providerInteraction = { version: 1, sessionId: `old-${run.id}` }; return core; });
  await addRun(f); await withProviderRunInteractions(n.runtime, f.store).createSession(supervised);
  const rows = await currentProviderBindings(f.store, f.conversationId);
  assert.ok(rows.length <= 5); assert.equal(rows.find(r => r.binding.runId === 'work-run').canRespond, true);
});

for (const outcome of ['success', 'cancel_then_success', 'cancel_then_failure']) test(`Work launch preserves current state after human waiting: ${outcome}`, async () => {
  const f = fixture('work'), calls = [];
  await f.store.updateCore(core => upsertCoreTask(core, { id: 'task', title: 'Supervised task', status: 'in_progress',
    ownerActorId: core.ownerProfile.actorId, conversationId: f.conversationId }).core);
  const raw = { async createSession() { return { id: 'session', provider: 'codex', cwd: null }; }, async closeSession() {},
    async cancelSession(id) { calls.push(id); }, async sendMessage() {
      const run = (await f.store.readCore()).runs.find(r => r.taskId === 'task');
      assert.equal(run.status, 'running'); assert.equal(run.metadata.providerInteraction.sessionId, 'session');
      if (outcome.startsWith('cancel')) await stopRun({ coreStore: f.store, runtimeClient: raw }, run.id);
      if (outcome.endsWith('failure')) throw new Error('provider turn interrupted');
      return { segments: [], tokensUsed: 0 };
    } };
  const result = await createWorkSupervisedRunPayload({ coreStore: f.store, runtimeClient: withProviderRunInteractions(raw, f.store),
    runtimeTarget: { provider: 'codex' } }, 'task');
  const persisted = (await f.store.readCore()).runs.find(r => r.taskId === 'task');
  assert.equal(persisted.status, outcome === 'success' ? 'running' : 'cancelled');
  assert.equal(result.run.status, persisted.status); assert.equal(persisted.metadata.providerInteraction.sessionId, 'session');
  assert.deepEqual(calls, outcome === 'success' ? [] : ['session']);
});

for (const phase of ['creating', 'waiting']) test(`an explicit Work deadline revokes native execution while ${phase}`, async () => {
  const controller = new AbortController(), calls = []; let observed, finish;
  const reached = new Promise(resolve => { observed = resolve; });
  const result = { segments: [], tokensUsed: 0 };
  const session = { id: 'deadline-session', provider: 'codex', cwd: null };
  const runtimeClient = {
    async createSession() {
      if (phase === 'creating') { observed(); return new Promise(resolve => { finish = () => resolve(session); }); }
      return session;
    },
    async sendMessage() { calls.push('message'); observed(); return new Promise(resolve => { finish = () => resolve(result); }); },
    async cancelSession(id) { calls.push(`cancel:${id}`); finish(); },
    async closeSession() { calls.push('close'); },
  };
  const execute = createWorkGoldenPathRuntimeExecutor({ runtimeClient, resolveTarget: () => ({ provider: 'codex' }) });
  const pending = execute({ signal: controller.signal, runId: 'run', taskId: 'task', workItemId: 'work', stepIndex: 0,
    goal: 'fixture', acceptanceCriteria: [], deliveryMode: 'artifact_only', workspacePath: null, outstandingGaps: [], outstandingCriteria: [] });
  await reached; controller.abort(); if (phase === 'creating') finish();
  assert.equal((await pending).status, 'failed');
  assert.deepEqual(calls, phase === 'waiting' ? ['message', 'cancel:deadline-session'] : ['cancel:deadline-session']);
});

for (const cancelled of [false, true]) test(`Work resume uses current ownership and retains the readmitted host: cancel=${cancelled}`, async () => {
  const f = fixture('work');
  await f.store.updateCore(core => upsertCoreTask(core, { id: 'task-work-run', title: 'Resume fixture', status: 'in_progress',
    ownerActorId: core.ownerProfile.actorId, conversationId: f.conversationId }).core);
  let runId;
  let closes = 0;
  const raw = { async createSession() { return { id: 'session', provider: 'codex' }; }, async closeSession() { closes++; },
    async sendMessage() { return { segments: [], tokensUsed: 0 }; },
    async cancelSession() {}, async resumeSession() {
      if (cancelled) await stopRun({ coreStore: f.store, runtimeClient: client }, runId);
      return { id: 'session', provider: 'codex' };
    } };
  const client = withProviderRunInteractions(raw, f.store);
  const dependencies = { coreStore: f.store, runtimeClient: client, runtimeTarget: { provider: 'codex' } };
  runId = (await createWorkSupervisedRunPayload(dependencies, 'task-work-run')).run.id;
  await client.closeSession('session');
  await f.store.updateCore(core => {
    const run = core.runs.find(r => r.id === runId); run.status = 'blocked';
    run.metadata.supervision = { ...run.metadata.supervision, lifecycle: 'active', blockers: [{ code: 'paused', message: 'Fixture pause' }] };
    return core;
  });
  const resumed = createWorkSupervisedRunLifecycleActionPayload(dependencies, 'task-work-run', 'resume');
  if (cancelled) await assert.rejects(resumed); else await resumed;
  const current = (await f.store.readCore()).runs.find(r => r.id === runId);
  assert.equal(current.status, cancelled ? 'cancelled' : 'running');
  assert.equal(current.metadata.providerInteraction.ended, cancelled);
  assert.equal(closes, cancelled ? 2 : 1);
});

test('a Core source-channel string alone cannot admit an unanswerable native host', async () => {
  const f = fixture('work'), n = nativeRuntime(); await addRun(f);
  await f.store.updateSnapshot(({ chat, core }) => ({ core, chat: { ...chat, channels: [] } }));
  await withProviderRunInteractions(n.runtime, f.store).createSession(supervised);
  assert.equal(n.calls.create[0].interactionHost, undefined);
});

test('native API rejects unauthenticated/mobile/remote/forwarded access even with localhost Host', async () => {
  const f = fixture(), n = nativeRuntime();
  const owner = { credentialKind: 'browser_cookie', principal: { membership: { roles: ['owner'] } } };
  for (const [auth, address, headers] of [[null, '127.0.0.1', {}], [{ ...owner, credentialKind: 'mobile_bearer' }, '127.0.0.1', {}],
    [owner, '203.0.113.9', {}], [owner, '127.0.0.1', { 'x-forwarded-for': '203.0.113.9' }], [owner, '127.0.0.1', {}]]) {
    const request = Readable.from([]); request.socket = { remoteAddress: address }; request.headers = headers;
    let status, body, responseHeaders;
    const response = { writeHead(code, values) { status = code; responseHeaders = values; }, end(text) { body = JSON.parse(text); } };
    assert.equal(await routeProviderInteractions({ request, response, method: 'GET', auth,
      url: new URL(`http://localhost/api/provider-interactions/conversations/${f.conversationId}`),
      dependencies: { bindings: id => currentProviderBindings(f.store, id), runtimeClient: n.runtime } }), true);
    const valid = auth === owner && address === '127.0.0.1' && !headers['x-forwarded-for'];
    assert.equal(status, valid ? 200 : 403, JSON.stringify(body)); assert.equal(responseHeaders['cache-control'], 'no-store');
  }
});
