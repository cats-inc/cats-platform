import assert from 'node:assert/strict';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  buildChannelView,
  createChannel as seedChannel,
  setChannelCatLease,
  setChannelRoomRouting,
} from '../build/server/products/chat/state/model/index.js';
import { routeChannelMessage } from '../build/server/products/chat/state/runtimeActions.js';
import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { resolveMentionRoute } from '../build/server/products/chat/state/mentionRouter.js';
import {
  createDefaultRoomRoutingState,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../build/server/products/chat/state/room-routing/index.js';
import {
  appendWorkflowEvent,
  createWorkflowEvent,
  createWorkflowTurn,
} from '../build/server/products/chat/state/room-routing/workflow.js';
import { buildChatLaneId } from '../build/server/shared/chatCoreIds.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function usage(content) {
  return {
    segments: [{ kind: 'text', text: content, toolName: null, toolId: null }],
    inputTokens: 11,
    outputTokens: 7,
    tokensUsed: 18,
  };
}

async function waitFor(assertion, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await assertion();
}

function createRuntimeStub(options = {}) {
  let nextSession = 1;
  let nextWakeup = 1;
  const sessions = new Map();
  return {
    createdSessions: [],
    sentMessages: [],
    wakeups: [],
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
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
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
    async createWakeup(input) {
      const request = {
        id: `wakeup-${nextWakeup++}`,
        scheduleAt: input.scheduleAt ?? null,
        target: input.target,
        metadata: input.metadata ?? {},
      };
      this.wakeups.push({
        ...input,
        request,
      });
      return {
        request,
        coalesced: false,
      };
    },
    async observeSession(sessionId) {
      return {
        session: {
          id: sessionId,
          inspection: {
            state: 'idle',
          },
        },
        observePath: `/sessions/${sessionId}/observe`,
        stream: {
          path: `/sessions/${sessionId}/stream`,
          available: false,
        },
      };
    },
    async streamSession() {},
    async closeSession() {},
  };
}

function readPendingDispatchMetadata(task) {
  return task?.metadata?.pendingOrchestratorDispatch ?? null;
}

function findReplayActivity(corePayload, taskId, replayPhase, replayTrigger = undefined) {
  return corePayload.activities.find((activity) =>
    activity.taskId === taskId
    && activity.metadata?.replayPhase === replayPhase
    && (replayTrigger === undefined || activity.metadata?.replayTrigger === replayTrigger)
  ) ?? null;
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
  const {
    startup,
    coreStore,
    resumePendingOrchestratorDispatch,
    work,
    code,
    ...chatOverrides
  } = overrides;
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-03-23T00:00:00.000Z'),
      startup,
      coreStore,
      resumePendingOrchestratorDispatch,
    },
    chat: {
      chatStore,
      ...chatOverrides,
    },
    work,
    code,
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

test('POST /api/orchestrator/plan uses the injected planner surface seam', async () => {
  let buildCalls = 0;
  let resolveCalls = 0;

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
    assert.equal(payload.plan.channelId, channelId);
    assert.ok(buildCalls >= 1);
    assert.equal(resolveCalls, 1);
  }, new MemoryChatStore(), {
    orchestratorPlannerSurface: {
      buildChannelView(state, channelId) {
        buildCalls += 1;
        return buildChannelView(state, channelId);
      },
      resolveMentionRoute(state, channelId, body, options) {
        resolveCalls += 1;
        return resolveMentionRoute(state, channelId, body, options);
      },
      resolveRoomRoutingState,
      resolveOrchestratorDisplayName(state) {
        return state.globalOrchestrator.nextFocus;
      },
      buildOperatorView() {
        return null;
      },
      buildRunInspectorView() {
        return null;
      },
      resolveConversationId(channelId) {
        return `conversation:${channelId}`;
      },
    },
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

test('POST /api/orchestrator/dispatch reuses the room-entry session during a concurrent wake', async () => {
  const runtimeClient = createRuntimeStub();
  const originalCreateSession = runtimeClient.createSession.bind(runtimeClient);
  let createCalls = 0;
  let releaseFirstCreate = () => {};
  const firstCreateStarted = new Promise((resolve) => {
    runtimeClient.createSession = async (input) => {
      createCalls += 1;
      if (createCalls === 1) {
        resolve(undefined);
        await new Promise((resume) => {
          releaseFirstCreate = resume;
        });
      }
      return originalCreateSession(input);
    };
  });

  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl, {
      cats: [],
    });
    const channelId = created.channel.id;

    const wakeResponsePromise = fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });

    await firstCreateStarted;

    const dispatchResponsePromise = fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Handle this directly.',
      }),
    });

    releaseFirstCreate();

    const [wakeResponse, dispatchResponse] = await Promise.all([
      wakeResponsePromise,
      dispatchResponsePromise,
    ]);
    assert.equal(wakeResponse.status, 200);
    assert.equal(dispatchResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, 'session-1');
  });
});

test('POST /api/orchestrator/dispatch uses the injected channel router seam', async () => {
  const runtimeClient = createRuntimeStub();
  let buildCalls = 0;
  let routeCalls = 0;

  await withServer(runtimeClient, async (baseUrl) => {
    const created = await createChannel(baseUrl);
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
    assert.equal(payload.dispatch.status, 'dispatched');
    assert.ok(buildCalls >= 2);
    assert.equal(routeCalls, 1);
  }, new MemoryChatStore(), {
    orchestratorChannelRouter: {
      buildChannelView(state, channelId) {
        buildCalls += 1;
        return buildChannelView(state, channelId);
      },
      routeChannelMessage(input) {
        routeCalls += 1;
        return routeChannelMessage(
          input.state,
          input.channelId,
          {
            body: input.body,
            senderName: input.senderName,
          },
          input.runtimeClient,
          input.now,
          {
            transport: input.transport,
            companionStore: input.companionStore,
            memoryService: input.memoryService,
            chatStore: input.chatStore,
          },
        );
      },
    },
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
    const blockedCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(blockedCoreResponse.status, 200);
    const blockedCorePayload = await blockedCoreResponse.json();
    const storedReplayActivity = findReplayActivity(
      blockedCorePayload,
      `task-channel-${channelId}`,
      'pending_dispatch_stored',
    );
    assert.ok(storedReplayActivity);
    assert.equal(storedReplayActivity?.metadata?.source, 'orchestrator-replay');

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

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    const run = corePayload.runs.find((candidate) =>
      candidate.taskId === `task-channel-${channelId}`
      && candidate.metadata?.source === 'task-lifecycle');
    assert.ok(task);
    assert.ok(run);
    assert.equal(task.status, 'in_progress');
    assert.equal(run.status, 'running');
    assert.equal(run.metadata.sessionId, runtimeClient.sentMessages[0]?.sessionId ?? null);
    assert.equal(task.metadata.taskLifecycle.runId, run.id);
    assert.ok(
      corePayload.activities.some((activity) =>
        activity.runId === run.id && /started/i.test(activity.message)),
    );
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_started',
        'approve',
      ),
    );
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_dispatched',
        'approve',
      ),
    );
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
    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_failed',
        'approve',
      ),
    );
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
    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_dispatched',
        'reroute',
      ),
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

