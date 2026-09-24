import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../build/server/app/server/index.js';
import { createAuthenticatedTestSession, createTestAuthConfig, installAuthenticatedFetch } from './testUtils.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel, createCat, appendMessage } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore, FileChatStore } from '../build/server/products/chat/state/store.js';
import { appendCollaborationReport, describeCollaborationReport } from '../build/server/products/chat/state/orchestratorCollaborationReport.js';
import { collaborationSnapshot, executeCollaborationRead, collaborationToolDescriptors,
  DISCOVER_COLLABORATION_CATS as discover, INSPECT_COLLABORATION_CONTEXT as inspect,
  PREPARE_COLLABORATION as prepare } from '../build/server/products/chat/state/orchestratorCollaboration.js';
import { ACCEPT_COLLABORATION, ENSURE_COLLABORATION_CONVERSATION as conversation,
  ENSURE_COLLABORATION_PARTICIPANTS as participants, REQUEST_COLLABORATION_ROLE as execute,
  INSPECT_COLLABORATION_WORK as inspectWork, STOP_COLLABORATION_WORK as stop,
  collaborationExecutionDescriptors } from '../build/server/products/chat/state/collaborationExecutionSurface.js';
import { createChatCollaborationExecution } from '../build/server/products/chat/state/collaborationExecution.js';
import { createChatProviderAgentDecisionRequester } from '../build/server/products/chat/state/providerAgentDecisionRequester.js';
import { buildChatProviderAgentObservation } from '../build/server/products/chat/state/providerAgentObservation.js';
import { resolveProviderCapabilityProfile } from '../build/server/platform/supervision/providerCapabilityProfiles.js';
import { readCollaborationIntent, writeCollaborationIntent, admitCollaboration } from '../build/server/products/work/state/collaborationRecords.js';
import { recoverCollaborations, executeCollaborationRole, recordCollaborationUsage } from '../build/server/products/work/state/collaborationExecution.js';
import { upsertCoreTask, upsertCoreRun } from '../build/server/core/model/index.js';
import { checkoutTaskExecution } from '../build/server/core/taskLifecycle.js';
import { stopRun } from '../build/server/platform/supervision/runCancellation.js';
import { channelDispatchCancellationRegistry } from '../build/server/products/chat/state/runtime-dispatch/cancellation.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';

const goal = '修正登入重試，提供可審查的版本。';
const baseline = 'a'.repeat(40), revision = 'b'.repeat(40);
const policy = { dials: { autonomy: 'single_step', taskGranularity: 'tiny', toolScope: 'narrow_write',
  scaffolding: 'few_shot', validation: 'schema_required', checkpointCadence: 'every_step',
  approvalThreshold: 'high', fallbackPolicy: 'retry' }, allowedFallbacks: ['retry'] };
const message = (text, tokensUsed = 20) => ({ segments: [{ kind: 'text', text, toolName: null, toolId: null }],
  inputTokens: tokensUsed / 2, outputTokens: tokensUsed / 2, tokensUsed });
function tool(name, input) { return { contractVersion: 1, kind: 'tool_request', decisionId: `${name}:${JSON.stringify(input)}`,
  confidence: 'high', toolName: name, target: { kind: 'worker_tool', toolName: name }, input,
  expectedOutputSchemaRef: { id: `${name}.output`, version: '1.0', format: 'json_schema' }, rationaleSummary: 'Use admitted scope.' }; }
function respond() { return { contractVersion: 1, kind: 'semantic_plan', decisionId: 'report', planId: 'report',
  confidence: 'high', rationaleSummary: 'Acknowledge observed results.',
  steps: [{ stepId: 'report', summary: 'Report actual results only.', action: 'respond' }] }; }

