import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  loadProductKnowledge, selectProductKnowledge, knowledgeDigest,
  assembleProductKnowledgeContext,
} from '../build/server/platform/knowledge/productKnowledge.js';
import { loadOrchestratorKnowledge } from '../build/server/products/chat/state/orchestratorKnowledge.js';
import { executeDispatch } from '../build/server/products/chat/state/runtime-dispatch/execution.js';
import { createChatProviderAgentDecisionRequester } from '../build/server/products/chat/state/providerAgentDecisionRequester.js';
import { createChatProviderAgentDecisionManifest, buildChatProviderAgentObservation } from '../build/server/products/chat/state/providerAgentObservation.js';
import { resolveProviderCapabilityProfile } from '../build/server/platform/supervision/providerCapabilityProfiles.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel, appendMessage, buildChannelView, setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';

const source = await readFile(resolve('config/orchestrator-knowledge.json'), 'utf8');
const now = new Date('2026-09-24T00:00:00Z');
const binding = { provider: 'claude', instance: 'coordinator-instance', model: 'coordinator-model' };
const selection = { role: 'orchestrator', surface: 'chat-decision', topics: ['collaboration'], operations: [] };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'cats-orchestrator-knowledge-'));
  t.after(async () => {
    assert.ok(root.startsWith(join(tmpdir(), 'cats-orchestrator-knowledge-')));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'config'));
  const filePath = join(root, 'config', 'orchestrator-knowledge.json');
  await writeFile(filePath, source);
  return { root, filePath };
}
const load = (filePath, extra = {}) => loadProductKnowledge({
  filePath, locale: 'en', capabilities: ['orchestrator-context-v1'], ...extra,
});

function harness({ group = false, locale = 'en', originSurface = 'chat', body = 'Ask a teammate to implement and review this change.' } = {}) {
  let state = createDefaultChatState();
  state.globalOrchestrator.executionTarget = { ...binding };
  state.globalOrchestrator.visibleParticipant.executionTarget = { ...binding };
  state = createChannel(state, {
    title: 'Knowledge fixture', topic: 'Isolated model delivery', originSurface,
    roomMode: 'chat_channel', responseLanguage: locale,
    ...(group ? { cats: [{ name: 'Reviewer', provider: 'claude', roles: ['reviewer'] }] } : {}),
  }, now);
  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(state, channelId, {
    sessionId: 'coordinator-session', laneId: 'coordinator-lane', status: 'ready',
    startedAt: now.toISOString(), lastUsedAt: now.toISOString(),
  }, now);
  const appended = appendMessage(state, channelId, { senderKind: 'user', senderName: 'Owner', body }, now);
  state = appended.state;
  const target = { participantKind: 'orchestrator', participantId: 'orchestrator',
    participantName: 'Boss Cat', laneId: 'coordinator-lane', sessionId: 'coordinator-session' };
  const request = {
    target, targets: [target], sourceMessage: appended.message, sourceParticipant: null,
    unresolved: [], mentionNames: [], trigger: 'room_default', depth: 0,
    turnId: 'turn-knowledge', dispatchId: 'dispatch-knowledge', targetStateId: 'target-knowledge',
    parentCheckpointId: null, branchStrategy: null, handoffReason: null,
  };
  return { state, channelId, request, body };
}