test('server startup recovery reopens stranded approval replay after restart', async () => {
  const chatStore = new FailingPendingDispatchCleanupStore();
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage('Inline-Agent completed the recovered review.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });

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
    assert.equal(runtimeClient.sentMessages.length, 1);
  }, chatStore);

  await withServer(runtimeClient, async (baseUrl) => {
    await waitFor(async () => {
      const core = await chatStore.readCore();
      const task = core.tasks.find((candidate) => candidate.id.startsWith('task-channel-'));
      assert.equal(readPendingDispatchMetadata(task)?.replayState, 'failed');
    });

    const core = await chatStore.readCore();
    const task = core.tasks.find((candidate) => candidate.id.startsWith('task-channel-'));
    assert.ok(task);

    const repeatedApproveResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: task.id,
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(repeatedApproveResponse.status, 200);
    const repeatedApprovePayload = await repeatedApproveResponse.json();

    assert.deepEqual(repeatedApprovePayload.autoResume, {
      trigger: 'approve',
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: repeatedApprovePayload.autoResume.sourceMessageId,
      resultCount: repeatedApprovePayload.autoResume.resultCount,
      executionState: 'completed',
    });
    assert.equal(runtimeClient.sentMessages.length, 2);

    const updatedCore = await chatStore.readCore();
    const updatedTask = updatedCore.tasks.find((candidate) => candidate.id === task.id);
    assert.equal(readPendingDispatchMetadata(updatedTask), null);
    assert.equal(updatedTask?.metadata?.orchestratorDispatchReplay?.replayState, 'ready');
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
    assert.ok(payload.executionLoop.operator.workflowContinuation);
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.blockedReason,
      'anti_ping_pong',
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.stageId,
      'continuation_handoff',
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.workflowShape,
      'sequential',
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.continuationSource,
      'explicit_mentions',
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.retryAvailable,
      true,
    );
    assert.equal(payload.executionLoop.operator.attention?.severity, 'attention');
    assert.equal(payload.executionLoop.operator.attention?.needsOperatorAttention, true);
    assert.ok(
      payload.executionLoop.operator.nextActions.some((action) => action.kind === 'retry'),
    );
    assert.equal(
      payload.executionLoop.runInspector.attention?.severity,
      'attention',
    );
    assert.ok(
      payload.executionLoop.runInspector.nextActions.some((action) => action.kind === 'retry'),
    );
    assert.equal(
      payload.executionLoop.operator.latestWorkflowRecommendation,
      null,
    );

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task?.metadata?.workflowContinuationReplay);
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.sourceMessageId,
      task.metadata.workflowContinuationReplay.sourceMessageId,
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.sourceTurnId,
      task.metadata.workflowContinuationReplay.sourceTurnId,
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.sourceLaneId,
      task.metadata.workflowContinuationReplay.sourceLaneId,
    );
    assert.equal(
      payload.executionLoop.operator.workflowContinuation.sourceAssistantTurnId,
      task.metadata.workflowContinuationReplay.sourceAssistantTurnId,
    );
    assert.equal(
      payload.executionLoop.runInspector.workflowContinuation.sourceMessageId,
      task.metadata.workflowContinuationReplay.sourceMessageId,
    );
    assert.equal(
      payload.executionLoop.runInspector.workflowContinuation.sourceTurnId,
      task.metadata.workflowContinuationReplay.sourceTurnId,
    );
    assert.deepEqual(
      payload.executionLoop.operator.workflowContinuation.targetNames,
      task.metadata.workflowContinuationReplay.targets.map((target) => target.participantName),
    );
    assert.equal(payload.operator.executionLoopPath, `/api/orchestrator/channels/${channelId}/execution-loop`);
  });
});

test('POST /api/core/operator-actions auto-resumes stored dispatch replay on retry', async () => {
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
    const dispatchPayload = await dispatchResponse.json();
    const blockedRunId = dispatchPayload.operator.latestRunId;
    assert.ok(blockedRunId);
    const sentBeforeRetry = runtimeClient.sentMessages.length;
    assert.ok(sentBeforeRetry >= 2);

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: `task-channel-${channelId}`,
        runId: blockedRunId,
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'retry');
    assert.deepEqual(operatorActionPayload.autoResume, {
      trigger: 'retry',
      status: 'blocked',
      blockedReason: 'anti_ping_pong',
      sourceMessageId: operatorActionPayload.autoResume.sourceMessageId,
      resultCount: operatorActionPayload.autoResume.resultCount,
      executionState: 'blocked',
    });
    assert.ok(operatorActionPayload.autoResume.sourceMessageId);
    assert.ok(operatorActionPayload.autoResume.resultCount >= 2);
    assert.equal(operatorActionPayload.governanceSummary.latestOperatorAction.kind, 'retry');
    assert.ok(runtimeClient.sentMessages.length > sentBeforeRetry);

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task);
    assert.equal(task.metadata.orchestratorDispatchReplay.replayTrigger, 'retry');
    assert.equal(task.metadata.orchestratorDispatchReplay.replayState, 'ready');
    assert.equal(
      task.metadata.orchestratorDispatchReplay.sourceMessageId,
      operatorActionPayload.autoResume.sourceMessageId,
    );
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_started',
        'retry',
      ),
    );
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_blocked',
        'retry',
      ),
    );
  });
});

test('POST /api/core/operator-actions auto-resumes stored workflow continuation replay on retry', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage('@Followup-Agent please continue with the resumed audit.');
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent finished the resumed audit.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  const chatStore = new MemoryChatStore();

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
          provider: 'gemini',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;
    const currentState = await chatStore.read();
    const currentChannel = currentState.channels.find((candidate) => candidate.id === channelId);
    assert.ok(currentChannel);
    currentChannel.roomRouting.maxContinuations = 0;
    await chatStore.write(currentState);

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent to start the routing loop.',
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatchPayload = await dispatchResponse.json();
    const blockedRunId = dispatchPayload.operator.latestRunId;
    assert.ok(blockedRunId);
    assert.equal(dispatchPayload.executionLoop.execution.state, 'blocked');
    assert.equal(dispatchPayload.dispatch.results.length, 1);
    assert.equal(runtimeClient.sentMessages.length, 1);

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: `task-channel-${channelId}`,
        runId: blockedRunId,
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'retry');
    assert.deepEqual(operatorActionPayload.autoResume, {
      trigger: 'retry',
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: operatorActionPayload.autoResume.sourceMessageId,
      resultCount: 1,
      executionState: 'completed',
    });
    assert.equal(runtimeClient.sentMessages.length, 2);

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task);
    assert.equal(task.metadata.orchestratorDispatchReplay.replayTrigger, 'retry');
    assert.equal(task.metadata.orchestratorDispatchReplay.replayState, 'ready');
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_started',
        'retry',
      ),
    );
    assert.ok(
      corePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'),
    );
  }, chatStore);
});