function fixture({ intent = 'create', confirm = true, budget = {}, old = false } = {}) {
  const now = new Date();
  let state = createDefaultChatState();
  state = createChannel(state, { title: 'Collaboration', topic: goal, originSurface: 'chat', repoPath: join(tmpdir(), 'cats-k3-source'),
    roomMode: 'chat_channel', responseLanguage: 'zh-TW', cats: [{ name: 'Implementer', provider: 'claude', roles: ['implementation'] }] }, now);
  const channelId = state.selectedChannelId;
  state = createCat(state, { name: 'Reviewer', provider: 'claude', roles: ['review'] }, now);
  const original = appendMessage(state, channelId, { body: goal, senderKind: 'user', senderName: 'Owner' }, now);
  state = original.state;
  function observe(availableTools) {
    const capabilityProfile = resolveProviderCapabilityProfile(state.globalOrchestrator.visibleParticipant.executionTarget, { assessedAt: now.toISOString() });
    return buildChatProviderAgentObservation({ state, channelId, actorRef: 'orchestrator', capabilityProfile,
      policy: policy.dials, availableTools, goal, messageCharacterCount: goal.length,
      routing: { trigger: 'room_default', resolution: { selectionKind: 'default_target' }, targetCount: 1, unresolvedCount: 0, mentionCount: 0 }, now });
  }
  const snapshot = collaborationSnapshot(state, channelId, observe(collaborationToolDescriptors(policy)));
  const receipts = [];
  const read = (toolName, toolInput) => {
    const result = executeCollaborationRead({ toolName, toolInput, snapshot, goal, receipts,
      diagnostics: { probe: 'light', providers: [{ provider: 'claude', instance: null, defaultTarget: true,
        availability: { status: 'ok', summary: null, attentionCodes: [] } }] } });
    receipts.push({ toolName, decisionId: toolName, result }); return result;
  };
  read(discover, {}); read(inspect, {});
  const prepared = read(prepare, { revision: snapshot.revision,
    implementerId: state.cats.find(cat => cat.name === 'Implementer').id,
    reviewerId: state.cats.find(cat => cat.name === 'Reviewer').id, conversationIntent: intent,
    expectedOutput: '登入重試修正與審查發現', missingInformation: [],
    budget: { maxDurationMs: 120000, maxTokens: 4000, ...budget } }).result;
  assert.equal(prepared.status, 'prepared');
  if (old) delete prepared.executionRevision;
  const published = appendCollaborationReport({ state, channelId, sourceMessageId: original.message.id,
    report: { schemaVersion: 1, revision: snapshot.revision, status: 'prepared', preparation: prepared,
      feedbackDelivered: true, receipts }, locale: 'zh-TW', now, canExecute: true });
  state = published.state;
  const choiceResponse = { sourceMessageId: published.resultMessage.id, status: 'submitted',
    answers: [{ question: published.resultMessage.choices?.[0].question ?? 'old', selectedOptionIds: [ACCEPT_COLLABORATION] }],
    submittedAt: now.toISOString() };
  if (confirm) state = appendMessage(state, channelId, { body: '執行方案', senderKind: 'user', senderName: 'Owner' }, now,
    { choiceResponse }).state;
  return { state, channelId, choiceResponse, observation: observe(collaborationExecutionDescriptors()), now,
    proposalMessageId: published.resultMessage.id };
}

