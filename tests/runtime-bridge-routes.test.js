import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { WORK_PROJECT_CREATE_TOOL } from '../build/server/products/work/shared/workToolSurface.js';
import {
  createAuthenticatedTestSession,
  createTestAuthConfig,
  installAuthenticatedFetch,
} from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  auth: createTestAuthConfig(),
};

function createRuntimeStub() {
  return {
    mcpCalls: [],
    observedSessions: new Map(),
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
      const sessionId = 'session-created';
      return {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
    },
    async sendMessage() {
      return {
        segments: [{ kind: 'text', text: 'runtime-stub', toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async observeSession(sessionId) {
      const session = this.observedSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      return session;
    },
    async callMcp(request) {
      this.mcpCalls.push(request);
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          echoed: request.method ?? null,
        },
      };
    },
    async closeSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const now = new Date('2026-03-23T18:00:00.000Z');
  const tempStateDir = await mkdtemp(path.join(tmpdir(), 'cats-runtime-bridge-'));
  const auth = await createAuthenticatedTestSession({
    now,
    sessionSecret: baseConfig.auth.sessionSecret,
    sessionTtlMs: baseConfig.auth.sessionTtlMs,
  });
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
      },
      runtimeClient,
      authStore: auth.authStore,
      now: () => now,
    },
    chat: {
      chatStore,
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const restoreFetch = installAuthenticatedFetch(baseUrl, auth, {
    origin: 'http://127.0.0.1:8181',
  });
  try {
    await callback(baseUrl);
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('runtime bridge flushes cats-owned memory when runtime inspection advertises a pending memory_flush hook', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Bridge Cat',
        provider: 'claude',
        roles: ['companion'],
        skillProfile: 'companion',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const { cat } = await createCatResponse.json();

    const ingestResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'note',
        storageMode: 'uploaded_copy',
        title: 'Bedtime routine',
        textContent: 'Bridge Cat settles down only after the room lights dim.',
      }),
    });
    assert.equal(ingestResponse.status, 201);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Bridge Thread',
        topic: 'Exercise runtime maintenance bridges.',
        originSurface: 'chat',
        roomMode: 'chat_channel',
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const { channel } = await createChannelResponse.json();

    runtimeClient.observedSessions.set('session-bridge', {
      session: {
        id: 'session-bridge',
        context: {
          metadata: {
            channelId: channel.id,
            targetKind: 'cat',
            targetId: cat.id,
            companionSession: {
              catId: cat.id,
              channelContext: {
                channelId: channel.id,
              },
            },
          },
        },
        inspection: {
          maintenance: {
            hooks: {
              preReset: {
                available: true,
                pending: [
                  {
                    id: 'memory_flush',
                    phase: 'pre_reset',
                    status: 'pending',
                    owner: 'product_memory',
                    reason: 'Flush durable memory before reset.',
                  },
                ],
              },
              preCompaction: {
                available: true,
                pending: [],
              },
            },
          },
        },
      },
      observePath: '/sessions/session-bridge/observe',
    });

    const observeResponse = await fetch(`${baseUrl}/api/runtime/sessions/session-bridge/observe`);
    assert.equal(observeResponse.status, 200);
    const observePayload = await observeResponse.json();
    assert.equal(observePayload.session.id, 'session-bridge');

    const flushResponse = await fetch(`${baseUrl}/api/runtime/sessions/session-bridge/memory-flush`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase: 'pre_reset' }),
    });
    assert.equal(flushResponse.status, 200);
    const flushPayload = await flushResponse.json();
    assert.equal(flushPayload.executed, true);
    assert.equal(flushPayload.phase, 'pre_reset');
    assert.ok(flushPayload.summary);
    assert.equal(flushPayload.summary.flushCount, 2);
    assert.ok(flushPayload.summary.persistedCount > 0);
    assert.deepEqual(
      flushPayload.summary.subjects.map((subject) => subject.kind).sort(),
      ['cat', 'channel'],
    );
    assert.deepEqual(
      flushPayload.flushes.map((flush) => flush.scope).sort(),
      ['cat', 'channel'],
    );
    assert.ok(
      flushPayload.flushes.some((flush) => flush.scope === 'cat' && flush.persistedCount > 0),
    );
    assert.ok(
      flushPayload.flushes.every((flush) =>
        flush.payload
        && flush.payload.version === 1
        && Array.isArray(flush.payload.persistedRecords),
      ),
    );
    const core = await chatStore.readCore();
    const activity = core.activities.find((candidate) =>
      candidate.metadata?.category === 'memory_maintenance'
      && candidate.metadata?.trigger === 'runtime_hook'
      && candidate.metadata?.status === 'executed');
    assert.ok(activity);
    assert.equal(activity?.conversationId, `conversation-channel-${channel.id}`);
    assert.equal(activity?.metadata?.summary?.flushCount, 2);
  }, chatStore);
});

test('runtime bridge proxies MCP JSON-RPC calls to cats-runtime', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const request = {
      jsonrpc: '2.0',
      id: 'mcp-1',
      method: 'tools/list',
    };
    const response = await fetch(`${baseUrl}/api/runtime/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.jsonrpc, '2.0');
    assert.equal(payload.id, 'mcp-1');
    assert.equal(payload.result.echoed, 'tools/list');
    assert.deepEqual(runtimeClient.mcpCalls, [request]);
  });
});

test('runtime bridge blocks product-owned Work MCP tool calls before runtime proxy', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const request = {
      jsonrpc: '2.0',
      id: 'work-mcp-1',
      method: 'tools/call',
      params: {
        name: WORK_PROJECT_CREATE_TOOL,
        arguments: {
          title: 'Blocked Runtime MCP Project',
        },
      },
    };

    const response = await fetch(`${baseUrl}/api/runtime/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.jsonrpc, '2.0');
    assert.equal(payload.id, 'work-mcp-1');
    assert.equal(payload.error.code, -32601);
    assert.equal(
      payload.error.data.code,
      'product_work_tool_not_executable_via_runtime_mcp',
    );
    assert.equal(payload.error.data.toolName, WORK_PROJECT_CREATE_TOOL);
    assert.equal(payload.error.data.boundary, 'cats_work_supervised_tool_boundary');
    assert.deepEqual(runtimeClient.mcpCalls, []);
  });
});