test('POST /api/core/operator-actions auto-resumes stored workflow continuation replay on retry after max-dispatch blocks', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage('@Followup-Agent please continue with the resumed audit.');
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent finished the resumed audit.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  const chatStore = new MemoryChatStore();

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
          provider: 'gemini',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;
    const currentState = await chatStore.read();
    const currentChannel = currentState.channels.find((candidate) => candidate.id === channelId);
    assert.ok(currentChannel);
    currentChannel.roomRouting.maxDispatchesPerTurn = 1;
    await chatStore.write(currentState);

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent to start the routing loop.',
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatchPayload = await dispatchResponse.json();
    const blockedRunId = dispatchPayload.operator.latestRunId;
    assert.ok(blockedRunId);
    assert.equal(dispatchPayload.executionLoop.execution.state, 'blocked');
    assert.equal(dispatchPayload.dispatch.results.length, 1);
    assert.equal(runtimeClient.sentMessages.length, 1);

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: `task-channel-${channelId}`,
        runId: blockedRunId,
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'retry');
    assert.deepEqual(operatorActionPayload.autoResume, {
      trigger: 'retry',
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: operatorActionPayload.autoResume.sourceMessageId,
      resultCount: 1,
      executionState: 'completed',
    });
    assert.equal(runtimeClient.sentMessages.length, 2);

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task);
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      findReplayActivity(
        corePayload,
        `task-channel-${channelId}`,
        'replay_started',
        'retry',
      ),
    );
    assert.ok(
      corePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.replayPhase === 'replay_dispatched'),
    );
  }, chatStore);
});

test('POST /api/core/operator-actions re-resolves stale workflow continuation targets from stored recommendations on retry', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage(JSON.stringify({
          source: 'checkpoint',
          workflowShape: 'sequential',
          reviewRequired: false,
          candidateTargets: [
            {
              participantKind: 'cat',
              participantName: 'Followup-Agent',
            },
          ],
        }));
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent finished the recommendation-resolved retry.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  const chatStore = new MemoryChatStore();

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
          provider: 'gemini',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;
    const currentState = await chatStore.read();
    const currentChannel = currentState.channels.find((candidate) => candidate.id === channelId);
    assert.ok(currentChannel);
    currentChannel.roomRouting.maxDispatchesPerTurn = 1;
    await chatStore.write(currentState);

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent to recommend the next workflow target.',
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatchPayload = await dispatchResponse.json();
    const blockedRunId = dispatchPayload.operator.latestRunId;
    assert.ok(blockedRunId);
    assert.equal(dispatchPayload.executionLoop.execution.state, 'blocked');
    assert.equal(runtimeClient.sentMessages.length, 1);

    const replacementState = await chatStore.read();
    const followupCat = replacementState.cats.find((candidate) => candidate.name === 'Followup-Agent');
    assert.ok(followupCat);
    replacementState.cats.push({
      ...structuredClone(followupCat),
      id: `${followupCat.id}-replacement`,
      updatedAt: '2026-03-26T13:21:00.000Z',
    });
    const replacementChannel = replacementState.channels.find((candidate) => candidate.id === channelId);
    assert.ok(replacementChannel);
    const followupAssignment = replacementChannel.catAssignments.find((assignment) =>
      assignment.catId === followupCat.id && assignment.status === 'active',
    );
    assert.ok(followupAssignment);
    followupAssignment.catId = `${followupCat.id}-replacement`;
    followupAssignment.execution.lease.sessionId = 'session-followup-replacement';
    await chatStore.write(replacementState);

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: `task-channel-${channelId}`,
        runId: blockedRunId,
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'retry');
    assert.deepEqual(operatorActionPayload.autoResume, {
      trigger: 'retry',
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: operatorActionPayload.autoResume.sourceMessageId,
      resultCount: 1,
      executionState: 'completed',
    });
    assert.equal(runtimeClient.sentMessages.length, 2);
    assert.match(runtimeClient.sentMessages[1]?.content ?? '', /You are Followup-Agent/u);

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task);
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      corePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'),
    );
  }, chatStore);
});

test('recommendation-only continuation replay stays blocked on retry and auto-resumes when the target cat is re-added', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage(JSON.stringify({
          workflowRecommendation: {
            source: 'checkpoint',
            workflowShape: 'sequential',
            reviewRequired: false,
            candidateTargetNames: ['Followup-Agent'],
            branchStrategy: 'transplant_context',
            rationale: 'Hand this off once the follow-up specialist is available.',
          },
        }));
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent completed the previously blocked continuation.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  const chatStore = new MemoryChatStore();

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
          provider: 'gemini',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;
    const currentState = await chatStore.read();
    const currentChannel = currentState.channels.find((candidate) => candidate.id === channelId);
    assert.ok(currentChannel);
    const followupAssignment = currentChannel.catAssignments.find((assignment) =>
      assignment.status === 'active' && currentState.cats.some((cat) =>
        cat.id === assignment.catId && cat.name === 'Followup-Agent'),
    );
    assert.ok(followupAssignment);
    const followupCat = currentState.cats.find((cat) => cat.id === followupAssignment.catId);
    assert.ok(followupCat);
    followupAssignment.status = 'removed';
    followupAssignment.leftAt = '2026-03-26T14:00:00.000Z';
    await chatStore.write(currentState);

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent to pick the next specialist.',
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatchPayload = await dispatchResponse.json();
    const blockedRunId = dispatchPayload.operator.latestRunId;
    assert.ok(blockedRunId);
    assert.equal(dispatchPayload.executionLoop.execution.state, 'blocked');
    assert.equal(runtimeClient.sentMessages.length, 1);

    const blockedCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(blockedCoreResponse.status, 200);
    const blockedCorePayload = await blockedCoreResponse.json();
    const blockedTask = blockedCorePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(blockedTask);
    assert.equal(blockedTask.metadata.workflowContinuationReplay.blockedReason, 'no_valid_targets');
    assert.equal(blockedTask.metadata.workflowContinuationReplay.targets.length, 0);
    assert.equal(blockedTask.metadata.workflowContinuationReplay.workflowStageId, 'continuation_handoff');
    assert.equal(blockedTask.metadata.workflowContinuationReplay.workflowShape, 'sequential');
    assert.equal(
      blockedTask.metadata.workflowContinuationReplay.workflowRecommendation.candidateTargets[0].participantName,
      'Followup-Agent',
    );

    const blockedRetryResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: `task-channel-${channelId}`,
        runId: blockedRunId,
      }),
    });
    assert.equal(blockedRetryResponse.status, 200);
    const blockedRetryPayload = await blockedRetryResponse.json();
    assert.equal(blockedRetryPayload.action, 'retry');
    assert.deepEqual(blockedRetryPayload.autoResume, {
      trigger: 'retry',
      status: 'blocked',
      blockedReason: 'no_valid_targets',
      sourceMessageId: blockedRetryPayload.autoResume.sourceMessageId,
      resultCount: 0,
      executionState: 'blocked',
    });
    assert.equal(runtimeClient.sentMessages.length, 1);

    const stillBlockedCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stillBlockedCoreResponse.status, 200);
    const stillBlockedCorePayload = await stillBlockedCoreResponse.json();
    const stillBlockedTask = stillBlockedCorePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(stillBlockedTask);
    assert.equal(stillBlockedTask.metadata.workflowContinuationReplay.blockedReason, 'no_valid_targets');
    assert.equal(stillBlockedTask.metadata.workflowContinuationReplay.replayState, 'ready');
    assert.ok(
      stillBlockedCorePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_blocked'
        && activity.metadata?.blockedReason === 'no_valid_targets'),
    );

    const reassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${followupCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: followupCat.defaultExecutionTarget.provider,
        instance: followupCat.defaultExecutionTarget.instance,
        model: followupCat.defaultExecutionTarget.model,
        modelSelection: followupCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(reassignResponse.status, 200);
    const reassignPayload = await reassignResponse.json();
    assert.equal(reassignPayload.cat.status, 'active');
    assert.ok(reassignPayload.cat.execution.lease.sessionId);
    assert.equal(runtimeClient.sentMessages.length, 2);
    assert.match(runtimeClient.sentMessages[1]?.content ?? '', /You are Followup-Agent/u);

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task);
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      corePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === 'target_recovered'),
    );
  }, chatStore);
});

