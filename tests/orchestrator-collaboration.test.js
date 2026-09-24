import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../build/server/app/server/index.js';
import { createAuthenticatedTestSession, createTestAuthConfig, installAuthenticatedFetch } from './testUtils.js';
import { channelDispatchCancellationRegistry } from '../build/server/products/chat/state/runtime-dispatch/cancellation.js';
import { describeCollaborationReport } from '../build/server/products/chat/state/orchestratorCollaborationReport.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel, createCat, appendMessage } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  collaborationSnapshot, collaborationToolDescriptors, executeCollaborationRead,
  DISCOVER_COLLABORATION_CATS as discover, INSPECT_COLLABORATION_CONTEXT as inspect,
  PREPARE_COLLABORATION as prepare,
} from '../build/server/products/chat/state/orchestratorCollaboration.js';
import { createChatProviderAgentDecisionRequester } from '../build/server/products/chat/state/providerAgentDecisionRequester.js';
import { buildChatProviderAgentObservation } from '../build/server/products/chat/state/providerAgentObservation.js';
import { resolveProviderCapabilityProfile } from '../build/server/platform/supervision/providerCapabilityProfiles.js';
import { buildProviderAgentDecisionPrompt } from '../build/server/platform/orchestration/providerAgentAdapter.js';
import { beginChannelMessageDispatch, beginChannelMessageRetryDispatch, continueBegunChannelMessageDispatch } from '../build/server/products/chat/state/runtime-dispatch/routing.js';
import { prepareDispatchTurnForUserMessage } from '../build/server/products/chat/state/runtime-dispatch/turn.js';

const now = new Date('2026-09-25T08:00:00Z');
const goal = '修好登入重試 bug，找另一隻 Cat review，預期交付修正與測試結果。';
const policy = { dials: { autonomy: 'single_step', taskGranularity: 'tiny', toolScope: 'read_only',
  scaffolding: 'few_shot', validation: 'schema_required', checkpointCadence: 'every_step',
  approvalThreshold: 'low', fallbackPolicy: 'retry' }, allowedFallbacks: ['retry'] };