function clients(h, hooks = {}) {
  const calls = { create: [], send: [], cancel: [], close: [], commit: [] };
  let changed = false, committed = false, coordinatorCalls = 0;
  const workspace = join(tmpdir(), 'cats-k3-owned-worktree');
  const runtime = {
    async getHealth() { return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' }; },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) { return { provider, models: [], warnings: [] }; },
    async getProviderDiagnostics() { return { probe: 'light', providers: [{ provider: 'claude', instance: null, defaultTarget: true,
      availability: { status: hooks.unavailable ? 'unavailable' : 'ok', summary: null, attentionCodes: [] } }] }; },
    async createSession(input) {
      const role = input.workspaceKind === 'worktree' ? 'implementation' : input.workspaceKind === 'source' ? 'review' : 'coordinator';
      calls.create.push({ ...input, role });
      const result = { id: `session-${role}`, provider: input.provider, model: input.model, status: 'ready',
        cwd: role === 'coordinator' ? null : role === 'implementation' ? workspace : input.cwd };
      return hooks.create ? hooks.create(role, result) : result;
    },
    async sendMessage(sessionId, content) {
      calls.send.push({ sessionId, content });
      if (sessionId === 'session-coordinator') {
        const envelope = JSON.parse(content);
        const index = coordinatorCalls++;
        const sequence = [[conversation, {}], [participants, {}], [execute, { role: 'implementation' }], [execute, { role: 'review' }], [inspectWork, {}]];
        const decision = hooks.decide ? await hooks.decide(envelope, index) : envelope.observation.availableTools.length
          ? tool(...sequence[Math.min(index, 4)]) : respond();
        return message(JSON.stringify(decision), hooks.coordinatorTokens ?? 20);
      }
      if (hooks.send) await hooks.send(sessionId, content);
      if (sessionId === 'session-implementation') { changed = !hooks.noChanges; return message('Implemented the fix; tests not run.', hooks.workerTokens ?? 100); }
      return message(JSON.stringify({ commitId: hooks.wrongReview ? baseline : revision,
        verdict: hooks.verdict ?? 'approved', summary: 'Reviewed actual revision; no tests executed.' }), hooks.workerTokens ?? 100);
    },
    async cancelSession(id) { calls.cancel.push(id); },
    async closeSession(id) { calls.close.push(id); if (hooks.close) await hooks.close(id); },
  };
  const delivery = {
    async inspectRepo({ sessionId }) {
      const value = { supported: true, repository: true, clean: !changed || committed, branch: 'isolated',
        headOid: committed ? revision : baseline, stagedCount: 0, modifiedCount: changed && !committed ? 1 : 0, untrackedCount: 0 };
      return hooks.inspect ? hooks.inspect(sessionId, value) : value;
    },
    async createCommit(input) { calls.commit.push(input); committed = true;
      return { state: 'completed', commitId: hooks.wrongCommit ? 'c'.repeat(40) : revision, blockedReasons: [] }; },
  };
  return { runtime, delivery, calls, workspace };
}
async function run(h, clients, store = new MemoryChatStore(h.state), extra = {}) {
  const reports = [];
  const requester = createChatProviderAgentDecisionRequester({ chatStore: store, readState: () => store.read(), deliveryClient: clients.delivery });
  await requester({ state: await store.read(), channelId: h.channelId, observation: h.observation, now: h.now,
    payload: { body: '執行方案', choiceResponse: h.choiceResponse }, runtimeClient: clients.runtime,
    onCollaborationResult: report => reports.push(report), ...extra });
  return { store, reports, report: reports[0] };
}
const intents = async store => (await store.readCore()).tasks.filter(task => task.metadata.collaborationIntent);
async function service(h, c, store = new MemoryChatStore(h.state), extra = {}) {
  return { ...await createChatCollaborationExecution({ chatStore: store, runtimeClient: c.runtime, deliveryClient: c.delivery,
    channelId: h.channelId, choiceResponse: h.choiceResponse, ...extra }), store };
}

test('K3 executes the admitted goal, separate roles, verified revision and feedback in the same coordinator session', async () => {
  const h = fixture(); const c = clients(h);
  const { store, report } = await run(h, c);
  assert.equal(report.execution?.status, 'completed', JSON.stringify(report));
  assert.equal(report.feedbackDelivered, true);
  assert.equal(c.calls.create.length, 3);
  assert.deepEqual(c.calls.create.map(call => call.role), ['coordinator', 'implementation', 'review']);
  assert.equal(c.calls.create[1].workspaceKind, 'worktree');
  assert.equal(c.calls.create[1].permissionMode, 'whitelist');
  assert.equal(c.calls.create[2].workspaceAccess, 'read_only');
  assert.equal(c.calls.create[2].cwd, c.workspace);
  assert.equal(report.execution.implementationEvidence.commitId, revision);
  assert.equal(report.execution.review.commitId, revision);
  assert.notEqual(report.execution.participants[0].catId, report.execution.participants[1].catId);
  assert.equal((await store.read()).channels.length, h.state.channels.length + 1);
  const core = await store.readCore(); const intent = (await intents(store))[0].metadata.collaborationIntent;
  assert.equal(core.tasks.filter(task => task.parentTaskId === intent.id).length, 2);
  assert.equal(core.runs.filter(r => r.metadata.collaborationId === intent.id).length, 2);
  assert.equal(core.artifacts.filter(a => a.metadata.source === 'work-collaboration').length, 2);
  assert.equal(intent.tokensUsed, 300);
  const coordinator = c.calls.send.filter(call => call.sessionId === 'session-coordinator').map(call => JSON.parse(call.content));
  assert.equal(coordinator.length, 5);
  assert.ok(coordinator[0].productKnowledge.entries.some(entry => entry.id === 'orchestrator.execution'));
  assert.equal(coordinator[0].observation.goal, goal);
  assert.equal(coordinator.at(-1).toolResults.at(-1).result.result.review.verdict, 'approved');
  assert.match(c.calls.send.find(call => call.sessionId === 'session-review').content, new RegExp(revision));
  assert.match(describeCollaborationReport(report, 'en'), /does not prove tests passed/u);
});

test('reusing the current Chat adds canonical members once and preserves duplicate identities', async () => {
  const h = fixture({ intent: 'reuse_current' }); const c = clients(h); const events = [];
  const s = await service(h, c, undefined, { publish: (...args) => events.push(args) });
  await Promise.all([s.execute(conversation, {}), s.execute(conversation, {})]);
  await Promise.all([s.execute(participants, {}), s.execute(participants, {})]);
  const before = await s.store.readCore();
  const result = await s.execute(inspectWork, {});
  assert.equal(result.result.channelId, h.channelId);
  assert.equal(result.result.membershipVerified, true);
  assert.equal((await s.store.read()).channels.length, h.state.channels.length);
  assert.equal(events.length, 1);
  const duplicate = await service(h, c, s.store);
  assert.equal(duplicate.created, false);
  assert.equal((await s.store.readCore()).tasks.length, before.tasks.length);
  assert.equal(c.calls.create.length, 0);
});

test('forged or legacy choices and stale proposals cannot admit work', async () => {
  for (const mode of ['legacy', 'question', 'target', 'new_goal', 'no_confirmation']) {
    const h = fixture({ old: mode === 'legacy', confirm: mode !== 'no_confirmation' });
    if (mode === 'question') h.choiceResponse.answers[0].question = 'invented';
    if (mode === 'target') h.state.cats[0].defaultExecutionTarget.model = 'changed';
    if (mode === 'new_goal') h.state = appendMessage(h.state, h.channelId, { body: 'A different task', senderKind: 'user', senderName: 'Owner' }).state;
    const c = clients(h); const { store, report } = await run(h, c);
    assert.equal(report.status, 'stopped', mode);
    assert.equal((await intents(store)).length, 0, mode);
    assert.equal(c.calls.create.length, 0, mode);
  }
});

test('review waits for proven implementation and refuses mismatched commit/cwd/verdict or unavailable provider', async () => {
  const early = fixture(); const earlyClients = clients(early); const s = await service(early, earlyClients);
  await s.execute(conversation, {}); await s.execute(participants, {});
  await assert.rejects(s.execute(execute, { role: 'review' }), /verified_revision_required/u);
  for (const hook of [{ noChanges: true }, { wrongCommit: true }, { wrongReview: true }, { unavailable: true },
    { create: (role, result) => role === 'review' ? { ...result, cwd: join(tmpdir(), 'unrelated') } : result }]) {
    const h = fixture(); const c = clients(h, hook); const { report } = await run(h, c);
    assert.equal(report.execution.status, 'blocked', JSON.stringify(report));
    assert.equal(report.execution.review, undefined);
    if (hook.noChanges || hook.wrongCommit || hook.unavailable) assert.ok(!c.calls.create.some(call => call.role === 'review'));
  }
});

test('review changes requested retains the implementation and attributed findings', async () => {
  const h = fixture(); const c = clients(h, { verdict: 'changes_requested' }); const { report } = await run(h, c);
  assert.equal(report.execution.status, 'blocked');
  assert.equal(report.execution.reason, 'changes_requested');
  assert.equal(report.execution.implementationEvidence.commitId, revision);
  assert.equal(report.execution.review.verdict, 'changes_requested');
  assert.equal(report.feedbackDelivered, true);
});

test('shared token and elapsed budgets include workers and fence late implementation replies', async t => {
  const h = fixture({ budget: { maxTokens: 80 } }); const c = clients(h);
  const result = await run(h, c);
  assert.equal(result.report.execution.status, 'blocked');
  assert.ok(result.report.execution.tokensUsed >= 80);
  assert.equal(c.calls.commit.length, 0);
  let release;
  const slow = fixture();
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const pending = clients(slow, { send: () => new Promise(resolve => {
    release = resolve;
    t.mock.timers.setTime(Date.now() + 120001);
  }) });
  const r = await run(slow, pending);
  assert.equal(r.report.execution.status, 'blocked');
  assert.equal(r.report.execution.reason, 'budget_exhausted');
  release?.(); await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(pending.calls.commit.length, 0);
  assert.ok(pending.calls.cancel.includes('session-implementation'));
});

test('canonical Run stop while a worker is pending prevents commit, review and late resurrection', async () => {
  const h = fixture(); const store = new MemoryChatStore(h.state); let release;
  const c = clients(h, { send: async sessionId => {
    if (sessionId !== 'session-implementation') return;
    const intent = (await intents(store))[0].metadata.collaborationIntent;
    const run = (await store.readCore()).runs.find(entry => entry.id === intent.stages.implementation.runId);
    assert.equal(run.metadata.supervision.runtimeBridge.sessionId, sessionId);
    await stopRun({ coreStore: store, runtimeClient: c.runtime }, run.id);
    await new Promise(resolve => { release = resolve; });
  } });
  const r = await run(h, c, store);
  assert.equal(r.report.execution.status, 'blocked');
  release(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(c.calls.commit.length, 0);
  assert.equal(c.calls.create.filter(call => call.role === 'review').length, 0);
  assert.equal((await intents(store))[0].metadata.collaborationIntent.status, 'blocked');
});

test('metadata persists in existing snapshots; restart stops bridged work and never replays ambiguous creation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cats-k3-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const h = fixture(); const c = clients(h); const file = join(root, 'state.json');
  const store = new FileChatStore(file);
  await store.write(h.state);
  const old = JSON.parse(await readFile(file, 'utf8'));
  const s = await service(h, c, store);
  await s.execute(conversation, {}); await s.execute(participants, {});
  const original = readCollaborationIntent(await store.readCore(), s.port.intentId);
  await store.updateCore(core => writeCollaborationIntent(core, { ...original, status: 'running',
    stages: { ...original.stages, implementation: { ...original.stages.implementation, status: 'starting' } } }));
  const reloaded = new FileChatStore(file);
  await recoverCollaborations(reloaded, c.runtime);
  const recovered = readCollaborationIntent(await reloaded.readCore(), original.id);
  assert.equal(recovered.status, 'blocked');
  assert.equal(recovered.stages.implementation.status, 'blocked');
  assert.equal(recovered.channelId, original.channelId);
  assert.equal(c.calls.create.length, 0);
  assert.equal((await new FileChatStore(file).readCore()).version, old.version);
  const backup = JSON.parse(await readFile(`${file}.bak`, 'utf8'));
  assert.ok(backup.tasks.some(task => task.id === original.id));
  await assert.rejects(store.updateSnapshot(() => { throw new Error('refuse'); }), /refuse/u);
  assert.equal(readCollaborationIntent(await new FileChatStore(file).readCore(), original.id).status, 'blocked');
});

async function waitUntil(check) {
  const deadline = Date.now() + 10000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('Isolated K3 fixture did not settle');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}
async function withApi(t, h, c, executeTest) {
  const root = await mkdtemp(join(tmpdir(), 'cats-k3-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new MemoryChatStore(h.state);
  const auth = await createAuthenticatedTestSession({ now: h.now });
  const mutationGate = createAsyncKeyedGate();
  const requester = createChatProviderAgentDecisionRequester({ chatStore: store, readState: () => store.read(), deliveryClient: c.delivery,
    runChatMutation: (channelId, operation) => mutationGate.run(channelId, operation) });
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeApiKey: '',
    runtimeDataDir: join(root, 'runtime', 'data'), chatStatePath: join(root, 'platform', 'state', 'chat-state.local.json'),
    auth: createTestAuthConfig(), chatProviderAgentDecisionEnabled: true }, runtimeClient: c.runtime,
    authStore: auth.authStore, now: () => h.now }, chat: { chatStore: store, mutationGate, providerAgentDecisionRequester: requester } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const restore = installAuthenticatedFetch(base, auth, { origin: 'http://127.0.0.1:8181' });
  try { await executeTest({ base, store }); } finally {
    restore(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    channelDispatchCancellationRegistry.consume(h.channelId);
  }
}
const sendOwner = (base, h) => fetch(`${base}/api/channels/${h.channelId}/messages`, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '執行方案', choiceResponse: h.choiceResponse }) });