test('recommendation-only parallel continuation replay waits for all recovered targets before auto-resuming', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Inline-Agent')) {
        return usage(JSON.stringify({
          workflowRecommendation: {
            source: 'checkpoint',
            workflowShape: 'concurrent',
            reviewRequired: false,
            candidateTargetNames: ['Followup-Agent', 'Verifier-Agent'],
            branchStrategy: 'transplant_context',
            rationale: 'Fan this out after both specialists are available again.',
          },
        }));
      }
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent completed the resumed parallel continuation.');
      }
      if (content.includes('You are Verifier-Agent')) {
        return usage('Verifier-Agent completed the resumed parallel continuation.');
      }
      return usage('Boss Cat acknowledged the turn.');
    },
  });
  const chatStore = new MemoryChatStore();

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
          provider: 'gemini',
          roles: ['auditor'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
        {
          name: 'Verifier-Agent',
          provider: 'gemini',
          roles: ['verifier'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
        },
      ],
    });
    const channelId = created.channel.id;
    const currentState = await chatStore.read();
    const followupAssignment = currentState.channels
      .find((candidate) => candidate.id === channelId)
      ?.catAssignments.find((assignment) =>
        assignment.status === 'active' && currentState.cats.some((cat) =>
          cat.id === assignment.catId && cat.name === 'Followup-Agent'));
    const verifierAssignment = currentState.channels
      .find((candidate) => candidate.id === channelId)
      ?.catAssignments.find((assignment) =>
        assignment.status === 'active' && currentState.cats.some((cat) =>
          cat.id === assignment.catId && cat.name === 'Verifier-Agent'));
    assert.ok(followupAssignment);
    assert.ok(verifierAssignment);
    const followupCat = currentState.cats.find((cat) => cat.id === followupAssignment.catId);
    const verifierCat = currentState.cats.find((cat) => cat.id === verifierAssignment.catId);
    assert.ok(followupCat);
    assert.ok(verifierCat);
    followupAssignment.status = 'removed';
    followupAssignment.leftAt = '2026-03-26T15:00:00.000Z';
    verifierAssignment.status = 'removed';
    verifierAssignment.leftAt = '2026-03-26T15:00:00.000Z';
    await chatStore.write(currentState);

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent to fan this out after both specialists return.',
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatchPayload = await dispatchResponse.json();
    assert.equal(dispatchPayload.executionLoop.execution.state, 'blocked');
    assert.equal(runtimeClient.sentMessages.length, 1);
    const blockedCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(blockedCoreResponse.status, 200);
    const blockedCorePayload = await blockedCoreResponse.json();
    const blockedTask = blockedCorePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(blockedTask);
    assert.equal(blockedTask.metadata.workflowContinuationReplay.workflowStageId, 'concurrent_fan_out');
    assert.equal(blockedTask.metadata.workflowContinuationReplay.workflowShape, 'concurrent');

    const firstReassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${followupCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: followupCat.defaultExecutionTarget.provider,
        instance: followupCat.defaultExecutionTarget.instance,
        model: followupCat.defaultExecutionTarget.model,
        modelSelection: followupCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(firstReassignResponse.status, 200);
    assert.equal(runtimeClient.sentMessages.length, 1);

    const stillBlockedCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stillBlockedCoreResponse.status, 200);
    const stillBlockedCorePayload = await stillBlockedCoreResponse.json();
    const stillBlockedTask = stillBlockedCorePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(stillBlockedTask);
    assert.equal(stillBlockedTask.metadata.workflowContinuationReplay.blockedReason, 'no_valid_targets');
    assert.equal(stillBlockedTask.metadata.workflowContinuationReplay.replayState, 'ready');
    assert.equal(stillBlockedTask.metadata.workflowContinuationReplay.workflowStageId, 'concurrent_fan_out');
    assert.equal(stillBlockedTask.metadata.workflowContinuationReplay.workflowShape, 'concurrent');
    assert.ok(
      stillBlockedCorePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_blocked'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.blockedReason === 'no_valid_targets'),
    );

    const secondReassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${verifierCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: verifierCat.defaultExecutionTarget.provider,
        instance: verifierCat.defaultExecutionTarget.instance,
        model: verifierCat.defaultExecutionTarget.model,
        modelSelection: verifierCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(secondReassignResponse.status, 200);
    assert.equal(runtimeClient.sentMessages.length, 3);
    assert.ok(runtimeClient.sentMessages.some((message) => /You are Followup-Agent/u.test(message.content)));
    assert.ok(runtimeClient.sentMessages.some((message) => /You are Verifier-Agent/u.test(message.content)));

    const coreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(coreResponse.status, 200);
    const corePayload = await coreResponse.json();
    const task = corePayload.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
    assert.ok(task);
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      corePayload.activities.some((activity) =>
        activity.taskId === `task-channel-${channelId}`
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.resultCount === 2),
    );
  }, chatStore);
});