function fixture(originSurface = 'chat') {
  let state = createDefaultChatState();
  state = createChannel(state, { title: 'Current scope', topic: 'Bug fix', originSurface,
    responseLanguage: 'zh-TW', roomMode: 'chat_channel',
    cats: [{ name: 'Implementer', provider: 'claude', instance: 'native', roles: ['implementation'] }],
  }, now);
  const channelId = state.selectedChannelId;
  state = createCat(state, { name: 'Reviewer', provider: 'claude', instance: 'native', roles: ['review'] }, now);
  state = createChannel(state, { title: 'PRIVATE-TITLE', topic: 'PRIVATE-TOPIC', originSurface: 'chat',
    roomMode: 'direct_message', cats: [{ name: 'Private Cat', provider: 'claude' }] }, now);
  const privateChannel = state.channels.find((channel) => channel.id !== channelId);
  state = appendMessage(state, privateChannel.id, { body: 'PRIVATE-SECRET', senderKind: 'user', senderName: 'Owner' }, now).state;
  state.cats.at(-1).products = ['work'];
  state.selectedChannelId = channelId;
  const profile = resolveProviderCapabilityProfile(state.globalOrchestrator.visibleParticipant.executionTarget,
    { assessedAt: now.toISOString() });
  const observation = buildChatProviderAgentObservation({ state, channelId, actorRef: 'orchestrator',
    capabilityProfile: profile, policy: policy.dials, availableTools: collaborationToolDescriptors(policy),
    goal, messageCharacterCount: goal.length,
    routing: { trigger: 'room_default', resolution: { selectionKind: 'default_target' },
      targetCount: 1, unresolvedCount: 0, mentionCount: 0 }, now });
  return { state, channelId, observation };
}
function tool(name, input, id = name) {
  return { contractVersion: 1, kind: 'tool_request', decisionId: id, confidence: 'high',
    toolName: name, target: { kind: 'worker_tool', toolName: name }, input,
    expectedOutputSchemaRef: { id: `${name}.output`, version: '1.0', format: 'json_schema' },
    rationaleSummary: 'Use the current authorized context.' };
}
function respond() {
  return { contractVersion: 1, kind: 'semantic_plan', decisionId: 'respond', planId: 'response',
    confidence: 'high', rationaleSummary: 'Acknowledge the actual preparation result.',
    steps: [{ stepId: 'respond', summary: 'Only preparation has completed.', action: 'respond' }] };
}
function proposal(envelope, change = {}) {
  const discovery = envelope.toolResults.find((receipt) => receipt.toolName === discover).result.result;
  return { revision: discovery.revision,
    implementerId: discovery.candidates[0].id, reviewerId: discovery.candidates[1].id,
    conversationIntent: 'create', expectedOutput: '修正、測試结果與可供審查的版本。', missingInformation: [],
    budget: { maxDurationMs: 120000, maxTokens: 4000 }, ...change };
}
function client(handler = (envelope, index) => index === 0 ? tool(discover, {})
  : index === 1 ? tool(inspect, {}) : index === 2 ? tool(prepare, proposal(envelope)) : respond()) {
  const calls = { create: [], send: [], cancel: [], close: [], diagnostics: [] };
  return { calls,
    async getHealth() { return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' }; },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) { return { provider, backend: 'cli', instance: 'default',
      defaultModel: null, source: 'config', cache: null, models: [], warnings: [] }; },
    async createSession(input) { calls.create.push(input); return { id: 'decision-session', provider: input.provider,
      model: input.model, status: 'ready', cwd: null }; },
    async sendMessage(sessionId, content, input) {
      const envelope = JSON.parse(content);
      const index = calls.send.length;
      calls.send.push({ sessionId, envelope, input });
      const result = await handler(envelope, index);
      return { segments: [{ kind: 'text', text: JSON.stringify(result), toolName: null, toolId: null }],
        inputTokens: 10, outputTokens: 10, tokensUsed: 20 };
    },
    async getProviderDiagnostics(query) {
      calls.diagnostics.push(query);
      return { probe: 'light', providers: [{ provider: 'claude', instance: 'native', defaultTarget: true,
        availability: { status: 'ok', summary: 'PRIVATE-DIAGNOSTIC', attentionCodes: [] } }] };
    },
    async cancelSession(id) { calls.cancel.push(id); },
    async closeSession(id) { calls.close.push(id); },
  };
}
async function request(h, runtimeClient, options = {}, extra = {}) {
  const reports = [];
  const result = await createChatProviderAgentDecisionRequester(options)({ ...h, runtimeClient,
    payload: { body: goal }, now, onCollaborationResult: (report) => reports.push(report), ...extra });
  return { result, reports };
}

test('discovery and inspection project only bounded current owner Chat scope and declared capabilities', () => {
  const h = fixture();
  const before = structuredClone(h.state);
  const snapshot = collaborationSnapshot(h.state, h.channelId, h.observation);
  assert.equal(snapshot.candidates.length, 2);
  const execute = (toolName, toolInput) => executeCollaborationRead({ toolName, toolInput,
    snapshot, goal, receipts: [] });
  const found = execute(discover, { limit: 1 });
  assert.equal(found.result.candidates.length, 1);
  assert.equal(found.result.truncated, true);
  assert.equal(found.result.candidates[0].capabilityEvidence, 'declared_only');
  assert.equal(found.result.candidates[0].providerAvailability, 'unknown');
  assert.equal(execute(discover, { query: 'review' }).result.candidates[0].name, 'Reviewer');
  assert.equal(execute(inspect, { conversationId: 'private' }).status, 'rejected');
  for (const value of [null, { limit: 0 }, { limit: 17 }, { query: 'x'.repeat(129) }, { includeArchived: true }]) {
    assert.equal(execute(discover, value).status, 'rejected');
  }
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE-/u);
  assert.deepEqual(h.state, before);
  assert.equal(collaborationToolDescriptors({ ...policy, dials: { ...policy.dials, toolScope: 'none' } }).length, 0);
  assert.equal(collaborationToolDescriptors({ ...policy, parentToolScope: 'none' }).length, 0);
});

