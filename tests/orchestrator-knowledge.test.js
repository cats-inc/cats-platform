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
import { registerCodeAgentToolsInvocationEnricher } from '../build/server/products/code/agentTools/enricher.js';
import { executeDispatch } from '../build/server/products/chat/state/runtime-dispatch/execution.js';
import { inspectLocalKnowledge, mutateLocalKnowledge } from '../build/server/platform/knowledge/localKnowledge.js';
import { createChatProviderAgentDecisionRequester } from '../build/server/products/chat/state/providerAgentDecisionRequester.js';
import { createChatProviderAgentDecisionManifest, buildChatProviderAgentObservation } from '../build/server/products/chat/state/providerAgentObservation.js';
import { resolveProviderCapabilityProfile } from '../build/server/platform/supervision/providerCapabilityProfiles.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel, appendMessage, buildChannelView,
} from '../build/server/products/chat/state/model/index.js';
import { collaborationToolDescriptors } from '../build/server/products/chat/state/orchestratorCollaboration.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createConversationSessionDelegate } from '../build/server/products/chat/state/conversationSessionDelegate.js';

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

// The room's first participant coordinates it, so it answers with product knowledge.
const COORDINATOR_ID = 'participant-coordinator';

function coordinatorAssignment(state, channelId) {
  return state.channels.find((channel) => channel.id === channelId).participantAssignments
    .find((assignment) => assignment.participantId === COORDINATOR_ID);
}