test('startup-recovered continuation replay auto-resumes on server startup when targets remain active', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Reviewer-Agent')) {
        return usage('Reviewer-Agent completed the recovered converge review.');
      }
      return usage('Boss Cat acknowledged the retry.');
    },
  });
  const now = new Date('2026-03-26T16:30:00.000Z');
  let chat = createDefaultChatState();
  chat = seedChannel(
    chat,
    {
      title: 'Recovered converge review',
      topic: 'Retry a startup-recovered continuation through operator actions.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Reviewer-Agent',
          provider: 'gemini',
          roles: ['reviewer'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const seededChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(seededChannel);
  seededChannel.composerMode = 'solo';
  seededChannel.roomRouting = createDefaultRoomRoutingState({
    mode: 'boss_chat',
    defaultRecipientId: null,
  });
  const inlineAssignment = seededChannel.catAssignments[0];
  const reviewerAssignment = seededChannel.catAssignments[1];
  assert.ok(inlineAssignment);
  assert.ok(reviewerAssignment);
  chat = setChannelCatLease(
    chat,
    channelId,
    inlineAssignment.catId,
    {
      sessionId: 'session-inline',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = setChannelCatLease(
    chat,
    channelId,
    reviewerAssignment.catId,
    {
      sessionId: 'session-reviewer',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please hand this converge review to Reviewer-Agent.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const inlineParticipant = {
    participantKind: 'cat',
    participantId: inlineAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === inlineAssignment.catId)?.name
      ?? 'Inline-Agent',
  };
  const reviewerParticipant = {
    participantKind: 'cat',
    participantId: reviewerAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === reviewerAssignment.catId)?.name
      ?? 'Reviewer-Agent',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'converge_review',
    'converge',
  );
  activeTurn.id = 'turn-startup-recovered-retry';
  activeTurn.reviewRequired = true;
  activeTurn.convergeTargetId = reviewerParticipant.participantId;
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-startup-recovered-retry',
    dispatchId: 'dispatch-startup-recovered-retry',
    participant: reviewerParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Reviewer-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-startup-recovered-retry',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'target_pending',
      'running',
      'Reviewer-Agent is pending converge review.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [reviewerParticipant],
      {
        dispatchId: 'dispatch-startup-recovered-retry',
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          reviewRequired: true,
          continuationSource: 'workflow_recommendation',
          branchStrategy: 'transplant_context',
          mentionNames: ['Reviewer-Agent'],
          unresolvedTargets: [],
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'converge',
            reviewRequired: true,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantId: reviewerParticipant.participantId,
                participantName: reviewerParticipant.participantName,
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Recover the converge review through the existing retry seam.',
          },
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_single',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Converge review is waiting on Reviewer-Agent.',
    },
    resolvedTargets: [reviewerParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-startup-recovered-retry',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: reviewerParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Reviewer-Agent'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);

  await withServer(runtimeClient, async (baseUrl) => {
    const initialCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(initialCoreResponse.status, 200);
    const initialCorePayload = await initialCoreResponse.json();
    const taskId = `task-channel-${channelId}`;
    const task = initialCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(task);
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      initialCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'startup_recovered'),
    );
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.match(runtimeClient.sentMessages[0]?.content ?? '', /You are Reviewer-Agent/u);
    assert.ok(
      initialCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === null
        && activity.metadata?.resultCount === 1),
    );
  }, chatStore);
});

test('startup-recovered continuation replay auto-resumes when an active target regains its session', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Reviewer-Agent')) {
        return usage('Reviewer-Agent completed the recovered continuation after session recovery.');
      }
      return usage('Boss Cat acknowledged the retry.');
    },
  });
  const now = new Date('2026-03-26T16:40:00.000Z');
  let chat = createDefaultChatState();
  chat = seedChannel(
    chat,
    {
      title: 'Recovered continuation after session recovery',
      topic: 'Resume a startup-recovered continuation once the reviewer gets a fresh session.',
      repoPath: 'C:/repo/cats-platform',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Reviewer-Agent',
          provider: 'gemini',
          roles: ['reviewer'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const seededChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(seededChannel);
  seededChannel.status = 'active';
  const inlineAssignment = seededChannel.catAssignments[0];
  const reviewerAssignment = seededChannel.catAssignments[1];
  assert.ok(inlineAssignment);
  assert.ok(reviewerAssignment);
  chat = setChannelCatLease(
    chat,
    channelId,
    inlineAssignment.catId,
    {
      sessionId: 'session-inline',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please hand this converge review to Reviewer-Agent once the session is back.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const inlineParticipant = {
    participantKind: 'cat',
    participantId: inlineAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === inlineAssignment.catId)?.name
      ?? 'Inline-Agent',
  };
  const reviewerParticipant = {
    participantKind: 'cat',
    participantId: reviewerAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === reviewerAssignment.catId)?.name
      ?? 'Reviewer-Agent',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'converge_review',
    'converge',
  );
  activeTurn.id = 'turn-startup-recovered-session-recovery';
  activeTurn.reviewRequired = true;
  activeTurn.convergeTargetId = reviewerParticipant.participantId;
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-startup-recovered-session-recovery',
    dispatchId: 'dispatch-startup-recovered-session-recovery',
    participant: reviewerParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Reviewer-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-startup-recovered-session-recovery',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'target_pending',
      'running',
      'Reviewer-Agent is pending converge review.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [reviewerParticipant],
      {
        dispatchId: 'dispatch-startup-recovered-session-recovery',
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          reviewRequired: true,
          continuationSource: 'workflow_recommendation',
          branchStrategy: 'transplant_context',
          mentionNames: ['Reviewer-Agent'],
          unresolvedTargets: [],
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'converge',
            reviewRequired: true,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantId: reviewerParticipant.participantId,
                participantName: reviewerParticipant.participantName,
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Recover the converge review once the reviewer session is back.',
          },
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_single',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Converge review is waiting on Reviewer-Agent.',
    },
    resolvedTargets: [reviewerParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-startup-recovered-session-recovery',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: reviewerParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Reviewer-Agent'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const reviewerCat = chat.cats.find((cat) => cat.id === reviewerAssignment.catId);
  assert.ok(reviewerCat);

  await withServer(runtimeClient, async (baseUrl) => {
    const initialCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(initialCoreResponse.status, 200);
    const initialCorePayload = await initialCoreResponse.json();
    const taskId = `task-channel-${channelId}`;
    const task = initialCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(task);
    assert.ok(task.metadata.workflowContinuationReplay);
    assert.equal(runtimeClient.sentMessages.length, 0);

    const recoverResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${reviewerCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: reviewerCat.defaultExecutionTarget.provider,
        instance: reviewerCat.defaultExecutionTarget.instance,
        model: reviewerCat.defaultExecutionTarget.model,
        modelSelection: reviewerCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(recoverResponse.status, 200);
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.match(runtimeClient.sentMessages[0]?.content ?? '', /You are Reviewer-Agent/u);

    const finalCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(finalCoreResponse.status, 200);
    const finalCorePayload = await finalCoreResponse.json();
    const finalTask = finalCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(finalTask);
    assert.equal(finalTask.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      finalCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.resultCount === 1),
    );
  }, chatStore);
});

test('startup-recovered initial sequential latest handoff auto-resumes on server startup with source identity intact', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Agent-2')) {
        return usage('Agent-2 resumed the recovered startup handoff.');
      }
      if (content.includes('You are Agent-3')) {
        return usage('Agent-3 completed the recovered startup handoff.');
      }
      return usage('Boss Cat acknowledged the retry.');
    },
  });
  const now = new Date('2026-03-26T16:40:30.000Z');
  const responseAt = new Date('2026-03-26T16:40:45.000Z');
  let chat = createDefaultChatState();
  chat = seedChannel(
    chat,
    {
      title: 'Recovered startup latest handoff',
      topic: 'Resume the remaining audience from the latest assistant handoff during startup.',
      repoPath: 'C:/repo/cats-platform',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Agent-2',
          provider: 'gemini',
          roles: ['implementer'],
        },
        {
          name: 'Agent-3',
          provider: 'codex',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const seededChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(seededChannel);
  seededChannel.status = 'active';
  const firstAssignment = seededChannel.catAssignments[0];
  const secondAssignment = seededChannel.catAssignments[1];
  const thirdAssignment = seededChannel.catAssignments[2];
  assert.ok(firstAssignment);
  assert.ok(secondAssignment);
  assert.ok(thirdAssignment);
  chat = setChannelCatLease(
    chat,
    channelId,
    firstAssignment.catId,
    {
      sessionId: 'session-agent-1',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = setChannelCatLease(
    chat,
    channelId,
    secondAssignment.catId,
    {
      sessionId: 'session-agent-2',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = setChannelCatLease(
    chat,
    channelId,
    thirdAssignment.catId,
    {
      sessionId: 'session-agent-3',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'codex',
      model: 'gpt-5.4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Resume this startup sequential handoff from the latest assistant reply.',
    },
    now,
  ).state;

  const initialChannel = buildChannelView(chat, channelId);
  const sourceMessage = initialChannel.messages.at(-1);
  assert.ok(sourceMessage);
  const firstParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[0]?.catId ?? 'cat-agent-1',
    participantName: initialChannel.assignedCats[0]?.name ?? 'Agent-1',
  };
  const secondParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[1]?.catId ?? 'cat-agent-2',
    participantName: initialChannel.assignedCats[1]?.name ?? 'Agent-2',
  };
  const thirdParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[2]?.catId ?? 'cat-agent-3',
    participantName: initialChannel.assignedCats[2]?.name ?? 'Agent-3',
  };

  const appendedReply = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: 'Agent-1 handled the first step.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-api-startup-auto-resume',
        terminal: true,
        turnId: 'turn-api-startup-auto-resume',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        sourceMessageId: sourceMessage.id,
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  );
  chat = appendedReply.state;
  const handoffMessageId = appendedReply.message.id;

  const channel = buildChannelView(chat, channelId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-api-startup-auto-resume';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-api-startup-auto-resume',
    dispatchId: 'dispatch-api-startup-auto-resume',
    participant: firstParticipant,
    source: null,
    sourceMessageId: sourceMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'completed',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: responseAt.toISOString(),
    response: {
      assistantTurnId: 'assistant-turn-api-startup-auto-resume',
      messageIds: [handoffMessageId],
      fullText: 'Agent-1 handled the first step.',
      segmentCount: 1,
    },
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed the initial sequential audience.',
      now.toISOString(),
      null,
      sourceMessage.id,
      [firstParticipant, secondParticipant, thirdParticipant],
      {
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Initial sequential audience is ready to resume from the latest handoff during startup.',
    },
    resolvedTargets: [firstParticipant, secondParticipant, thirdParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-api-startup-auto-resume',
        sourceMessageId: sourceMessage.id,
        source: null,
        target: firstParticipant,
        trigger: 'explicit_mention',
        status: 'completed',
        mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
        response: {
          assistantTurnId: 'assistant-turn-api-startup-auto-resume',
          messageIds: [handoffMessageId],
          fullText: 'Agent-1 handled the first step.',
          segmentCount: 1,
        },
        startedAt: now.toISOString(),
        completedAt: responseAt.toISOString(),
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const taskId = `task-channel-${channelId}`;

  await withServer(runtimeClient, async (baseUrl) => {
    const initialCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(initialCoreResponse.status, 200);
    const initialCorePayload = await initialCoreResponse.json();
    const task = initialCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(task);
    assert.equal(task.metadata.workflowContinuationReplay, undefined);
    assert.equal(runtimeClient.sentMessages.length, 2);
    assert.match(runtimeClient.sentMessages[0]?.content ?? '', /You are Agent-2/u);
    assert.match(runtimeClient.sentMessages[1]?.content ?? '', /You are Agent-3/u);
    assert.ok(
      initialCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'startup_recovered'),
    );
    assert.ok(
      initialCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === null
        && activity.metadata?.resultCount === 2),
    );
  }, chatStore);
});