test('real requester delivers goal, discovery/context results and validated preparation to one decision session', async () => {
  const h = fixture();
  const before = structuredClone(h.state);
  const runtime = client();
  const { result, reports } = await request(h, runtime);
  assert.equal(result, null);
  assert.equal(reports[0].status, 'prepared', JSON.stringify(reports));
  assert.equal(reports[0].feedbackDelivered, true);
  assert.equal(runtime.calls.create.length, 1);
  assert.equal(runtime.calls.create[0].permissionMode, 'default');
  assert.equal(runtime.calls.create[0].workspaceAccess, 'read_only');
  assert.equal(runtime.calls.create[0].sharingMode, 'isolated');
  assert.deepEqual(runtime.calls.create[0].skills.requestedSkills, []);
  assert.equal(runtime.calls.send.length, 4);
  assert.deepEqual(new Set(runtime.calls.send.map((call) => call.sessionId)), new Set(['decision-session']));
  assert.equal(new Set(runtime.calls.send.map((call) => call.envelope.observation.observationId)).size, 4);
  assert.equal(runtime.calls.send[0].envelope.observation.goal, goal);
  assert.ok(runtime.calls.send[0].envelope.productKnowledge.entries.some((entry) => entry.id === 'orchestrator.discovery'));
  const prepared = runtime.calls.send[3].envelope.toolResults[2].result.result;
  assert.notEqual(prepared.implementer.id, prepared.reviewer.id);
  assert.equal(prepared.reviewDependsOn, 'verified_implementation_artifact_or_revision');
  assert.equal(prepared.budget.admission, 'not_admitted');
  assert.equal(prepared.execution, 'not_started');
  assert.equal(prepared.contextScope.otherConversations, false);
  assert.equal(prepared.originSurface, 'chat');
  assert.doesNotMatch(JSON.stringify(runtime.calls.send), /PRIVATE-|PRIVATE-DIAGNOSTIC/u);
  assert.deepEqual(h.state, before);
  assert.deepEqual(runtime.calls.close, ['decision-session']);
});

test('unknown, duplicate, undiscovered and stale targets are rejected and rejection reaches the same model', async () => {
  for (const change of [{ reviewerId: 'invented' }, { reviewerId: fixture().state.cats[0].id },
    { revision: 'stale' }]) {
    const h = fixture();
    const actualChange = change.reviewerId && change.reviewerId !== 'invented'
      ? { reviewerId: h.state.cats[0].id } : change;
    const runtime = client((envelope, index) => index === 0 ? tool(discover, {})
      : index === 1 ? tool(inspect, {}) : index === 2 ? tool(prepare, proposal(envelope, actualChange)) : respond());
    const { reports } = await request(h, runtime);
    assert.equal(reports[0].receipts[2].result.status, 'rejected');
    assert.equal(runtime.calls.send[3].envelope.toolResults[2].result.status, 'rejected');
    assert.notEqual(reports[0].status, 'prepared');
  }
});

test('missing user input is distinct from unavailable teammates; current readiness uses exact instance', async () => {
  for (const mode of ['needs_input', 'unavailable', 'other_instance']) {
    const h = fixture();
    if (mode === 'other_instance') h.state.cats[1].defaultExecutionTarget.instance = 'different';
    const runtime = client((envelope, index) => index === 0 ? tool(discover, {})
      : index === 1 ? tool(inspect, {}) : index === 2 ? tool(prepare, proposal(envelope,
        mode === 'needs_input' ? { missingInformation: ['Which bug should be fixed?'] }
          : mode === 'unavailable' ? { reviewerId: undefined } : {})) : respond());
    const { reports } = await request(h, runtime);
    assert.equal(reports[0].status, mode === 'other_instance' ? 'prepared' : mode);
    if (mode === 'other_instance') assert.equal(reports[0].preparation.reviewer.providerAvailability, 'unknown');
  }
});

test('scope, binding, roster and latest user changes invalidate an in-flight read before proposal publication', async () => {
  for (const change of [
    h => { h.state.cats[1].status = 'archived'; },
    h => { h.state.cats[1].defaultExecutionTarget.model = 'changed'; },
    h => { h.state.globalOrchestrator.visibleParticipant.executionTarget.instance = 'changed'; },
    h => { h.state.channels.find(entry => entry.id === h.channelId).originSurface = 'code'; },
    h => { h.state = appendMessage(h.state, h.channelId, { senderKind: 'user', senderName: 'Owner', body: 'Changed goal' }, now).state; },
  ]) {
    const h = fixture();
    const runtime = client((envelope, index) => { if (index === 0) change(h); return tool(discover, {}); });
    const { reports } = await request(h, runtime, { readState: async () => h.state });
    assert.equal(reports[0].status, 'stopped');
    assert.equal(reports[0].reason, 'stale_context');
    assert.equal(reports[0].receipts.length, 0);
    assert.equal(runtime.calls.send.length, 1);
  }
});

