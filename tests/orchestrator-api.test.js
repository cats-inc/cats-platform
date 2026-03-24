import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function usage(content) {
  return {
    content,
    inputTokens: 11,
    outputTokens: 7,
    tokensUsed: 18,
  };
}

function createRuntimeStub(options = {}) {
  let nextSession = 1;
  const sessions = new Map();
  return {
    createdSessions: [],
    sentMessages: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async createSession(input) {
      const session = {
        id: `session-${nextSession++}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? 'C:/chat/runtime',
      };
      sessions.set(session.id, { session, input });
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      const resolver = options.sendMessage;
      if (typeof resolver === 'function') {
        const resolved = await resolver({
          sessionId,
          content,
          session: sessions.get(sessionId)?.session ?? null,
          input: sessions.get(sessionId)?.input ?? null,
          sentMessages: this.sentMessages,
        });
        if (typeof resolved === 'string') {
          return usage(resolved);
        }
        if (resolved) {
          return resolved;
        }
      }
      return usage(
        content.includes('Inline-Agent')
          ? 'Inline-Agent completed the review handoff.'
          : 'Boss Cat acknowledged the turn.',
      );
    },
    async closeSession() {},
  };
}

function readPendingDispatchMetadata(task) {
  return task?.metadata?.pendingOrchestratorDispatch ?? null;
}

class FailingPendingDispatchCleanupStore extends MemoryChatStore {
  failCleanupOnce = true;

  async writeCore(state) {
    if (this.failCleanupOnce) {
      const current = await this.readCore();
      const inProgressTask = current.tasks.find((candidate) =>
        readPendingDispatchMetadata(candidate)?.replayState === 'in_progress'
      );
      if (inProgressTask) {
        const nextTask = state.tasks.find((candidate) => candidate.id === inProgressTask.id) ?? null;
        if (!readPendingDispatchMetadata(nextTask)) {
          this.failCleanupOnce = false;
          throw new Error('simulated pending dispatch cleanup failure');
        }
      }
    }

    return super.writeCore(state);
  }
}

async function withServer(
  runtimeClient,
  callback,
  chatStore = new MemoryChatStore(),
  overrides = {},
) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    chatStore,
    now: () => new Date('2026-03-23T00:00:00.000Z'),
    ...overrides,
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function createChannel(baseUrl, options = {}) {
  const response = await fetch(`${baseUrl}/api/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: options.title ?? 'Orchestrator Lab',
      topic: options.topic ?? 'Validate contract-first orchestration seams.',
      roomMode: options.roomMode ?? 'boss_chat',
      cats: options.cats ?? [
        {
          name: 'Inline-Agent',
          provider: 'gemini',
          roles: ['reviewer'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

test('POST /api/orchestrator/plan returns machine-readable plan and tool intent', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const response = await fetch(`${baseUrl}/api/orchestrator/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please have @Inline-Agent review the current diff.',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.contractVersion, 1);
    assert.equal(payload.surface, 'direct_product_api');
    assert.equal(payload.operator.executionLoopPath, `/api/orchestrator/channels/${channelId}/execution-loop`);
    assert.equal(payload.plan.channelId, channelId);
    assert.equal(payload.plan.snapshot, 'pre_dispatch');
    assert.equal(payload.plan.runtimeToolPlane.productSurfacePath, '/api/runtime/mcp');
    assert.equal(payload.plan.runtimeToolPlane.schemaVersion, 1);
    assert.deepEqual(
      payload.plan.runtimeToolPlane.tools.map((tool) => tool.name),
      [
        'runtime_summary',
        'list_sessions',
        'observe_session',
        'audit_workspace',
        'audit_delivery_target',
      ],
    );
    assert.equal(payload.plan.routing.initialTargets.length, 1);
    assert.equal(payload.plan.routing.initialTargets[0].targetName, 'Inline-Agent');
    assert.equal(payload.plan.executionLoop.dispatchBoundary, 'direct_runtime_api');
    assert.equal(payload.plan.executionLoop.supportsReplan, true);
    assert.equal(payload.plan.execution.state, 'planned');
    assert.equal(payload.plan.execution.approval.status, 'not_requested');
    assert.equal(payload.plan.execution.approval.requestAction.path, '/api/core/approvals');
    assert.equal(payload.plan.execution.nextActions[0].kind, 'dispatch');
    assert.ok(payload.plan.execution.steps.some((step) => step.kind === 'dispatch_group'));
    assert.ok(payload.plan.execution.steps.some((step) => step.kind === 'continuation_handoff'));
    assert.ok(payload.plan.execution.steps.some((step) => step.kind === 'report_outcome'));
    assert.deepEqual(
      payload.plan.routing.initialTargets[0].toolIntent.allowedTools,
      ['runtime_summary', 'list_sessions', 'observe_session'],
    );
    assert.ok(Array.isArray(payload.plan.routing.initialTargets[0].runtimeSkills.requestedSkills));
    assert.equal(payload.plan.routing.initialTargets[0].runtimeSkills.requestedSkills[0], 'companion');
  });
});

test('POST /api/orchestrator/dispatch returns executed continuation steps from the room workflow loop', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage('@Followup-Agent please continue with the regression audit.');
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent finished the audit.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl, {
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'gemini',
          roles: ['reviewer'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
        {
          name: 'Followup-Agent',
          provider: 'claude',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;

    const response = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please ask @Inline-Agent to review this change',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.dispatch.channelId, channelId);
    assert.equal(payload.dispatch.status, 'dispatched');
    assert.equal(payload.dispatch.blockedReason, null);
    assert.ok(payload.dispatch.sourceMessageId);
    assert.equal(payload.dispatch.results.length, 2);
    assert.equal(payload.dispatch.results[0].targetName, 'Inline-Agent');
    assert.equal(payload.dispatch.results[1].targetName, 'Followup-Agent');
    assert.equal(payload.plan.snapshot, 'pre_dispatch');
    assert.equal(payload.operator.approvalsPath, '/api/core/approvals');
    assert.equal(payload.operator.operatorActionsPath, '/api/core/operator-actions');
    assert.equal(payload.executionLoop.channelId, channelId);
    assert.equal(payload.executionLoop.operator.channelId, channelId);
    assert.equal(payload.executionLoop.execution.state, 'completed');
    assert.equal(payload.executionLoop.execution.workflowShape, 'sequential');
    assert.equal(payload.executionLoop.execution.nextActions[0].kind, 'complete');
    assert.ok(
      payload.executionLoop.execution.steps.some(
        (step) =>
          step.kind === 'dispatch_target'
          && step.participant?.participantName === 'Followup-Agent'
          && step.participant?.plannedDepth === 1,
      ),
    );
    assert.ok(
      payload.executionLoop.execution.steps.some((step) => step.kind === 'continuation_handoff'),
    );
    assert.ok(runtimeClient.sentMessages.length >= 1);
  });
});

test('POST /api/orchestrator/dispatch persists approval-blocked requests and auto-resumes them after approval', async () => {
  const runtimeClient = createRuntimeStub();
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const pendingApprovalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
      }),
    });
    assert.equal(pendingApprovalResponse.status, 200);

    const blockedDispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please ask @Inline-Agent to review this change',
      }),
    });
    assert.equal(blockedDispatchResponse.status, 200);
    const blockedPayload = await blockedDispatchResponse.json();
    assert.equal(blockedPayload.dispatch.status, 'blocked');
    assert.equal(blockedPayload.dispatch.blockedReason, 'approval_pending');
    assert.equal(blockedPayload.dispatch.results.length, 0);
    assert.equal(blockedPayload.executionLoop.execution.state, 'awaiting_approval');
    assert.deepEqual(
      blockedPayload.executionLoop.execution.nextActions.map((action) => action.kind),
      ['approve', 'reroute', 'reject'],
    );
    assert.equal(runtimeClient.sentMessages.length, 0);

    const approvedResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(approvedResponse.status, 200);
    const approvedPayload = await approvedResponse.json();
    assert.equal(approvedPayload.approval.status, 'approved');
    assert.deepEqual(approvedPayload.autoResume, {
      trigger: 'approve',
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: approvedPayload.autoResume.sourceMessageId,
      resultCount: 1,
      executionState: 'completed',
    });
    assert.ok(approvedPayload.autoResume.sourceMessageId);
    assert.ok(runtimeClient.sentMessages.length >= 1);

    const executionLoopResponse = await fetch(
      `${baseUrl}/api/orchestrator/channels/${channelId}/execution-loop`,
    );
    assert.equal(executionLoopResponse.status, 200);
    const executionLoopPayload = await executionLoopResponse.json();
    assert.equal(executionLoopPayload.executionLoop.execution.state, 'completed');
    assert.equal(executionLoopPayload.executionLoop.execution.approval.status, 'approved');
  });
});

test('POST /api/core/approvals uses an injected pending-dispatch resume seam when provided', async () => {
  const runtimeClient = createRuntimeStub();
  const replayCalls = [];
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const pendingApprovalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
      }),
    });
    assert.equal(pendingApprovalResponse.status, 200);

    const blockedDispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please ask @Inline-Agent to review this change',
      }),
    });
    assert.equal(blockedDispatchResponse.status, 200);

    const approvedResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(approvedResponse.status, 200);
    const approvedPayload = await approvedResponse.json();
    assert.deepEqual(approvedPayload.autoResume, {
      trigger: 'approve',
      status: 'failed',
      blockedReason: null,
      sourceMessageId: null,
      resultCount: 0,
      executionState: null,
      error: 'injected replay seam used',
    });
    assert.equal(runtimeClient.sentMessages.length, 0);
    assert.equal(replayCalls.length, 1);
    assert.equal(replayCalls[0].options.trigger, 'approve');
    assert.equal(replayCalls[0].request.channelId, channelId);
  }, new MemoryChatStore(), {
    resumePendingOrchestratorDispatch: async (request, options) => {
      replayCalls.push({ request, options });
      throw new Error('injected replay seam used');
    },
  });
});

test('POST /api/core/approvals auto-resumes stored approval-blocked dispatches after reroute decisions', async () => {
  const runtimeClient = createRuntimeStub();
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const pendingApprovalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
      }),
    });
    assert.equal(pendingApprovalResponse.status, 200);

    const blockedDispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please ask @Inline-Agent to review this change',
      }),
    });
    assert.equal(blockedDispatchResponse.status, 200);
    const blockedPayload = await blockedDispatchResponse.json();
    assert.equal(blockedPayload.dispatch.status, 'blocked');
    assert.equal(blockedPayload.dispatch.blockedReason, 'approval_pending');

    const rerouteResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'rejected',
        action: 'reroute',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(rerouteResponse.status, 200);
    const reroutePayload = await rerouteResponse.json();
    assert.equal(reroutePayload.approval.status, 'rejected');
    assert.equal(reroutePayload.approval.decisionAction, 'reroute');
    assert.deepEqual(reroutePayload.autoResume, {
      trigger: 'reroute',
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: reroutePayload.autoResume.sourceMessageId,
      resultCount: 1,
      executionState: 'completed',
    });
    assert.ok(reroutePayload.autoResume.sourceMessageId);
    assert.ok(runtimeClient.sentMessages.length >= 1);

    const executionLoopResponse = await fetch(
      `${baseUrl}/api/orchestrator/channels/${channelId}/execution-loop`,
    );
    assert.equal(executionLoopResponse.status, 200);
    const executionLoopPayload = await executionLoopResponse.json();
    assert.equal(executionLoopPayload.executionLoop.execution.state, 'completed');
    assert.equal(executionLoopPayload.executionLoop.execution.approval.status, 'rejected');
    assert.equal(
      executionLoopPayload.executionLoop.execution.approval.latestDecisionAction,
      'reroute',
    );
  });
});

test('POST /api/core/approvals does not replay the same blocked dispatch twice when cleanup persistence fails after replay', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new FailingPendingDispatchCleanupStore();
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const pendingApprovalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
      }),
    });
    assert.equal(pendingApprovalResponse.status, 200);

    const blockedDispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please ask @Inline-Agent to review this change',
      }),
    });
    assert.equal(blockedDispatchResponse.status, 200);

    const approvedResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(approvedResponse.status, 200);
    const approvedPayload = await approvedResponse.json();
    assert.equal(approvedPayload.autoResume.status, 'dispatched');
    assert.equal(runtimeClient.sentMessages.length, 1);

    const coreState = await chatStore.readCore();
    const task = coreState.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.equal(readPendingDispatchMetadata(task)?.replayState, 'in_progress');

    const repeatedApproveResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: `task-channel-${channelId}`,
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(repeatedApproveResponse.status, 200);
    const repeatedApprovePayload = await repeatedApproveResponse.json();
    assert.equal(repeatedApprovePayload.autoResume, undefined);
    assert.equal(runtimeClient.sentMessages.length, 1);
  }, chatStore);
});

test('GET /api/orchestrator/channels/:id/execution-loop returns recovery actions for blocked multi-step runs', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage('@Followup-Agent please take first pass.');
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('@Inline-Agent please review.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl, {
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
        {
          name: 'Followup-Agent',
          provider: 'claude',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent to start the routing loop.',
      }),
    });
    assert.equal(dispatchResponse.status, 200);

    const response = await fetch(`${baseUrl}/api/orchestrator/channels/${channelId}/execution-loop`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.contractVersion, 1);
    assert.equal(payload.executionLoop.channelId, channelId);
    assert.equal(payload.executionLoop.operator.channelId, channelId);
    assert.equal(payload.executionLoop.operator.conversationId, `conversation-channel-${channelId}`);
    assert.ok(payload.executionLoop.runInspector);
    assert.equal(payload.executionLoop.execution.state, 'blocked');
    assert.ok(
      payload.executionLoop.execution.steps.some((step) => step.kind === 'recovery'),
    );
    assert.ok(
      payload.executionLoop.execution.recovery.incidentActions.some((action) => action.kind === 'retry'),
    );
    assert.ok(
      payload.executionLoop.execution.nextActions.some((action) => action.kind === 'retry'),
    );
    assert.equal(payload.operator.executionLoopPath, `/api/orchestrator/channels/${channelId}/execution-loop`);
  });
});

test('GET /api/orchestrator/channels/:id/execution-loop accepts a projected room-workflow runId', async () => {
  const runtimeClient = createRuntimeStub();
  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Please ask @Inline-Agent to review this change',
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatchPayload = await dispatchResponse.json();
    const runId = dispatchPayload.operator.latestRunId;
    assert.ok(runId);

    const response = await fetch(
      `${baseUrl}/api/orchestrator/channels/${channelId}/execution-loop?runId=${encodeURIComponent(runId)}`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.executionLoop.execution.sourceTurnId, dispatchPayload.executionLoop.execution.sourceTurnId);
    assert.equal(payload.operator.latestRunId, runId);
  });
});