test('startup-recovered initial sequential latest handoff keeps source identity when a cat session recovers', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Agent-2')) {
        return usage('Agent-2 resumed the recovered latest handoff.');
      }
      if (content.includes('You are Agent-3')) {
        return usage('Agent-3 finished the recovered sequential follow-up.');
      }
      return usage('Boss Cat acknowledged the retry.');
    },
  });
  const now = new Date('2026-03-26T16:41:00.000Z');
  const responseAt = new Date('2026-03-26T16:41:15.000Z');
  let chat = createDefaultChatState();
  chat = seedChannel(
    chat,
    {
      title: 'Recovered latest handoff after session recovery',
      topic: 'Resume the remaining audience from the latest assistant handoff once Agent-2 is back.',
      repoPath: 'C:/repo/cats-platform',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Agent-2',
          provider: 'gemini',
          roles: ['implementer'],
        },
        {
          name: 'Agent-3',
          provider: 'codex',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const seededChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(seededChannel);
  seededChannel.status = 'active';
  const firstAssignment = seededChannel.catAssignments[0];
  const secondAssignment = seededChannel.catAssignments[1];
  const thirdAssignment = seededChannel.catAssignments[2];
  assert.ok(firstAssignment);
  assert.ok(secondAssignment);
  assert.ok(thirdAssignment);
  chat = setChannelCatLease(
    chat,
    channelId,
    firstAssignment.catId,
    {
      sessionId: 'session-agent-1',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = setChannelCatLease(
    chat,
    channelId,
    thirdAssignment.catId,
    {
      sessionId: 'session-agent-3',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'codex',
      model: 'gpt-5.4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Resume this remaining sequential audience from the latest handoff once Agent-2 returns.',
    },
    now,
  ).state;

  const initialChannel = buildChannelView(chat, channelId);
  const sourceMessage = initialChannel.messages.at(-1);
  assert.ok(sourceMessage);
  const firstParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[0]?.catId ?? 'cat-agent-1',
    participantName: initialChannel.assignedCats[0]?.name ?? 'Agent-1',
  };
  const secondParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[1]?.catId ?? 'cat-agent-2',
    participantName: initialChannel.assignedCats[1]?.name ?? 'Agent-2',
  };
  const thirdParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[2]?.catId ?? 'cat-agent-3',
    participantName: initialChannel.assignedCats[2]?.name ?? 'Agent-3',
  };

  const appendedReply = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: 'Agent-1 handled the first step.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-api-startup-latest-handoff',
        terminal: true,
        turnId: 'turn-api-startup-latest-handoff',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        sourceMessageId: sourceMessage.id,
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  );
  chat = appendedReply.state;
  const handoffMessageId = appendedReply.message.id;

  const channel = buildChannelView(chat, channelId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-api-startup-latest-handoff';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-api-startup-latest-handoff',
    dispatchId: 'dispatch-api-startup-latest-handoff',
    participant: firstParticipant,
    source: null,
    sourceMessageId: sourceMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'completed',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: responseAt.toISOString(),
    response: {
      assistantTurnId: 'assistant-turn-api-startup-latest-handoff',
      messageIds: [handoffMessageId],
      fullText: 'Agent-1 handled the first step.',
      segmentCount: 1,
    },
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed the initial sequential audience.',
      now.toISOString(),
      null,
      sourceMessage.id,
      [firstParticipant, secondParticipant, thirdParticipant],
      {
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Initial sequential audience is waiting for Agent-2 to recover before the remaining handoff resumes.',
    },
    resolvedTargets: [firstParticipant, secondParticipant, thirdParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-api-startup-latest-handoff',
        sourceMessageId: sourceMessage.id,
        source: null,
        target: firstParticipant,
        trigger: 'explicit_mention',
        status: 'completed',
        mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
        response: {
          assistantTurnId: 'assistant-turn-api-startup-latest-handoff',
          messageIds: [handoffMessageId],
          fullText: 'Agent-1 handled the first step.',
          segmentCount: 1,
        },
        startedAt: now.toISOString(),
        completedAt: responseAt.toISOString(),
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const secondCat = chat.cats.find((cat) => cat.id === secondAssignment.catId);
  assert.ok(secondCat);
  const taskId = `task-channel-${channelId}`;

  await withServer(runtimeClient, async (baseUrl) => {
    const initialCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(initialCoreResponse.status, 200);
    const initialCorePayload = await initialCoreResponse.json();
    const initialTask = initialCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(initialTask);
    assert.ok(initialTask.metadata.workflowContinuationReplay);
    assert.equal(initialTask.metadata.workflowContinuationReplay.sourceMessageId, handoffMessageId);
    assert.equal(initialTask.metadata.workflowContinuationReplay.sourceTurnId, activeTurn.id);
    assert.equal(
      initialTask.metadata.workflowContinuationReplay.sourceLaneId,
      buildChatLaneId(
        activeTurn.id,
        'target-state-api-startup-latest-handoff',
        firstParticipant.participantId,
      ),
    );
    assert.equal(
      initialTask.metadata.workflowContinuationReplay.sourceAssistantTurnId,
      'assistant-turn-api-startup-latest-handoff',
    );
    assert.equal(initialTask.metadata.workflowContinuationReplay.sourceParticipant.participantName, 'Agent-1');
    assert.deepEqual(
      initialTask.metadata.workflowContinuationReplay.targets.map((target) => target.participantName),
      ['Agent-2', 'Agent-3'],
    );
    assert.equal(runtimeClient.sentMessages.length, 0);
    assert.ok(
      initialCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'startup_recovered'),
    );

    const recoverResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${secondCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: secondCat.defaultExecutionTarget.provider,
        instance: secondCat.defaultExecutionTarget.instance,
        model: secondCat.defaultExecutionTarget.model,
        modelSelection: secondCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(recoverResponse.status, 200);

    await waitFor(async () => {
      assert.equal(runtimeClient.sentMessages.length, 2);
      assert.match(runtimeClient.sentMessages[0]?.content ?? '', /You are Agent-2/u);
      assert.match(runtimeClient.sentMessages[1]?.content ?? '', /You are Agent-3/u);
    });

    const finalCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(finalCoreResponse.status, 200);
    const finalCorePayload = await finalCoreResponse.json();
    const finalTask = finalCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(finalTask);
    assert.equal(finalTask.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      finalCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.resultCount === 2),
    );
  }, chatStore);
});

