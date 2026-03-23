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

function createRuntimeStub() {
  let nextSession = 1;
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
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: content.includes('Inline-Agent')
          ? 'Inline-Agent completed the review handoff.'
          : 'Boss Cat acknowledged the turn.',
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    chatStore,
    now: () => new Date('2026-03-23T00:00:00.000Z'),
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

async function createChannel(baseUrl) {
  const response = await fetch(`${baseUrl}/api/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Orchestrator Lab',
      topic: 'Validate contract-first orchestration seams.',
      roomMode: 'boss_chat',
      cats: [
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
    assert.equal(payload.plan.routing.initialTargets.length, 1);
    assert.equal(payload.plan.routing.initialTargets[0].targetName, 'Inline-Agent');
    assert.equal(payload.plan.executionLoop.dispatchBoundary, 'direct_runtime_api');
    assert.equal(payload.plan.executionLoop.supportsReplan, true);
    assert.deepEqual(
      payload.plan.routing.initialTargets[0].toolIntent.allowedTools,
      ['runtime_summary', 'list_sessions', 'observe_session'],
    );
    assert.ok(Array.isArray(payload.plan.routing.initialTargets[0].runtimeSkills.requestedSkills));
    assert.equal(payload.plan.routing.initialTargets[0].runtimeSkills.requestedSkills[0], 'companion');
  });
});

test('POST /api/orchestrator/dispatch reuses runtime routing and returns execution-loop snapshot', async () => {
  const runtimeClient = createRuntimeStub();
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
    assert.equal(payload.dispatch.channelId, channelId);
    assert.ok(payload.dispatch.sourceMessageId);
    assert.equal(payload.dispatch.results.length, 1);
    assert.equal(payload.dispatch.results[0].targetName, 'Inline-Agent');
    assert.equal(payload.operator.approvalsPath, '/api/core/approvals');
    assert.equal(payload.operator.operatorActionsPath, '/api/core/operator-actions');
    assert.equal(payload.executionLoop.channelId, channelId);
    assert.equal(payload.executionLoop.operator.channelId, channelId);
    assert.ok(runtimeClient.sentMessages.length >= 1);
  });
});

test('GET /api/orchestrator/channels/:id/execution-loop returns operator and run-inspector payloads', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const created = await createChannel(baseUrl);
    const channelId = created.channel.id;

    const dispatchResponse = await fetch(`${baseUrl}/api/orchestrator/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        body: 'Ask @Inline-Agent for a quick review',
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
    assert.equal(payload.operator.executionLoopPath, `/api/orchestrator/channels/${channelId}/execution-loop`);
  });
});