test('elapsed and usage limits stop the loop, cancel in-flight work and close the owned session', async () => {
  const h = fixture();
  h.observation.budget.maxDurationMs = 200;
  const runtime = client((envelope, index) => index === 0 ? tool(discover, {}) : new Promise(() => {}));
  const started = Date.now();
  const { reports } = await request(h, runtime);
  assert.equal(reports[0].reason, 'budget_exhausted');
  assert.ok(Date.now() - started < 1500);
  assert.deepEqual(runtime.calls.cancel, ['decision-session']);
  assert.deepEqual(runtime.calls.close, ['decision-session']);
  const usage = fixture(); usage.observation.budget.maxTokens = 10;
  const usageRuntime = client();
  assert.equal((await request(usage, usageRuntime)).reports[0].reason, 'budget_exhausted');
  assert.equal(usageRuntime.calls.send.length, 1);
  const repeats = client(() => tool(inspect, {}));
  const repeated = await request(fixture(), repeats);
  assert.equal(repeated.reports[0].status, 'stopped');
  assert.ok(repeats.calls.send.length <= 5);
});

test('cancel, malformed response, unsupported tool and wrong revision fail without dispatching work', async () => {
  for (const mutation of [
    decision => { decision.toolName = 'chat.create'; decision.target.toolName = 'chat.create'; },
    decision => { decision.expectedOutputSchemaRef.version = '2.0'; },
    decision => { decision.target.toolName = 'different'; },
  ]) {
    const runtime = client((envelope, index) => { if (index === 0) return tool(discover, {});
      const result = tool(inspect, {}); mutation(result); return result; });
    const { reports } = await request(fixture(), runtime, { failureMode: 'return_null' });
    assert.equal(reports[0].status, 'stopped');
    assert.equal(reports[0].receipts.length, 1);
  }
  const runtime = client();
  assert.equal((await request(fixture(), runtime, {}, { isCancelled: () => true })).reports[0].reason, 'cancelled');
  assert.equal(runtime.calls.create.length, 0);
  assert.throws(() => buildProviderAgentDecisionPrompt(fixture().observation, undefined,
    [{ toolName: discover, decisionId: 'large', result: { status: 'applied', result: 'x'.repeat(24001) } }]),
  /bounded envelope/u);
});

test('production turn exposes discovery only for verified local coordinator routing, and includes actual goal', () => {
  for (const mode of ['coordinator', 'code', 'work', 'provider_default', 'direct', 'multi', 'telegram', 'unverified_entry']) {
    const h = fixture(mode === 'code' || mode === 'work' ? mode : 'chat');
    const channel = h.state.channels.find((entry) => entry.id === h.channelId);
    const payload = { body: goal };
    if (mode === 'provider_default') {
      channel.catAssignments = []; channel.participantAssignments = []; channel.pendingProvider = 'claude';
    }
    if (mode === 'direct') { channel.channelKind = 'direct_message'; channel.roomRouting.mode = 'direct_message'; }
    if (mode === 'multi') payload.messageMetadata = { recipientParticipantIds: ['orchestrator', channel.catAssignments[0].participantId], workflowShape: 'concurrent' };
    const appended = appendMessage(h.state, h.channelId, { senderKind: 'user', senderName: 'Owner', body: goal }, now);
    const prepared = prepareDispatchTurnForUserMessage(appended.state, h.channelId, payload, appended.message,
      now, undefined, { enableCollaborationReads: mode !== 'unverified_entry', ...(mode === 'telegram' ? { transport: 'telegram' } : {}) });
    const tools = prepared.providerAgentObservation?.availableTools ?? [];
    assert.equal(tools.some(({ manifest }) => manifest.name === discover), mode === 'coordinator', mode);
    assert.equal(prepared.providerAgentObservation?.goal === goal, mode === 'coordinator');
  }
});