test('authenticated Chat choice ACK runs K3 through the production continuation and merge', async t => {
  for (const intent of ['create', 'reuse_current']) {
    const h = fixture({ intent, confirm: false }); const c = clients(h);
    await withApi(t, h, c, async ({ base, store }) => {
      const response = await sendOwner(base, h);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await response.json()).phase, 'acknowledged');
      await waitUntil(async () => (await store.read()).channels.find(ch => ch.id === h.channelId).messages
        .some(m => m.metadata.collaborationPreparation?.execution)).catch(async () => {
          assert.fail(JSON.stringify({ sessions: c.calls.create.map(call => call.role),
            lastMessage: (await store.read()).channels.find(ch => ch.id === h.channelId).messages.at(-1) }));
        });
      const latest = await store.read();
      const report = latest.channels.find(ch => ch.id === h.channelId).messages.at(-1).metadata.collaborationPreparation;
      assert.equal(report.execution.status, 'completed', JSON.stringify(report));
      assert.equal(report.feedbackDelivered, true);
      assert.equal(latest.channels.find(ch => ch.id === report.execution.channelId).catAssignments.filter(a => a.status === 'active').length, 2);
      assert.equal(latest.channels.find(ch => ch.id === h.channelId).roomRouting.workflow.activeTurn, null);
      const repeated = await sendOwner(base, h);
      assert.equal(repeated.status, 200);
      await waitUntil(async () => !(await store.read()).channels.find(ch => ch.id === h.channelId).roomRouting.workflow.activeTurn);
      assert.equal(c.calls.create.length, 3);
      assert.equal((await intents(store)).length, 1);
    });
  }
});