function decision() {
  return { contractVersion: 1, kind: 'semantic_plan', decisionId: 'decision-knowledge',
    planId: 'plan-knowledge', confidence: 'medium', rationaleSummary: 'Respond within current tools.',
    steps: [{ stepId: 'respond', summary: 'Explain supported next steps.', action: 'respond' }] };
}
function observation(channelId, availableTools = []) {
  const profile = resolveProviderCapabilityProfile(binding, { assessedAt: now.toISOString() });
  return {
    contractVersion: 1, observationId: 'observation-knowledge', runId: `chat:${channelId}`,
    goal: 'Handle the next Chat turn using bounded routing metadata.',
    task: { kind: 'chat_turn', risk: 'low' },
    actor: { actorRef: 'orchestrator', target: { kind: 'execution_target', provider: binding.provider, model: binding.model },
      capabilityProfileRef: profile.profileId, providerRef: profile.profileId },
    policy: { dials: { autonomy: 'single_step', taskGranularity: 'tiny', toolScope: 'read_only',
      scaffolding: 'few_shot', validation: 'best_effort', checkpointCadence: 'every_step',
      approvalThreshold: 'low', fallbackPolicy: 'retry' }, allowedFallbacks: ['retry'] },
    availableTools, contextRefs: [`chat-channel:${channelId}`],
    summaries: [{ key: 'routing_target_count', kind: 'count', value: 1 }],
    budget: { maxDurationMs: 30_000, hardStop: true },
    invariants: ['Chat deterministic routing stays product-owned.'],
  };
}
function runtime(response = 'A useful next step.') {
  const calls = { create: [], send: [] };
  return {
    calls,
    createSession: async (input) => {
      calls.create.push(input);
      return { id: 'decision-session', provider: input.provider, model: input.model, status: 'ready', cwd: null };
    },
    sendMessage: async (sessionId, content, input) => {
      calls.send.push({ sessionId, content, input });
      return { segments: [{ kind: 'text', text: response, toolName: null, toolId: null }],
        inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
    },
  };
}
function deliveredContext(call) {
  return JSON.parse(call.input.instructions.split('\n').at(-1));
}

test('v2 bilingual assets select by role, surface, intent and exact operation revision', async (t) => {
  const f = await fixture(t);
  const en = await load(f.filePath);
  const zh = await load(f.filePath, { locale: 'zh-TW' });
  assert.equal(en.status, 'ready');
  assert.equal(zh.status, 'ready');
  assert.equal(en.bundle.digest, zh.bundle.digest);
  assert.notEqual(en.bundle.entries[0].digest, zh.bundle.entries[0].digest);
  assert.deepEqual(selectProductKnowledge(en.bundle, { ...selection, topics: [] }).map(e => e.id),
    ['orchestrator.role', 'orchestrator.results']);
  assert.equal(selectProductKnowledge(en.bundle, { ...selection, role: 'catlas' }).length, 0);
  assert.equal(selectProductKnowledge(en.bundle, { ...selection, surface: 'code-help' }).length, 0);
  const handoff = { ...selection, surface: 'chat-visible', topics: ['handoff'] };
  assert.equal(selectProductKnowledge(en.bundle, handoff).some(e => e.id === 'orchestrator.handoff'), false);
  assert.equal(selectProductKnowledge(en.bundle, { ...handoff,
    operations: [{ id: 'chat.current-room.handoff', version: '2.0' }] }).some(e => e.id === 'orchestrator.handoff'), false);
  assert.equal(selectProductKnowledge(en.bundle, { ...handoff,
    operations: [{ id: 'chat.current-room.handoff', version: '1.0' }] }).some(e => e.id === 'orchestrator.handoff'), true);
});

test('invalid v2 metadata and incompatible assets cannot become executable procedures', async (t) => {
  const f = await fixture(t);
  assert.equal((await load(join(f.root, 'missing.json'))).status, 'missing');
  assert.equal((await load(f.filePath, { capabilities: [] })).status, 'incompatible');
  assert.equal((await load(f.filePath, { platformVersion: '0.3.9' })).status, 'incompatible');
  for (const mutate of [
    raw => { raw.schemaVersion = 3; },
    raw => { raw.entries[0].roles = ['developer']; },
    raw => { raw.entries[0].surfaces = ['all']; },
    raw => { raw.entries[0].kind = 'executable'; },
    raw => { raw.entries[0].requiredOperations = [{ id: 'chat.create', version: '*' }]; },
    raw => { delete raw.entries[0].content['zh-TW']; },
    raw => { raw.entries.push(raw.entries[0]); },
  ]) {
    const raw = JSON.parse(source); mutate(raw);
    await writeFile(f.filePath, JSON.stringify(raw));
    assert.equal((await load(f.filePath)).status, 'invalid');
  }
  await writeFile(f.filePath, Buffer.from([0xff]));
  assert.equal((await load(f.filePath)).status, 'invalid');
  await writeFile(f.filePath, 'x'.repeat(128 * 1024 + 1));
  assert.equal((await load(f.filePath)).status, 'invalid');
});

test('serialized knowledge is bounded, and changes to scope or content invalidate provenance', async (t) => {
  const f = await fixture(t);
  const h = harness({ group: true });
  const options = { channel: buildChannelView(h.state, h.channelId), body: h.body,
    surface: 'chat-visible', target: binding, filePath: f.filePath };
  const first = await loadOrchestratorKnowledge(options);
  assert.ok(first.entries.some(e => e.id === 'orchestrator.handoff'));
  for (const update of [
    { body: 'A different goal' }, { target: { ...binding, model: 'different' } },
    { channel: { ...options.channel, responseLanguage: 'zh-TW' } },
    { channel: { ...options.channel, assignedParticipants: [], assignedCats: [] } },
    { policyDigest: 'changed' }, { operations: [{ id: 'chat.inspect', version: '1.0' }] },
  ]) assert.notEqual((await loadOrchestratorKnowledge({ ...options, ...update })).contextDigest, first.contextDigest);
  const raw = JSON.parse(source);
  raw.entries[0].content.en += ' New evidence.';
  await writeFile(f.filePath, JSON.stringify(raw));
  const revised = await loadOrchestratorKnowledge(options);
  assert.notEqual(revised.bundle.digest, first.bundle.digest);
  assert.notEqual(revised.contextDigest, first.contextDigest);
  raw.entries = Array.from({ length: 32 }, (_, i) => ({ ...raw.entries[0], id: `bounded.entry-${i}`,
    content: { en: '\\'.repeat(4_000), 'zh-TW': '知識' } }));
  // Bypass the file limit here to exercise selection's independent escaped-JSON budget.
  const bundle = { ...first.bundle, locale: 'en', entries: raw.entries.map(e => ({ ...e, content: e.content.en })) };
  assert.ok(JSON.stringify(selectProductKnowledge(bundle, selection)).length <= 16_002);
  const bounded = await loadOrchestratorKnowledge({ ...options, body: 'x'.repeat(10_000) });
  assert.equal(bounded.goal.length, 4_000);
  assert.equal(bounded.goalTruncated, true);
  const manyOperations = await loadOrchestratorKnowledge({ ...options,
    operations: Array.from({ length: 65 }, (_, i) => ({ id: `chat.test-${i}`, version: '1.0' })),
  });
  assert.equal(manyOperations.operationsTruncated, true);
  const oversizedScope = await loadOrchestratorKnowledge({ ...options,
    body: '\u0000'.repeat(4_000),
    channel: { ...options.channel, assignedCats: [], assignedParticipants: Array.from({ length: 32 }, (_, i) => ({
      participantId: `participant-${i}`, name: 'x'.repeat(128), status: 'active', roles: ['x'.repeat(200)],
    })) },
  });
  assert.ok(JSON.stringify(oversizedScope).length <= 16_000);
  assert.equal(oversizedScope.goalTruncated, true);
  assert.equal(oversizedScope.scope.summaryOmitted, true);
  const largeEnvelope = assembleProductKnowledgeContext({ status: 'ready', bundle }, {
    ...selection, locale: 'en', goal: 'Long procedures', scope: {},
  });
  assert.ok(JSON.stringify(largeEnvelope).length <= 16_000);
});

for (const group of [false, true]) {
  test(`actual ${group ? 'group coordinator' : 'default Chat'} dispatch receives bilingual content and request receipts`, async () => {
    const h = harness({ group, locale: 'zh-TW', body: '請同伴實作並由另一位審查。' });
    const client = runtime();
    const result = await executeDispatch(h.state, h.channelId, h.request, client, now);
    assert.equal(result.error, null);
    const call = client.calls.send[0];
    assert.equal(call.sessionId, 'coordinator-session');
    const knowledge = deliveredContext(call);
    assert.equal(knowledge.status, 'ready');
    assert.equal(knowledge.locale, 'zh-TW');
    assert.equal(knowledge.goal, h.body);
    assert.match(knowledge.entries[0].content, /協調目前已授權的目標/u);
    assert.equal(knowledge.entries.some(e => e.id === 'orchestrator.handoff'), group);
    assert.equal(knowledge.scope.target.instance, binding.instance);
    assert.equal(knowledge.scope.target.sessionId, 'coordinator-session');
    const receipt = call.input.context.metadata.productKnowledge;
    assert.equal(receipt.delivery, 'inline');
    assert.equal(receipt.contextDigest, knowledge.contextDigest);
    assert.equal(receipt.entries[0].digest, knowledgeDigest(knowledge.entries[0].content));
    assert.deepEqual(result.runtimeAssistantMetadata.productKnowledge, receipt);
    if (!group) assert.equal(call.content, h.body);
  });
}

test('missing packaged knowledge preserves visible dispatch with an honest unavailable receipt', async (t) => {
  const f = await fixture(t);
  const previousRoot = process.env.CATS_PLATFORM_PACKAGE_ROOT;
  process.env.CATS_PLATFORM_PACKAGE_ROOT = join(f.root, 'absent-package');
  try {
    const h = harness();
    const client = runtime();
    const result = await executeDispatch(h.state, h.channelId, h.request, client, now);
    assert.equal(result.error, null);
    assert.equal(deliveredContext(client.calls.send[0]).status, 'missing');
    assert.deepEqual(deliveredContext(client.calls.send[0]).entries, []);
    assert.equal(result.runtimeAssistantMetadata.productKnowledge.delivery, 'none');
  } finally {
    if (previousRoot === undefined) delete process.env.CATS_PLATFORM_PACKAGE_ROOT;
    else process.env.CATS_PLATFORM_PACKAGE_ROOT = previousRoot;
  }
});

test('provider-default Chat keeps its selected assistant identity in visible and decision paths', async () => {
  const h = harness({ body: 'Review this idea.' });
  const channel = h.state.channels.find(c => c.id === h.channelId);
  channel.pendingProvider = 'claude';
  channel.pendingModel = binding.model;
  const client = runtime();
  assert.equal((await executeDispatch(h.state, h.channelId, h.request, client, now)).error, null);
  assert.equal(client.calls.send[0].content, h.body);
  assert.equal(client.calls.send[0].input.context.metadata.productKnowledge, undefined);
  assert.doesNotMatch(client.calls.send[0].input.instructions ?? '', /Cats Orchestrator|visible Boss Cat/u);
  const decisionClient = runtime(JSON.stringify(decision()));
  await createChatProviderAgentDecisionRequester()({ state: h.state, channelId: h.channelId,
    payload: { body: h.body }, observation: observation(h.channelId), runtimeClient: decisionClient, now });
  assert.equal(JSON.parse(decisionClient.calls.send[0].content).productKnowledge, undefined);
});

test('decision session receives actual goal and procedures using its own binding, with exact tool dependencies', async (t) => {
  const f = await fixture(t);
  const h = harness({ group: true });
  const manifest = createChatProviderAgentDecisionManifest();
  const raw = JSON.parse(source);
  raw.entries.push({ ...raw.entries[0], id: 'fixture.requires-tool',
    requiredOperations: [{ id: manifest.name, version: manifest.manifestVersion }],
    content: { en: 'Only available with the verified test descriptor.', 'zh-TW': '只供已驗證工具使用。' } });
  await writeFile(f.filePath, JSON.stringify(raw));
  const requester = createChatProviderAgentDecisionRequester({ knowledgeFilePath: f.filePath });
  for (const tools of [[], [{ manifest, reason: 'Test verified descriptor.' }]]) {
    const client = runtime(JSON.stringify(decision()));
    const result = await requester({ state: h.state, channelId: h.channelId, payload: { body: h.body },
      observation: observation(h.channelId, tools), runtimeClient: client, now });
    assert.equal(result.kind, 'semantic_plan');
    assert.equal(client.calls.create[0].instance, binding.instance);
    assert.equal(client.calls.create[0].model, binding.model);
    assert.equal(client.calls.create[0].skills, undefined);
    const call = client.calls.send[0];
    const prompt = JSON.parse(call.content);
    assert.equal(call.sessionId, 'decision-session');
    assert.equal(prompt.productKnowledge.goal, h.body);
    assert.match(prompt.productKnowledge.entries[0].content, /Cats Orchestrator/u);
    assert.equal(prompt.productKnowledge.entries.some(e => e.id === 'orchestrator.handoff'), false);
    assert.equal(prompt.productKnowledge.entries.some(e => e.id === 'fixture.requires-tool'), tools.length > 0);
    assert.deepEqual(prompt.observation.availableTools, tools);
    assert.equal(call.input.context.metadata.productKnowledge.delivery, 'inline');
    assert.match(call.input.instructions, /exactly one JSON object/u);
    assert.equal(prompt.productKnowledge.scope.participants.length, 1);
  }
});

test('Code and Work retain product-owned instructions in the shared internal actor slot', async () => {
  for (const originSurface of ['code', 'work']) {
    const h = harness({ group: true, originSurface });
    const client = runtime();
    assert.equal((await executeDispatch(h.state, h.channelId, h.request, client, now)).error, null);
    assert.equal(client.calls.send[0].input.context.metadata.productKnowledge, undefined);
    assert.doesNotMatch(client.calls.send[0].input.instructions ?? '', /Cats Orchestrator|visible Boss Cat/u);
    const decisionClient = runtime(JSON.stringify(decision()));
    await createChatProviderAgentDecisionRequester()({ state: h.state, channelId: h.channelId,
      payload: { body: h.body }, observation: observation(h.channelId), runtimeClient: decisionClient, now });
    assert.equal(JSON.parse(decisionClient.calls.send[0].content).productKnowledge, undefined);
  }
});

test('decision fallback preserves decisions and rejects invented tools or a stale coordinator binding', async (t) => {
  const f = await fixture(t);
  const h = harness();
  const input = { state: h.state, channelId: h.channelId, payload: { body: h.body },
    observation: observation(h.channelId), now };
  for (const contents of [null, '{invalid', JSON.stringify({ ...JSON.parse(source), platformRange: '0.3.x' })]) {
    const filePath = contents === null ? join(f.root, 'absent.json') : f.filePath;
    if (contents !== null) await writeFile(filePath, contents);
    const client = runtime(JSON.stringify(decision()));
    const requester = createChatProviderAgentDecisionRequester({ knowledgeFilePath: filePath });
    assert.equal((await requester({ ...input, runtimeClient: client })).kind, 'semantic_plan');
    assert.deepEqual(JSON.parse(client.calls.send[0].content).productKnowledge.entries, []);
    assert.equal(client.calls.send[0].input.context.metadata.productKnowledge.delivery, 'none');
  }
  await writeFile(f.filePath, source);
  const invented = decision();
  invented.steps[0].action = 'call_tool';
  invented.steps[0].toolName = 'cats.conversation.create';
  const client = runtime(JSON.stringify(invented));
  const requester = createChatProviderAgentDecisionRequester({ knowledgeFilePath: f.filePath });
  await assert.rejects(requester({ ...input, runtimeClient: client }), /outside the bounded tool surface/iu);
  const stale = structuredClone(input.observation);
  stale.actor.target.model = 'stale-model';
  const staleClient = runtime(JSON.stringify(decision()));
  assert.equal(await requester({ ...input, observation: stale, runtimeClient: staleClient }), null);
  assert.equal(staleClient.calls.create.length, 0);
});

test('default-model observations retain actual model controls and invalidate changed instance/control bindings', async () => {
  const h = harness();
  const target = { ...binding, model: null, modelSelection: { entryMode: 'auto', controls: { reasoning: 'high' } } };
  h.state.globalOrchestrator.visibleParticipant.executionTarget = { ...target };
  h.state.globalOrchestrator.visibleParticipant.executionModelSelection = target.modelSelection;
  const profile = resolveProviderCapabilityProfile(target, { assessedAt: now.toISOString() });
  const observed = buildChatProviderAgentObservation({
    state: h.state, channelId: h.channelId, actorRef: 'orchestrator', capabilityProfile: profile,
    policy: observation(h.channelId).policy.dials, messageCharacterCount: h.body.length,
    routing: { trigger: 'room_default', resolution: { selectionKind: 'default' },
      targetCount: 1, unresolvedCount: 0, mentionCount: 0 },
    now,
  });
  const requester = createChatProviderAgentDecisionRequester();
  const input = { state: h.state, channelId: h.channelId, payload: { body: h.body }, observation: observed, now };
  const client = runtime(JSON.stringify(decision()));
  assert.equal((await requester({ ...input, runtimeClient: client })).kind, 'semantic_plan');
  assert.equal(client.calls.create[0].model, undefined);
  assert.deepEqual(client.calls.create[0].modelSelection, target.modelSelection);
  assert.equal(JSON.parse(client.calls.send[0].content).productKnowledge.scope.target.model, null);
  for (const change of [
    state => { state.globalOrchestrator.visibleParticipant.executionTarget.instance = 'other-instance'; },
    state => { state.globalOrchestrator.visibleParticipant.executionModelSelection.controls.reasoning = 'low'; },
  ]) {
    const changed = structuredClone(h.state); change(changed);
    const staleClient = runtime(JSON.stringify(decision()));
    assert.equal(await requester({ ...input, state: changed, runtimeClient: staleClient }), null);
    assert.equal(staleClient.calls.create.length, 0);
  }
});