test('production begin/retry returns a localized proposal with receipts and creates no collaboration resources', async () => {
  const h = fixture();
  const store = new MemoryChatStore(h.state);
  const initialCore = await store.readCore();
  const runtime = client();
  const requester = createChatProviderAgentDecisionRequester({ readState: () => store.read() });
  const begun = await beginChannelMessageDispatch(h.state, h.channelId, { body: goal }, runtime, now,
    { chatStore: store, providerAgentDecisionRequester: requester, enableCollaborationReads: true });
  assert.equal(runtime.calls.send.length, 0, 'ACK must precede inference');
  assert.ok(begun.state.channels.find((entry) => entry.id === h.channelId).roomRouting.workflow.activeTurn);
  const completed = await continueBegunChannelMessageDispatch(begun, h.channelId, runtime, now,
    { chatStore: store, providerAgentDecisionRequester: requester, enableCollaborationReads: true });
  const message = completed.state.channels.find((entry) => entry.id === h.channelId).messages.at(-1);
  assert.equal(message.metadata?.collaborationPreparation?.status, 'prepared', JSON.stringify(message));
  assert.match(message.body, /尚未建立對話/u);
  assert.equal(completed.state.channels.find((entry) => entry.id === h.channelId).roomRouting.workflow.activeTurn, null);
  assert.equal(completed.state.channels.length, h.state.channels.length);
  assert.deepEqual(completed.state.cats.map(cat => cat.id), h.state.cats.map(cat => cat.id));
  const core = await store.readCore();
  // Ordinary Chat updates existing workflow projections; no collaboration resource is created/admitted.
  for (const key of ['tasks', 'workItems', 'projects']) {
    assert.deepEqual(core[key].map(({ id, status }) => ({ id, status })),
      initialCore[key].map(({ id, status }) => ({ id, status })), key);
  }
  assert.ok(core.runs.every(run => run.id.startsWith('run-room-routing-')),
    'Only ordinary Chat turn projections may be added; no teammate execution run starts.');
  const retryRuntime = client();
  const retry = await beginChannelMessageRetryDispatch(completed.state, h.channelId, begun.userMessage.id,
    retryRuntime, now, { chatStore: store, providerAgentDecisionRequester: requester, enableCollaborationReads: true });
  await continueBegunChannelMessageDispatch(retry, h.channelId, retryRuntime, now,
    { chatStore: store, providerAgentDecisionRequester: requester });
  assert.equal(retryRuntime.calls.send.length, 4);
});

test('a rejected read is reported as incomplete, and native tool output fails closed', async () => {
  const invalid = client((envelope, index) => index === 0 ? tool(inspect, { channelId: 'other' }) : respond());
  const { reports } = await request(fixture(), invalid);
  assert.equal(reports[0].receipts[0].result.status, 'rejected');
  assert.doesNotMatch(describeCollaborationReport(reports[0], 'en'), /context inspected|conversation inspected/iu);
  const native = client();
  const send = native.sendMessage.bind(native);
  native.sendMessage = async (...args) => {
    const response = await send(...args);
    response.segments.push({ kind: 'tool_use', text: '', toolName: 'shell', toolId: 'native-tool' });
    return response;
  };
  assert.equal((await request(fixture(), native)).reports[0].status, 'stopped');
  assert.equal(native.calls.send.length, 1);
});

test('edits during session close invalidate preparation before publication', async () => {
  const h = fixture();
  const runtime = client();
  runtime.closeSession = async () => { h.state.cats[0].roles = ['changed']; };
  const { reports } = await request(h, runtime, { readState: async () => h.state });
  assert.equal(reports[0].reason, 'stale_context');
  assert.equal(reports[0].preparation, undefined);
});

test('a newer owner message before the first read cannot become the baseline for an older goal', async () => {
  const h = fixture();
  const changed = appendMessage(h.state, h.channelId, { senderKind: 'user', senderName: 'Owner', body: 'New request' }, now).state;
  const runtime = client();
  const { reports } = await request(h, runtime, { readState: async () => changed });
  assert.equal(reports[0].reason, 'stale_context');
  assert.equal(runtime.calls.create.length, 0);
});

test('an ordinary first response preserves normal Chat fallback when Runtime usage is unavailable', async () => {
  const runtime = client(() => respond());
  const send = runtime.sendMessage.bind(runtime);
  runtime.sendMessage = async (...args) => ({ ...await send(...args), inputTokens: 0, outputTokens: 0, tokensUsed: 0 });
  const { result, reports } = await request(fixture(), runtime);
  assert.equal(result.kind, 'semantic_plan');
  assert.deepEqual(reports, []);
});