test('cancel on the normal Chat API stops the worker and retains created conversation and tasks', async t => {
  const h = fixture({ confirm: false }); let release;
  const c = clients(h, { send: () => new Promise(resolve => { release = resolve; }) });
  await withApi(t, h, c, async ({ base, store }) => {
    assert.equal((await sendOwner(base, h)).status, 200);
    await waitUntil(() => Boolean(release));
    assert.equal((await fetch(`${base}/api/channels/${h.channelId}/cancel`, { method: 'POST' })).status, 200);
    await waitUntil(async () => (await store.read()).channels.find(ch => ch.id === h.channelId).messages
      .some(m => m.metadata.collaborationPreparation?.execution));
    const intent = (await intents(store))[0].metadata.collaborationIntent;
    assert.equal(intent.status, 'cancelled');
    assert.ok((await store.read()).channels.some(ch => ch.id === intent.channelId));
    assert.equal(c.calls.commit.length, 0);
    assert.ok(c.calls.cancel.includes('session-implementation'));
    release();
  });
});

test('late Runtime creation after cancellation is cleaned up and cannot receive the goal', async () => {
  const h = fixture(); let cancelled = false, release;
  const c = clients(h, { create: async (role, result) => {
    if (role === 'implementation') await new Promise(resolve => { release = resolve; });
    return result;
  } });
  const pending = run(h, c, undefined, { isCancelled: () => cancelled });
  await waitUntil(() => Boolean(release)); cancelled = true;
  const result = await pending;
  assert.equal(result.report.execution.status, 'cancelled');
  release(); await waitUntil(() => c.calls.close.includes('session-implementation'));
  assert.equal(c.calls.send.some(call => call.sessionId === 'session-implementation'), false);
  assert.equal(c.calls.commit.length, 0);
});

