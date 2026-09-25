/** Private HTTP acceptance seam, shared by the native harness and fake-Runtime tests. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runPreparationAcceptance({ load, root, workspace, target, coordinatorTarget,
  runtime, runtimeBaseUrl, runtimeApiKey, budget, readinessOnly = false, isCancelled = () => false, report }) {
  const { loadConfig } = await load('config.js');
  const { createServer } = await load('app/server/index.js');
  const { createDefaultChatState } = await load('products/chat/state/defaults.js');
  const { createChannel, createCat } = await load('products/chat/state/model/index.js');
  const { FileChatStore } = await load('products/chat/state/store.js');
  const auth = await load('platform/auth/index.js');
  const operations = await load('products/chat/state/orchestratorCollaboration.js');
  const allowedTools = [operations.DISCOVER_COLLABORATION_CATS, operations.INSPECT_COLLABORATION_CONTEXT,
    operations.PREPARE_COLLABORATION];
  const origin = 'http://127.0.0.1:8181';
  const config = loadConfig({ HOME: path.join(root, 'home'), CATS_PLATFORM_DIR: path.join(root, 'platform'),
    CATS_RUNTIME_DIR: path.join(root, 'runtime'), CATS_DESKTOP_DIR: path.join(root, 'desktop'),
    CATS_RUNTIME_BASE_URL: runtimeBaseUrl, CATS_RUNTIME_API_KEY: runtimeApiKey,
    CATS_AUTH_ENABLED: 'true', CATS_AUTH_SESSION_SECRET: randomBytes(32).toString('hex'),
    CATS_AUTH_ALLOWED_BROWSER_ORIGINS: origin, CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED: 'true',
    CATS_CHAT_COLLABORATION_PREPARATION_MAX_DURATION_MS: String(budget.maxDurationMs),
    CATS_CHAT_COLLABORATION_PREPARATION_MAX_TOKENS: String(budget.maxTokens) });
  assert.deepEqual(config.chatCollaborationPreparationBudget, budget);
  const now = new Date();
  const goal = 'Prepare a collaboration proposal to fix calc.mjs so add(a,b) returns a+b, changing only calc.mjs. '
    + 'Find an implementer and a distinct reviewer, inspect the current conversation, and propose a new bug-fix conversation. '
    + 'The fixture tests assert add(2,3)=5 and add(-2,3)=1. Review must follow a verified implementation revision. '
    + 'Do not execute the proposal, create a conversation, start workers, edit files or run tests yet.';
  let state = createChannel(createDefaultChatState(), { title: 'K2 preparation fixture', topic: goal,
    originSurface: 'chat', repoPath: workspace, roomMode: 'chat_channel', responseLanguage: 'en',
    cats: [{ name: 'Implementer', provider: target.provider, roles: ['implementation'] }] }, now);
  const channelId = state.selectedChannelId;
  state = createCat(state, { name: 'Reviewer', provider: target.provider, roles: ['review'] }, now);
  state.globalOrchestrator.visibleParticipant.executionTarget = coordinatorTarget;
  for (const cat of state.cats) cat.defaultExecutionTarget = target;
  for (const channel of state.channels) for (const assignment of channel.catAssignments) assignment.execution.target = target;
  const store = new FileChatStore(config.chatStatePath);
  await store.write(state);
  const created = await auth.createFirstAdminLocalAuthState({ state: auth.createEmptyPlatformAuthState(now),
    displayName: 'Fixture owner', identifier: 'owner@example.invalid', password: randomBytes(32).toString('hex'),
    sessionSecret: config.auth.sessionSecret, sessionTtlMs: config.auth.sessionTtlMs, now });
  const headers = { origin, cookie: `${auth.AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(created.session.token)}`,
    'x-cats-csrf-token': created.session.csrfToken, 'content-type': 'application/json' };
  let createAttempts = 0;
  const messages = [];
  const closed = new Set();
  // A valid ordinary decision may use the product fallback. This fixture must
  // refuse that additional inference instead of silently spending outside K2.
  const guardedRuntime = new Proxy(runtime, { get(client, property) {
    if (property === 'createSession') return async input => {
      assert.equal(readinessOnly, false, 'Readiness cannot create model sessions');
      assert.equal(isCancelled(), false, 'Preparation acceptance was interrupted');
      assert.equal(++createAttempts, 1, 'K2 acceptance permits only one decision session');
      assert.equal(input.context?.reason, 'chat-provider-agent-decision-session');
      assert.equal(input.provider, coordinatorTarget.provider);
      assert.equal(input.instance, coordinatorTarget.instance);
      assert.equal(input.model, coordinatorTarget.model);
      assert.equal(input.workspaceKind, 'sandbox');
      assert.equal(input.workspaceAccess, 'read_only');
      assert.equal(input.permissionMode, 'default');
      assert.equal(input.sharingMode, 'isolated');
      assert.deepEqual(input.skills, { requestedSkills: [], strict: true });
      const session = await client.createSession(input);
      report.coordinatorSessionId = session.id;
      return session;
    };
    if (property === 'sendMessage') return async (id, content, input) => {
      assert.equal(isCancelled(), false, 'Preparation acceptance was interrupted');
      assert.equal(id, report.coordinatorSessionId);
      assert.equal(input.context?.reason, 'chat-provider-agent-decision');
      assert.ok(messages.length < 5, 'K2 permits at most five decision requests');
      const envelope = JSON.parse(content);
      assert.ok(envelope.observation.availableTools.every(tool => allowedTools.includes(tool.manifest?.name ?? tool.name)));
      assert.ok(envelope.observation.budget.maxTokens > 0 && envelope.observation.budget.maxTokens <= budget.maxTokens);
      assert.ok(envelope.observation.budget.maxDurationMs > 0
        && envelope.observation.budget.maxDurationMs <= budget.maxDurationMs);
      const call = { envelope };
      messages.push(call);
      call.result = await client.sendMessage(id, content, input);
      return call.result;
    };
    if (property === 'closeSession') return async id => { await client.closeSession(id); closed.add(id); };
    const value = Reflect.get(client, property);
    return typeof value === 'function' ? value.bind(client) : value;
  } });
  const server = createServer({ shared: { config, runtimeClient: guardedRuntime,
    authStore: new auth.MemoryPlatformAuthStore(created.state), now: () => new Date() },
  chat: { chatStore: store, telegramCommandSurfaceSync: { async reconcile() {} } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (suffix, method = 'GET', body) => fetch(`${base}/api/${suffix}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
  report.phase = 'preparation';
  report.channelId = channelId;
  const waitSettled = async timeoutMs => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = (await store.read()).channels.find(channel => channel.id === channelId);
      if (!current.roomRouting.workflow.activeTurn) return current;
      await pause(25);
    }
    throw new Error('Private Chat turn did not settle within the acceptance deadline');
  };
  try {
    await server.startupRecovery;
    const before = await store.read();
    const initialCore = await store.readCore();
    const statusResponse = await request('auth/status');
    assert.equal(statusResponse.status, 200);
    const authStatus = await statusResponse.json();
    assert.equal(authStatus.authenticated, true);
    assert.ok(authStatus.csrfToken);
    headers['x-cats-csrf-token'] = authStatus.csrfToken;
    if (readinessOnly) {
      assert.equal(createAttempts, 0);
      report.preparationReadiness = { authenticatedHttp: true, hostBudget: config.chatCollaborationPreparationBudget,
        modelSessionsCreated: 0, messageSubmitted: false };
      report.status = 'ready';
      return;
    }
    if (isCancelled()) throw new Error('Preparation acceptance interrupted before submission');
    const response = await request(`channels/${channelId}/messages`, 'POST', { body: goal });
    assert.equal(response.status, 200);
    const acknowledged = await response.json();
    assert.equal(acknowledged.phase, 'acknowledged');
    report.acknowledged = true;
    report.sourceMessageId = acknowledged.message.id;
    const deadline = Date.now() + budget.maxDurationMs + 15_000;
    let channel;
    while (Date.now() < deadline) {
      if (isCancelled()) throw new Error('Preparation acceptance interrupted');
      channel = (await store.read()).channels.find(entry => entry.id === channelId);
      if (!channel.roomRouting.workflow.activeTurn) break;
      await pause(25);
    }
    const resultMessage = channel.messages.find(message => message.metadata?.collaborationPreparation);
    report.collaboration = resultMessage?.metadata.collaborationPreparation;
    report.resultMessageId = resultMessage?.id;
    assert.equal(resultMessage?.metadata.sourceMessageId, report.sourceMessageId);
    assert.equal(channel.messages.filter(message => message.senderKind === 'user').length, 1);
    assert.equal(channel.roomRouting.workflow.activeTurn, null);
    assert.equal(report.collaboration?.status, 'prepared', JSON.stringify(report.collaboration));
    assert.equal(report.collaboration.feedbackDelivered, true);
    assert.equal(report.collaboration.reason, undefined);
    const preparation = report.collaboration.preparation;
    assert.equal(preparation.status, 'prepared');
    assert.equal(report.collaboration.execution, undefined);
    assert.equal(preparation.execution, 'not_started');
    assert.equal(preparation.budget.admission, 'not_admitted');
    assert.notEqual(preparation.implementer.id, preparation.reviewer.id);
    assert.equal(preparation.conversation.intent, 'create');
    for (const name of allowedTools) assert.ok(report.collaboration.receipts.some(receipt =>
      receipt.toolName === name && receipt.result.status === 'applied'), `Missing actual receipt: ${name}`);
    for (const receipt of report.collaboration.receipts) {
      const decision = messages.map(call => JSON.parse(call.result.segments.filter(segment => segment.kind === 'text')
        .map(segment => segment.text).join('\n'))).find(value => value.decisionId === receipt.decisionId);
      assert.equal(decision?.kind, 'tool_request');
      assert.equal(decision.toolName, receipt.toolName);
    }
    assert.deepEqual(messages.at(-1).envelope.observation.availableTools, []);
    assert.deepEqual(messages.flatMap(call => call.envelope.toolResults), report.collaboration.receipts);
    assert.ok(messages[0].envelope.productKnowledge.entries.some(entry => entry.id === 'orchestrator.discovery'));
    assert.ok(messages.every(call => Number.isFinite(call.result?.tokensUsed) && call.result.tokensUsed > 0));
    assert.deepEqual(report.collaboration.preparationUsage, { limits: budget, requestsStarted: messages.length,
      responsesReceived: messages.length, measuredTokens: messages.reduce((sum, call) => sum + call.result.tokensUsed, 0), complete: true });
    assert.ok(report.collaboration.preparationUsage.measuredTokens < budget.maxTokens);
    assert.ok(closed.has(report.coordinatorSessionId), 'Product loop must close its decision session');
    const after = await store.read();
    const topology = chat => ({ cats: chat.cats.map(cat => ({ id: cat.id, target: cat.defaultExecutionTarget })),
      channels: chat.channels.map(item => ({ id: item.id, cats: item.catAssignments.map(assignment => ({
        id: assignment.catId, participantId: assignment.participantId, target: assignment.execution.target })) })) });
    assert.deepEqual(topology(after), topology(before));
    const core = await store.readCore();
    for (const name of ['tasks', 'workItems', 'projects']) assert.deepEqual(
      core[name].map(({ id, status }) => ({ id, status })), initialCore[name].map(({ id, status }) => ({ id, status })), name);
    assert.ok(core.runs.every(run => run.id.startsWith('run-room-routing-')));
    assert.deepEqual((await new FileChatStore(config.chatStatePath).read()).channels.find(item => item.id === channelId)
      .messages.find(message => message.id === report.resultMessageId).metadata.collaborationPreparation, report.collaboration);
    assert.equal(isCancelled(), false, 'Preparation acceptance interrupted before completion');
    report.noCollaborationAdmission = true;
    report.persistedReportMatches = true;
    report.status = 'prepared';
  } finally {
    try {
      await server.startupRecovery;
      if ((await store.read()).channels.find(channel => channel.id === channelId).roomRouting.workflow.activeTurn) {
        assert.equal((await request(`channels/${channelId}/cancel`, 'POST')).status, 200);
        await waitSettled(5000);
      }
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      report.platformServerClosed = true;
    }
  }
}