async function withApi(t, runtime, execute) {
  const root = await mkdtemp(join(tmpdir(), 'cats-collaboration-api-'));
  t.after(async () => {
    assert.ok(root.startsWith(join(tmpdir(), 'cats-collaboration-api-')));
    await rm(root, { recursive: true, force: true });
  });
  const h = fixture();
  const store = new MemoryChatStore(h.state);
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now });
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeApiKey: '',
    runtimeDataDir: join(root, 'runtime', 'data'), chatStatePath: join(root, 'platform', 'state', 'chat-state.local.json'),
    auth: authConfig, chatProviderAgentDecisionEnabled: true },
    runtimeClient: runtime, authStore: auth.authStore, now: () => now,
  }, chat: { chatStore: store } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const restore = installAuthenticatedFetch(base, auth, { origin: 'http://127.0.0.1:8181' });
  try { await execute({ ...h, store, base }); } finally {
    restore(); server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    channelDispatchCancellationRegistry.consume(h.channelId);
  }
}
async function waitUntil(check) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for isolated collaboration fixture');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const sendOwner = (base, channelId) => fetch(`${base}/api/channels/${channelId}/messages`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: goal }),
});

test('authenticated API acknowledges before inference and normal cancel settles the preparation', async (t) => {
  let release;
  const runtime = client(async () => { await new Promise(resolve => { release = resolve; }); return tool(discover, {}); });
  await withApi(t, runtime, async ({ base, channelId, store }) => {
    const response = await sendOwner(base, channelId);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).phase, 'acknowledged');
    await waitUntil(() => runtime.calls.send.length === 1);
    const cancel = await fetch(`${base}/api/channels/${channelId}/cancel`, { method: 'POST' });
    assert.equal(cancel.status, 200);
    await waitUntil(async () => (await store.read()).channels.find(c => c.id === channelId)
      .messages.some(message => message.metadata?.collaborationPreparation?.reason === 'cancelled'));
    assert.equal(channelDispatchCancellationRegistry.read(channelId), null);
    assert.equal((await store.read()).channels.find(c => c.id === channelId).roomRouting.workflow.activeTurn, null);
    assert.deepEqual(runtime.calls.cancel, ['decision-session']);
    release();
  });
});

test('API continuation preserves concurrent Cat edits and publishes a stale-context result', async (t) => {
  let release;
  const runtime = client(async () => { await new Promise(resolve => { release = resolve; }); return tool(discover, {}); });
  await withApi(t, runtime, async ({ base, channelId, store }) => {
    const response = await sendOwner(base, channelId);
    assert.equal(response.status, 200, await response.clone().text());
    await waitUntil(() => Boolean(release));
    const latest = await store.read();
    latest.cats[0].name = 'Edited during discovery';
    await store.write(latest);
    release();
    await waitUntil(async () => (await store.read()).channels.find(c => c.id === channelId)
      .messages.some(message => message.metadata?.collaborationPreparation?.status === 'stopped'));
    const persisted = await store.read();
    assert.equal(persisted.cats[0].name, 'Edited during discovery');
    assert.equal(persisted.channels.find(c => c.id === channelId).messages.at(-1)
      .metadata.collaborationPreparation.reason, 'stale_context');
  });
});

test('opt-in authenticated API publishes the validated proposal through the merge writer', async (t) => {
  const runtime = client();
  await withApi(t, runtime, async ({ base, channelId, store }) => {
    assert.equal((await sendOwner(base, channelId)).status, 200);
    await waitUntil(async () => (await store.read()).channels.find(c => c.id === channelId)
      .messages.some(message => message.metadata?.collaborationPreparation));
    const channel = (await store.read()).channels.find(c => c.id === channelId);
    const report = channel.messages.at(-1).metadata.collaborationPreparation;
    assert.equal(report.status, 'prepared', JSON.stringify(report));
    assert.equal(report.feedbackDelivered, true);
    assert.equal(channel.roomRouting.workflow.activeTurn, null);
    assert.equal(channel.roomRouting.lastOutcome.status, 'completed');
    assert.equal(runtime.calls.create.length, 1);
  });
});