test('changing scope while the worker is pending cancels only owned work and preserves the edit', async () => {
  const h = fixture(); const store = new MemoryChatStore(h.state); let release;
  const c = clients(h, { send: async () => {
    await store.updateSnapshot(({ chat, core }) => {
      chat.cats[0].defaultExecutionTarget.model = 'owner-changed'; return { chat, core };
    });
    await new Promise(resolve => { release = resolve; });
  } });
  const result = await run(h, c, store);
  assert.equal(result.report.execution.status, 'blocked');
  assert.equal(result.report.execution.reason, 'stale_context');
  assert.equal((await store.read()).cats[0].defaultExecutionTarget.model, 'owner-changed');
  assert.equal(c.calls.commit.length, 0);
  release();
});

test('concurrent role requests start one attempt and unknown operation inputs are rejected', async () => {
  const h = fixture(); const c = clients(h); const s = await service(h, c);
  await s.execute(conversation, {}); await s.execute(participants, {});
  assert.equal((await s.execute(execute, { role: 'implementation', path: 'elsewhere' })).status, 'rejected');
  assert.equal((await s.execute(conversation, { channelId: 'elsewhere' })).status, 'rejected');
  await Promise.all([s.execute(execute, { role: 'implementation' }), s.execute(execute, { role: 'implementation' })]);
  assert.equal(c.calls.create.length, 0, 'the queue tool must perform no Runtime work');
  await Promise.all([executeCollaborationRole(s.port, 'implementation'), executeCollaborationRole(s.port, 'implementation')]);
  assert.equal(c.calls.create.length, 1);
  assert.equal(c.calls.commit.length, 1);
  const receipt = await s.execute(stop, {});
  assert.equal(receipt.result.status, 'cancelled');
  assert.ok(receipt.result.implementationEvidence);
});

test('usage persistence cannot resurrect an externally cancelled parent Task', async () => {
  const h = fixture(); const c = clients(h); const s = await service(h, c);
  await s.store.updateCore(core => upsertCoreTask(core, {
    ...core.tasks.find(task => task.id === s.port.intentId), status: 'cancelled',
  }).core);
  await assert.rejects(recordCollaborationUsage(s.port, 10), /cancelled/u);
  const core = await s.store.readCore();
  assert.equal(core.tasks.find(task => task.id === s.port.intentId).status, 'cancelled');
  assert.equal(readCollaborationIntent(core, s.port.intentId).tokensUsed, 10);
  assert.equal(c.calls.create.length, 0);
});

test('review Task cannot be checked out before evidence and canonical dependencies identify implementation', async () => {
  const h = fixture(); const c = clients(h); const s = await service(h, c);
  const core = await s.store.readCore(); const intent = readCollaborationIntent(core, s.port.intentId);
  const task = core.tasks.find(entry => entry.id === intent.stages.review.taskId);
  assert.equal(task.status, 'pending_approval');
  assert.deepEqual(task.metadata.planning.dependsOnTaskIds, [intent.stages.implementation.taskId]);
  assert.throws(() => checkoutTaskExecution({ core, taskId: task.id, actorId: intent.workers.review.actorId }), /must be approved/u);
});

test('restart reconciles a cancelled parent with a real queued ambiguous create and unfinished bridged session', async () => {
  const h = fixture(); const c = clients(h); const s = await service(h, c);
  await s.execute(conversation, {}); await s.execute(participants, {});
  await s.execute(execute, { role: 'implementation' });
  await s.store.updateCore(core => {
    const intent = readCollaborationIntent(core, s.port.intentId);
    intent.status = 'cancelled'; intent.reason = 'cancelled';
    intent.stages.implementation.status = 'starting';
    intent.coordinatorSessionId = 'session-coordinator';
    return writeCollaborationIntent(core, intent);
  });
  await recoverCollaborations(s.store, c.runtime);
  let intent = readCollaborationIntent(await s.store.readCore(), s.port.intentId);
  assert.equal(intent.stages.implementation.status, 'blocked');
  assert.equal(intent.coordinatorClosed, true);
  assert.equal(c.calls.create.length, 0);
  await s.store.updateCore(core => {
    intent = readCollaborationIntent(core, s.port.intentId);
    intent.stages.implementation = { ...intent.stages.implementation, status: 'running', sessionId: 'worker-before-crash', sessionClosed: false };
    const run = core.runs.find(entry => entry.id === intent.stages.implementation.runId);
    core = upsertCoreRun(core, { ...run, status: 'running', metadata: { ...run.metadata,
      supervision: { runtimeBridge: { sessionId: 'worker-before-crash' } } } }).core;
    return writeCollaborationIntent(core, intent);
  });
  await recoverCollaborations(s.store, c.runtime);
  assert.ok(c.calls.cancel.includes('worker-before-crash'));
  assert.ok(c.calls.close.includes('worker-before-crash'));
  const before = c.calls.close.length;
  await recoverCollaborations(s.store, c.runtime);
  assert.equal(c.calls.close.length, before, 'confirmed cleanup need not be repeated');
});