function harness({ group = false, locale = 'en', originSurface = 'chat', body = 'Ask a teammate to implement and review this change.' } = {}) {
  let state = createDefaultChatState();
  state = createChannel(state, {
    title: 'Knowledge fixture', topic: 'Isolated model delivery', originSurface,
    roomMode: 'chat_channel', responseLanguage: locale,
    temporaryParticipants: [{ participantId: COORDINATOR_ID, name: 'Coordinator', provider: binding.provider,
      instance: binding.instance, model: binding.model }],
    participantOrder: [`temp:${COORDINATOR_ID}`],
    ...(group ? { cats: [{ name: 'Reviewer', provider: 'claude', roles: ['reviewer'] }] } : {}),
  }, now);
  const channelId = state.selectedChannelId;
  coordinatorAssignment(state, channelId).execution.lease = {
    ...coordinatorAssignment(state, channelId).execution.lease,
    sessionId: 'coordinator-session', laneId: 'coordinator-lane', status: 'ready',
    startedAt: now.toISOString(), lastUsedAt: now.toISOString(),
  };
  const appended = appendMessage(state, channelId, { senderKind: 'user', senderName: 'Owner', body }, now);
  state = appended.state;
  const target = { participantKind: 'cat', participantId: COORDINATOR_ID,
    participantName: 'Coordinator', laneId: 'coordinator-lane', sessionId: 'coordinator-session' };
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
    actor: { actorRef: `cat:${COORDINATOR_ID}`, target: { kind: 'execution_target', provider: binding.provider, model: binding.model },
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

test('visible dispatch and decision requester both read the explicit owning profile', async (t) => {
  const f = await fixture(t), options = { platformDir: join(f.root, 'private-profile') };
  const initial = await inspectLocalKnowledge(options);
  const entry = initial.targets.find(row => row.target === 'orchestrator').entries[0];
  const draft = await mutateLocalKnowledge({ action: 'submit', revision: initial.revision, target: 'orchestrator',
    entryId: entry.id, content: { en: entry.content.en + ' Explicit profile lesson.', 'zh-TW': entry.content['zh-TW'] + ' 指定資料區知識。' } }, options);
  await mutateLocalKnowledge({ action: 'adopt', revision: draft.revision, id: draft.drafts[0].id,
    confirm: 'manual-local-unverified' }, options);
  const h = harness(), client = runtime();
  const result = await executeDispatch(h.state, h.channelId, h.request, client, now,
    undefined, undefined, undefined, undefined, undefined, options.platformDir);
  assert.equal(result.error, null);
  assert.ok(deliveredContext(client.calls.send[0]).entries.some(row => row.content.includes('Explicit profile lesson.')));
  const requester = createChatProviderAgentDecisionRequester(options), decisionClient = runtime(JSON.stringify(decision()));
  assert.equal((await requester({ state: h.state, channelId: h.channelId, payload: { body: h.body },
    observation: observation(h.channelId), runtimeClient: decisionClient, now })).kind, 'semantic_plan');
  assert.ok(JSON.parse(decisionClient.calls.send[0].content).productKnowledge.entries.some(row =>
    row.content.includes('Explicit profile lesson.') && row.adoption?.kind === 'manual-local-unverified'));
});

for (const group of [false, true]) {
  test(`actual ${group ? 'group' : 'single-participant'} coordinator dispatch receives bilingual content and request receipts`, async () => {
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

// Local knowledge is read from an empty profile of the test's own, never from the owner's.
async function emptyProfile(t) {
  return join((await fixture(t)).root, 'empty-profile');
}
function dispatch(h, client, platformDir) {
  return executeDispatch(h.state, h.channelId, h.request, client, now,
    undefined, undefined, undefined, undefined, undefined, platformDir);
}
// A conversation stored with no origin (SPEC-141 S4), as the loader leaves it. No current
// client writes one.
function withoutOrigin(h) {
  h.state.channels.find((channel) => channel.id === h.channelId).originSurface = null;
  return h;
}
const ORIGINS = ['chat', 'code', 'work', null];
const label = (originSurface) => originSurface ?? 'no origin';
const harnessOn = (originSurface, options = {}) => originSurface === null
  ? withoutOrigin(harness(options)) : harness({ ...options, originSurface });

test('a coordinator answers with orchestrator knowledge wherever the conversation was created', async (t) => {
  // SPEC-141 FR-19 (ADR-149 D8). Until then the knowledge went only to a conversation created
  // on Chat, and this test asserted that Code and Work received none. A conversation with no
  // recorded origin received none either; it is Chat's everywhere else, and now here.
  // The server registers Code's enricher at startup; a Code conversation keeps what it adds.
  registerCodeAgentToolsInvocationEnricher();
  const platformDir = await emptyProfile(t);
  const requester = createChatProviderAgentDecisionRequester({ platformDir });
  for (const originSurface of ORIGINS) {
    const h = harnessOn(originSurface, { group: true });
    const client = runtime();
    assert.equal((await dispatch(h, client, platformDir)).error, null);
    const call = client.calls.send[0];
    assert.equal(call.input.context.metadata.productKnowledge.delivery, 'inline', label(originSurface));
    const knowledge = deliveredContext(call);
    assert.match(knowledge.entries[0].content, /Cats Orchestrator/u, label(originSurface));
    assert.equal(knowledge.scope.originSurface, originSurface, 'the scope copy keeps the real origin');
    // Code's own delivery is untouched: its label and marker go to a Code conversation only.
    assert.equal(call.input.context.labels?.includes('product:code') ?? false, originSurface === 'code');
    assert.equal(call.input.context.metadata.codeAgentTools !== undefined, originSurface === 'code');

    const decisionClient = runtime(JSON.stringify(decision()));
    await requester({ state: h.state, channelId: h.channelId,
      payload: { body: h.body }, observation: observation(h.channelId), runtimeClient: decisionClient, now });
    const prompt = JSON.parse(decisionClient.calls.send[0].content);
    assert.match(prompt.productKnowledge.entries[0].content, /Cats Orchestrator/u, label(originSurface));
    assert.equal(decisionClient.calls.send[0].input.context.metadata.productKnowledge.delivery, 'inline');
  }
});

test('a decision request that carries a tool is the same on Code and Work as on Chat', async (t) => {
  // Until SPEC-141 FR-19 the request left this branch outside Chat: it was not bound to the
  // coordinator's own instance and model, and no procedure was selected for the offered tool.
  const platformDir = await emptyProfile(t);
  const requester = createChatProviderAgentDecisionRequester({ platformDir });
  const tools = collaborationToolDescriptors(observation('unused').policy);
  const seen = new Map();
  for (const originSurface of ORIGINS) {
    const h = harnessOn(originSurface, { group: true });
    const client = runtime(JSON.stringify(decision()));
    const result = await requester({ state: h.state, channelId: h.channelId, payload: { body: h.body },
      observation: observation(h.channelId, tools), runtimeClient: client, now });
    assert.equal(result?.kind, 'semantic_plan', `${label(originSurface)}: the coordinator's binding is current`);
    assert.equal(client.calls.create[0].instance, binding.instance, label(originSurface));
    assert.equal(client.calls.create[0].model, binding.model, label(originSurface));
    const prompt = JSON.parse(client.calls.send[0].content);
    assert.deepEqual(prompt.observation.availableTools, tools);
    assert.ok(prompt.productKnowledge.entries.some((entry) => entry.id === 'orchestrator.discovery'),
      `${label(originSurface)}: the offered tools select their procedure`);
    assert.equal(prompt.productKnowledge.scope.target.instance, binding.instance);
    seen.set(originSurface, { entries: prompt.productKnowledge.entries,
      operations: prompt.productKnowledge.operations, create: { ...client.calls.create[0], context: undefined } });

    // A binding that changed since the observation still stops the request, as on Chat.
    const stale = structuredClone(observation(h.channelId, tools));
    stale.actor.target.model = 'stale-model';
    const staleClient = runtime(JSON.stringify(decision()));
    assert.equal(await requester({ state: h.state, channelId: h.channelId, payload: { body: h.body },
      observation: stale, runtimeClient: staleClient, now }), null, label(originSurface));
    assert.equal(staleClient.calls.create.length, 0);
  }
  for (const originSurface of ORIGINS.slice(1)) {
    assert.deepEqual(seen.get(originSurface), seen.get('chat'), label(originSurface));
  }
});

test('only the coordinator receives the knowledge, in a direct lane too', async (t) => {
  // The origin was never the only condition: another participant gets none, and a lane's Cat,
  // which coordinates its lane, gets it as before.
  const platformDir = await emptyProfile(t);
  const requester = createChatProviderAgentDecisionRequester({ platformDir });
  for (const originSurface of ORIGINS) {
    const lane = harnessOn(originSurface);
    const laneChannel = lane.state.channels.find((channel) => channel.id === lane.channelId);
    laneChannel.channelKind = 'direct_message';
    laneChannel.roomRouting.mode = 'direct_message';
    const laneClient = runtime();
    assert.equal((await dispatch(lane, laneClient, platformDir)).error, null);
    assert.equal(laneClient.calls.send[0].input.context.metadata.productKnowledge.delivery, 'inline', label(originSurface));
    // A lane's decision request too. No current client creates a lane outside Chat (SPEC-141
    // S6), and with the provider-agent flag off only a companion lane reaches the requester.
    const laneDecision = runtime(JSON.stringify(decision()));
    assert.equal((await requester({ state: lane.state, channelId: lane.channelId, payload: { body: lane.body },
      observation: observation(lane.channelId), runtimeClient: laneDecision, now })).kind, 'semantic_plan');
    assert.match(JSON.parse(laneDecision.calls.send[0].content).productKnowledge.entries[0].content,
      /Cats Orchestrator/u, label(originSurface));

    const other = harnessOn(originSurface, { group: true });
    const otherChannel = other.state.channels.find((channel) => channel.id === other.channelId);
    otherChannel.coordinatorParticipantId = otherChannel.participantAssignments
      .find((assignment) => assignment.participantId !== COORDINATOR_ID).participantId;
    const otherClient = runtime();
    assert.equal((await dispatch(other, otherClient, platformDir)).error, null);
    assert.equal(otherClient.calls.send[0].input.context.metadata.productKnowledge, undefined, label(originSurface));
    assert.doesNotMatch(otherClient.calls.send[0].input.instructions ?? '', /Cats Orchestrator|visible Boss Cat/u);
    // Its decision request carries none either, and is not bound to the coordinator's model.
    const otherDecision = runtime(JSON.stringify(decision()));
    assert.equal((await requester({ state: other.state, channelId: other.channelId, payload: { body: other.body },
      observation: observation(other.channelId), runtimeClient: otherDecision, now })).kind, 'semantic_plan');
    assert.equal(JSON.parse(otherDecision.calls.send[0].content).productKnowledge, undefined, label(originSurface));
    assert.equal(otherDecision.calls.create[0].instance, undefined, label(originSurface));
  }
});

// The first participant's turn in a conversation the product created, as `harness` builds one
// for its fixture.
function firstParticipantTurn(state, channelId, body) {
  const channel = state.channels.find((entry) => entry.id === channelId);
  const first = channel.participantAssignments[0];
  first.execution.lease = { ...first.execution.lease, sessionId: 'first-session', laneId: 'first-lane',
    status: 'ready', startedAt: now.toISOString(), lastUsedAt: now.toISOString() };
  const appended = appendMessage(state, channelId, { senderKind: 'user', senderName: 'Owner', body }, now);
  const target = { participantKind: 'cat', participantId: first.participantId, participantName: first.name,
    laneId: 'first-lane', sessionId: 'first-session' };
  const request = { target, targets: [target], sourceMessage: appended.message, sourceParticipant: null,
    unresolved: [], mentionNames: [], trigger: 'room_default', depth: 0, turnId: 'turn-first',
    dispatchId: 'dispatch-first', targetStateId: 'target-first', parentCheckpointId: null,
    branchStrategy: null, handoffReason: null };
  return { state: appended.state, channelId, request, body, first, channel };
}
const PLAIN_MESSAGE = 'What does this function return?';
const CODING_MESSAGE = 'Implement the login retry fix in src/auth.ts and add a test for the error path.';

test('the one agent of a conversation started without naming anyone coordinates it and receives the role', async (t) => {
  // What the product creates when the owner just starts typing: the remembered provider and
  // model as the conversation's one participant, which coordinates it. On Chat it received the
  // Orchestrator role already. Since SPEC-141 FR-19 it does on Code and Work too, where this
  // agent is the one doing the coding task, and the role comes with every turn.
  registerCodeAgentToolsInvocationEnricher();
  const platformDir = await emptyProfile(t);
  for (const originSurface of ['chat', 'code', 'work']) {
    for (const [body, expected] of [
      [PLAIN_MESSAGE, ['orchestrator.role', 'orchestrator.results']],
      // Words such as implement, review, fail and error select two more procedures.
      [CODING_MESSAGE, ['orchestrator.role', 'orchestrator.results', 'orchestrator.collaboration', 'orchestrator.recovery']],
    ]) {
      const created = createChannel(createDefaultChatState(),
        { title: 'New conversation', titleSource: 'draft', topic: '', originSurface }, now);
      const h = firstParticipantTurn(created, created.selectedChannelId, body);
      assert.equal(h.channel.participantAssignments.length, 1);
      assert.notEqual(h.first.sourceKind, 'cat', 'the remembered model, not a Cat');
      assert.equal(h.channel.coordinatorParticipantId, h.first.participantId);
      const client = runtime();
      assert.equal((await dispatch(h, client, platformDir)).error, null);
      const knowledge = deliveredContext(client.calls.send[0]);
      assert.deepEqual(knowledge.entries.map((entry) => entry.id), expected, `${originSurface}: ${body}`);
      assert.match(knowledge.entries[0].content, /You are the Cats Orchestrator \(visible Boss Cat\)/u);
      // Code's own instructions and marker still go with it; the knowledge is added to them.
      assert.equal(client.calls.send[0].input.context.metadata.codeAgentTools !== undefined, originSurface === 'code');
    }
  }
});

test("the agent of a session opened by Code's own operation receives the role too", async (t) => {
  const platformDir = await emptyProfile(t);
  const store = new MemoryChatStore();
  await createConversationSessionDelegate(store).admit({ cwd: join(tmpdir(), 'cats-knowledge-code-session'),
    target: { provider: 'codex', instance: 'cli/local', model: 'model' },
    policy: { workspaceKind: 'source', workspaceAccess: 'read_only', permissionMode: 'default' } },
  () => false, (core) => core);
  const opened = await store.read();
  const channel = opened.channels.find((entry) => entry.id === opened.selectedChannelId);
  assert.equal(channel.originSurface, 'code');
  for (const [body, expected] of [
    [PLAIN_MESSAGE, ['orchestrator.role', 'orchestrator.results']],
    [CODING_MESSAGE, ['orchestrator.role', 'orchestrator.results', 'orchestrator.collaboration', 'orchestrator.recovery']],
  ]) {
    const h = firstParticipantTurn(structuredClone(opened), channel.id, body);
    assert.equal(h.channel.coordinatorParticipantId, h.first.participantId);
    const client = runtime();
    assert.equal((await dispatch(h, client, platformDir)).error, null);
    assert.deepEqual(deliveredContext(client.calls.send[0]).entries.map((entry) => entry.id), expected, body);
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
  const coordinator = coordinatorAssignment(h.state, h.channelId);
  coordinator.execution.target = { provider: target.provider, instance: target.instance, model: null };
  coordinator.execution.modelSelection = target.modelSelection;
  const profile = resolveProviderCapabilityProfile(target, { assessedAt: now.toISOString() });
  const observed = buildChatProviderAgentObservation({
    state: h.state, channelId: h.channelId, actorRef: `cat:${COORDINATOR_ID}`, capabilityProfile: profile,
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
    state => { coordinatorAssignment(state, h.channelId).execution.target.instance = 'other-instance'; },
    state => { coordinatorAssignment(state, h.channelId).execution.modelSelection.controls.reasoning = 'low'; },
  ]) {
    const changed = structuredClone(h.state); change(changed);
    const staleClient = runtime(JSON.stringify(decision()));
    assert.equal(await requester({ ...input, state: changed, runtimeClient: staleClient }), null);
    assert.equal(staleClient.calls.create.length, 0);
  }
});