test('startup-recovered continuation replay auto-resumes when channel activation restores the orchestrator session', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ sessionId }) => usage(`Orchestrator recovered the stored continuation on ${sessionId}.`),
  });
  const now = new Date('2026-03-26T16:42:00.000Z');
  let chat = createDefaultChatState();
  chat = seedChannel(
    chat,
    {
      title: 'Recovered orchestrator continuation',
      topic: 'Resume a startup-recovered continuation once channel activation restores Boss Cat.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const seededChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(seededChannel);
  const inlineAssignment = seededChannel.catAssignments[0];
  assert.ok(inlineAssignment);
  chat = setChannelCatLease(
    chat,
    channelId,
    inlineAssignment.catId,
    {
      sessionId: 'session-inline',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please bounce this back to Boss Cat once activation restores the session.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const inlineParticipant = {
    participantKind: 'cat',
    participantId: inlineAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === inlineAssignment.catId)?.name
      ?? 'Inline-Agent',
  };
  const orchestratorParticipant = {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: 'Orchestrator',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'converge_review',
    'converge',
  );
  activeTurn.id = 'turn-startup-recovered-orchestrator-session';
  activeTurn.reviewRequired = true;
  activeTurn.convergeTargetId = orchestratorParticipant.participantId;
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-startup-recovered-orchestrator-session',
    dispatchId: 'dispatch-startup-recovered-orchestrator-session',
    participant: orchestratorParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Orchestrator'],
    depth: 1,
    parentCheckpointId: 'checkpoint-startup-recovered-orchestrator-session',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'target_pending',
      'running',
      'Boss Cat is pending the recovered converge review.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [orchestratorParticipant],
      {
        dispatchId: 'dispatch-startup-recovered-orchestrator-session',
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          reviewRequired: true,
          continuationSource: 'workflow_recommendation',
          branchStrategy: 'transplant_context',
          mentionNames: ['Orchestrator'],
          unresolvedTargets: [],
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'converge',
            reviewRequired: true,
            candidateTargets: [
              {
                participantKind: 'orchestrator',
                participantId: 'orchestrator',
                participantName: 'Orchestrator',
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Replay this converge review through Boss Cat once channel activation restores the session.',
          },
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_single',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Converge review is waiting for Boss Cat session recovery.',
    },
    resolvedTargets: [orchestratorParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-startup-recovered-orchestrator-session',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: orchestratorParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Orchestrator'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const taskId = `task-channel-${channelId}`;

  await withServer(runtimeClient, async (baseUrl) => {
    const initialCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(initialCoreResponse.status, 200);
    const initialCorePayload = await initialCoreResponse.json();
    const initialTask = initialCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(initialTask);
    assert.ok(initialTask.metadata.workflowContinuationReplay);
    assert.equal(runtimeClient.sentMessages.length, 0);
    assert.ok(
      initialCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'startup_recovered'),
    );

    const activationResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activationResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.equal(runtimeClient.sentMessages[0]?.sessionId, runtimeClient.createdSessions[0]?.id);

    const finalCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(finalCoreResponse.status, 200);
    const finalCorePayload = await finalCoreResponse.json();
    const finalTask = finalCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(finalTask);
    assert.equal(finalTask.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      finalCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.resultCount === 1),
    );
  }, chatStore);
});

test('startup-recovered parallel continuation replay waits for every concrete target to recover before auto-resuming', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessage: ({ content }) => {
      if (content.includes('You are Followup-Agent')) {
        return usage('Followup-Agent completed the recovered parallel continuation.');
      }
      if (content.includes('You are Verifier-Agent')) {
        return usage('Verifier-Agent completed the recovered parallel continuation.');
      }
      return usage('Boss Cat acknowledged the retry.');
    },
  });
  const now = new Date('2026-03-26T16:45:00.000Z');
  let chat = createDefaultChatState();
  chat = seedChannel(
    chat,
    {
      title: 'Recovered parallel continuation',
      topic: 'Wait for every preserved parallel target to return before replay.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Followup-Agent',
          provider: 'gemini',
          roles: ['auditor'],
        },
        {
          name: 'Verifier-Agent',
          provider: 'gemini',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please fan this back out after both specialists recover.',
    },
    now,
  ).state;
  const seededChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(seededChannel);
  const inlineAssignment = seededChannel.catAssignments[0];
  const followupAssignment = seededChannel.catAssignments[1];
  const verifierAssignment = seededChannel.catAssignments[2];
  assert.ok(inlineAssignment);
  assert.ok(followupAssignment);
  assert.ok(verifierAssignment);
  followupAssignment.status = 'removed';
  followupAssignment.leftAt = '2026-03-26T16:44:00.000Z';
  verifierAssignment.status = 'removed';
  verifierAssignment.leftAt = '2026-03-26T16:44:00.000Z';

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const inlineParticipant = {
    participantKind: 'cat',
    participantId: inlineAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === inlineAssignment.catId)?.name
      ?? 'Inline-Agent',
  };
  const followupParticipant = {
    participantKind: 'cat',
    participantId: followupAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === followupAssignment.catId)?.name
      ?? 'Followup-Agent',
  };
  const verifierParticipant = {
    participantKind: 'cat',
    participantId: verifierAssignment.catId,
    participantName: channel.assignedCats.find((candidate) => candidate.catId === verifierAssignment.catId)?.name
      ?? 'Verifier-Agent',
  };
  const followupCat = chat.cats.find((cat) => cat.id === followupAssignment.catId);
  const verifierCat = chat.cats.find((cat) => cat.id === verifierAssignment.catId);
  assert.ok(followupCat);
  assert.ok(verifierCat);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'concurrent_fan_out',
    'concurrent',
  );
  activeTurn.id = 'turn-startup-recovered-parallel';
  activeTurn.dispatchCount = 2;
  activeTurn.targetStatuses.push({
    id: 'target-state-startup-recovered-parallel-followup',
    dispatchId: 'dispatch-startup-recovered-parallel-followup',
    participant: followupParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Followup-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-startup-recovered-parallel',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  activeTurn.targetStatuses.push({
    id: 'target-state-startup-recovered-parallel-verifier',
    dispatchId: 'dispatch-startup-recovered-parallel-verifier',
    participant: verifierParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Verifier-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-startup-recovered-parallel',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'target_pending',
      'running',
      'Parallel continuation is pending both recovered specialists.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [followupParticipant, verifierParticipant],
      {
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          reviewRequired: false,
          continuationSource: 'workflow_recommendation',
          branchStrategy: 'transplant_context',
          mentionNames: ['Followup-Agent', 'Verifier-Agent'],
          unresolvedTargets: [],
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'concurrent',
            reviewRequired: false,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantId: followupAssignment.catId,
                participantName: followupCat.name,
              },
              {
                participantKind: 'cat',
                participantId: verifierAssignment.catId,
                participantName: verifierCat.name,
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Replay only after every preserved specialist target is available again.',
          },
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Parallel continuation is waiting on both preserved specialists.',
    },
    resolvedTargets: [followupParticipant, verifierParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-startup-recovered-parallel-followup',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: followupParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Followup-Agent'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
      {
        id: 'dispatch-startup-recovered-parallel-verifier',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: verifierParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Verifier-Agent'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 2,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);
  const updatedChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(updatedChannel);
  updatedChannel.catAssignments[1].status = 'removed';
  updatedChannel.catAssignments[1].leftAt = '2026-03-26T16:44:00.000Z';
  updatedChannel.catAssignments[2].status = 'removed';
  updatedChannel.catAssignments[2].leftAt = '2026-03-26T16:44:00.000Z';

  const chatStore = new MemoryChatStore(chat);
  const taskId = `task-channel-${channelId}`;

  await withServer(runtimeClient, async (baseUrl) => {
    const initialCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(initialCoreResponse.status, 200);
    const initialCorePayload = await initialCoreResponse.json();
    const initialTask = initialCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(initialTask);
    assert.ok(initialTask.metadata.workflowContinuationReplay);
    assert.equal(runtimeClient.sentMessages.length, 0);

    const firstReassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${followupCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: followupCat.defaultExecutionTarget.provider,
        instance: followupCat.defaultExecutionTarget.instance,
        model: followupCat.defaultExecutionTarget.model,
        modelSelection: followupCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(firstReassignResponse.status, 200);
    assert.equal(runtimeClient.sentMessages.length, 0);

    const blockedCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(blockedCoreResponse.status, 200);
    const blockedCorePayload = await blockedCoreResponse.json();
    const blockedTask = blockedCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(blockedTask);
    assert.ok(blockedTask.metadata.workflowContinuationReplay);
    assert.equal(blockedTask.metadata.workflowContinuationReplay.workflowShape, 'concurrent');
    assert.equal(blockedTask.metadata.workflowContinuationReplay.blockedReason, 'no_valid_targets');
    assert.deepEqual(
      blockedTask.metadata.workflowContinuationReplay.unresolvedTargets,
      ['Verifier-Agent'],
    );
    assert.ok(
      blockedCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_blocked'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.blockedReason === 'no_valid_targets'),
    );

    const secondReassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${verifierCat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: verifierCat.defaultExecutionTarget.provider,
        instance: verifierCat.defaultExecutionTarget.instance,
        model: verifierCat.defaultExecutionTarget.model,
        modelSelection: verifierCat.defaultModelSelection ?? null,
      }),
    });
    assert.equal(secondReassignResponse.status, 200);
    assert.equal(runtimeClient.sentMessages.length, 2);
    assert.ok(runtimeClient.sentMessages.some((message) => /You are Followup-Agent/u.test(message.content)));
    assert.ok(runtimeClient.sentMessages.some((message) => /You are Verifier-Agent/u.test(message.content)));

    const finalCoreResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(finalCoreResponse.status, 200);
    const finalCorePayload = await finalCoreResponse.json();
    const finalTask = finalCorePayload.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(finalTask);
    assert.equal(finalTask.metadata.workflowContinuationReplay, undefined);
    assert.ok(
      finalCorePayload.activities.some((activity) =>
        activity.taskId === taskId
        && activity.metadata?.source === 'workflow-continuation-replay'
        && activity.metadata?.replayPhase === 'replay_dispatched'
        && activity.metadata?.resumeReason === 'target_recovered'
        && activity.metadata?.resultCount === 2),
    );
  }, chatStore);
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