test('an equivalent owner confirmation during a pending worker observes the same intent without revocation', async () => {
  const h = fixture(); const store = new MemoryChatStore(h.state); let release;
  const c = clients(h, { send: sessionId => sessionId === 'session-implementation'
    ? new Promise(resolve => { release = resolve; }) : Promise.resolve() });
  const pending = run(h, c, store);
  await waitUntil(() => Boolean(release));
  await store.updateSnapshot(({ chat, core }) => ({ core, chat: appendMessage(chat, h.channelId,
    { body: '執行方案', senderKind: 'user', senderName: 'Owner' }, new Date(), { choiceResponse: h.choiceResponse }).state }));
  const duplicate = await run(h, c, store);
  assert.equal(duplicate.report.execution.status, 'running');
  assert.equal(c.calls.create.filter(call => call.role === 'implementation').length, 1);
  release();
  assert.equal((await pending).report.execution.status, 'completed');
});

test('HTTP duplicate confirmation during a pending worker cannot start or cancel another attempt', async t => {
  const h = fixture({ confirm: false }); let release;
  const c = clients(h, { send: id => id === 'session-implementation'
    ? new Promise(resolve => { release = resolve; }) : Promise.resolve() });
  await withApi(t, h, c, async ({ base, store }) => {
    assert.equal((await sendOwner(base, h)).status, 200);
    await waitUntil(() => Boolean(release));
    const originalTurn = (await store.read()).channels.find(ch => ch.id === h.channelId).roomRouting.workflow.activeTurn.id;
    const response = await sendOwner(base, h);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).idempotent, true);
    assert.equal((await store.read()).channels.find(ch => ch.id === h.channelId).roomRouting.workflow.activeTurn.id, originalTurn);
    assert.equal((await fetch(`${base}/api/channels/${h.channelId}/cancel`, { method: 'POST' })).status, 200);
    await waitUntil(async () => (await intents(store))[0]?.metadata.collaborationIntent.status === 'cancelled');
    release();
    assert.equal((await intents(store)).length, 1);
    assert.equal(c.calls.create.length, 2);
    assert.equal(c.calls.commit.length, 0);
  });
});

test('paused continuity cleanup preserves a collaboration created in another channel', async t => {
  const h = fixture({ confirm: false });
  h.state = createChannel(h.state, { title: 'Other default chat', topic: '', originSurface: 'chat', entryKind: 'default' });
  const otherId = h.state.selectedChannelId;
  h.state.channels.find(ch => ch.id === otherId).orchestratorLease.sessionId = 'old-default';
  let releaseCleanup, releaseWorker;
  const c = clients(h, { close: id => id === 'old-default'
    ? new Promise(resolve => { releaseCleanup = resolve; }) : Promise.resolve(),
  send: id => id === 'session-implementation' ? new Promise(resolve => { releaseWorker = resolve; }) : Promise.resolve() });
  await withApi(t, h, c, async ({ base, store }) => {
    const resetting = fetch(`${base}/api/channels/${otherId}`, { method: 'PATCH',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resetContinuity: true }) });
    await waitUntil(() => Boolean(releaseCleanup));
    assert.equal((await sendOwner(base, h)).status, 200);
    await waitUntil(() => Boolean(releaseWorker));
    const targetId = (await intents(store))[0].metadata.collaborationIntent.channelId;
    releaseCleanup();
    assert.equal((await resetting).status, 200);
    const chat = await store.read();
    assert.ok(chat.channels.some(ch => ch.id === targetId));
    assert.ok(chat.channels.find(ch => ch.id === otherId).continuityResetAt);
    releaseWorker();
    await waitUntil(async () => (await intents(store))[0].metadata.collaborationIntent.status === 'completed');
  });
});

test('Run cancellation during Runtime create persists the late bridge but never sends the goal', async () => {
  const h = fixture(); let release;
  const c = clients(h, { create: async (role, result) => {
    if (role === 'implementation') await new Promise(resolve => { release = resolve; });
    return result;
  } });
  const store = new MemoryChatStore(h.state);
  const pending = run(h, c, store);
  await waitUntil(() => Boolean(release));
  const intent = (await intents(store))[0].metadata.collaborationIntent;
  await stopRun({ coreStore: store, runtimeClient: c.runtime }, intent.stages.implementation.runId,
    { idempotencyKey: 'owner-stop-during-create', requestedByActorId: intent.ownerActorId, reason: 'cancelled' });
  release();
  assert.notEqual((await pending).report.execution.status, 'completed');
  await waitUntil(() => c.calls.close.includes('session-implementation'));
  assert.equal(c.calls.send.some(call => call.sessionId === 'session-implementation'), false);
  assert.equal(readCollaborationIntent(await store.readCore(), intent.id).stages.implementation.sessionId, 'session-implementation');
});

test('late coordinator create with failed cleanup remains recoverable after cancellation', async () => {
  const h = fixture(); let release, cancelled = false, failCleanup = true;
  const c = clients(h, { create: async (role, result) => {
    if (role === 'coordinator') await new Promise(resolve => { release = resolve; });
    return result;
  }, close: async () => { if (failCleanup) throw new Error('offline'); } });
  const store = new MemoryChatStore(h.state);
  const pending = run(h, c, store, { isCancelled: () => cancelled });
  await waitUntil(() => Boolean(release)); cancelled = true;
  await pending; release();
  await waitUntil(() => c.calls.close.includes('session-coordinator'));
  let intent = (await intents(store))[0].metadata.collaborationIntent;
  assert.equal(intent.coordinatorSessionId, 'session-coordinator');
  assert.equal(intent.coordinatorClosed, false);
  assert.equal(c.calls.send.length, 0);
  failCleanup = false;
  await recoverCollaborations(store, c.runtime);
  intent = readCollaborationIntent(await store.readCore(), intent.id);
  assert.equal(intent.coordinatorClosed, true);
});

test('recovery completes a parent fence before any queued or pending child was stopped', async () => {
  const h = fixture(); const c = clients(h); const s = await service(h, c);
  await s.execute(conversation, {}); await s.execute(participants, {});
  await s.execute(execute, { role: 'implementation' });
  await s.store.updateCore(core => {
    const intent = readCollaborationIntent(core, s.port.intentId);
    return writeCollaborationIntent(core, { ...intent, status: 'cancelled', reason: 'cancelled' });
  });
  await recoverCollaborations(s.store, c.runtime);
  const core = await s.store.readCore(); const intent = readCollaborationIntent(core, s.port.intentId);
  assert.equal(intent.stages.implementation.status, 'cancelled');
  assert.equal(intent.stages.review.status, 'cancelled');
  assert.equal(core.runs.find(run => run.id === intent.stages.implementation.runId).status, 'cancelled');
  assert.equal(c.calls.create.length, 0);
});

test('the queue acceptance is durable before host Runtime creation and does not grant broader inputs', async () => {
  const h = fixture(); const store = new MemoryChatStore(h.state);
  const c = clients(h, { create: async (role, result) => {
    if (role !== 'coordinator') {
      const intent = (await intents(store))[0].metadata.collaborationIntent;
      const receipt = intent.receipts.at(-1);
      assert.equal(receipt.toolName, execute);
      assert.equal(receipt.result.status, 'applied');
      assert.equal(receipt.result.result.stages[role].status, 'queued');
      assert.equal(intent.executionGrant.source, 'owner_choice');
    }
    return result;
  } });
  assert.equal((await run(h, c, store)).report.execution.status, 'completed');
});

test('host refuses altered owner scope, permission grant and queued Run ownership before Runtime work', async () => {
  for (const alter of ['goal', 'budget', 'permission', 'run']) {
    const h = fixture(); const c = clients(h); const s = await service(h, c);
    await s.execute(conversation, {}); await s.execute(participants, {});
    await s.execute(execute, { role: 'implementation' });
    await s.store.updateCore(core => {
      const intent = readCollaborationIntent(core, s.port.intentId);
      if (alter === 'goal') intent.goal = 'Different goal';
      if (alter === 'budget') intent.budget.maxTokens += 1;
      if (alter === 'permission') intent.executionGrant.implementationTools.push('shell');
      if (alter === 'run') core.runs.find(run => run.id === intent.stages.implementation.runId).metadata.ownerActorId = 'another-owner';
      return writeCollaborationIntent(core, intent);
    });
    await assert.rejects(executeCollaborationRole(s.port, 'implementation'), /stale_context|invalid_owner_grant/u);
    assert.equal(c.calls.create.length, 0);
  }
});

test('insufficient coordinator scope and unsupported cost caps cannot admit collaboration', async () => {
  for (const mode of ['read_only', 'none', 'cost']) {
    const h = fixture(); const c = clients(h);
    const observation = structuredClone(h.observation);
    if (mode === 'read_only') observation.policy.dials.toolScope = 'read_only';
    if (mode === 'none') observation.policy.dials.autonomy = 'none';
    if (mode === 'cost') observation.budget.maxCostUsd = 1;
    const result = await run(h, c, undefined, { observation });
    assert.equal(c.calls.create.length, 0);
    assert.equal((await intents(result.store)).length, 0);
    assert.equal(result.report.status, 'stopped');
  }
});
