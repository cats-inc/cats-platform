import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import {
  appendCoreTrace,
  createDefaultCoreState,
  upsertCoreRun,
} from '../build/server/core/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  return {
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
    async createSession() {
      return {
        id: 'session-stub',
        provider: 'claude',
        model: 'claude-default',
        status: 'ready',
        cwd: path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', 'session-stub'),
      };
    },
    async sendMessage() {
      return {
        segments: [{ kind: 'text', text: 'stub', toolName: null, toolId: null }],
        inputTokens: 0,
        outputTokens: 0,
        tokensUsed: 0,
      };
    },
    async closeSession() {},
    async deleteSession() {
      return { action: 'delete', sessionId: 'session-stub', status: 'deleted' };
    },
  };
}

function createCoreState() {
  let core = createDefaultCoreState();

  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Primary run',
      status: 'running',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      orchestratorActorId: 'actor-owner',
      traceId: 'trace-1',
      createdAt: '2026-04-15T04:50:00.000Z',
      startedAt: '2026-04-15T04:50:00.000Z',
    },
    new Date('2026-04-15T04:50:00.000Z'),
  ).core;

  core = appendCoreTrace(
    core,
    {
      id: 'trace-record-1',
      traceId: 'trace-1',
      kind: 'dispatch',
      conversationId: 'conversation-1',
      runId: 'run-1',
      taskId: 'task-1',
      actorId: 'actor-owner',
      message: 'dispatch',
      createdAt: '2026-04-15T04:51:00.000Z',
    },
    new Date('2026-04-15T04:51:00.000Z'),
  ).core;

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-execution-'));
  const core = createCoreState();
  const chatStore = new MemoryChatStore();
  const sharedCoreStore = new MemoryCoreStore(core);
  await chatStore.writeCore(core);
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-04-15T04:50:00.000Z'),
      coreStore: sharedCoreStore,
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

  try {
    await sharedCoreStore.writeCore(core);
    await chatStore.writeCore(core);
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('core execution routes support filtered run and trace queries', async () => {
  await withServer(async (baseUrl) => {
    const runResponse = await fetch(
      `${baseUrl}/api/core/runs?status=running&conversationId=conversation-1&taskId=task-1&orchestratorActorId=actor-owner&traceId=trace-1`,
    );
    assert.equal(runResponse.status, 200);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.runs.length, 1);
    assert.equal(runPayload.runs[0].id, 'run-1');

    const traceResponse = await fetch(
      `${baseUrl}/api/core/traces?kind=dispatch&conversationId=conversation-1&runId=run-1&taskId=task-1&actorId=actor-owner&traceId=trace-1`,
    );
    assert.equal(traceResponse.status, 200);
    const tracePayload = await traceResponse.json();
    assert.equal(tracePayload.traces.length, 1);
    assert.equal(tracePayload.traces[0].id, 'trace-record-1');
  });
});

test('core execution routes reject invalid run and trace filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const runResponse = await fetch(`${baseUrl}/api/core/runs?status=paused`);
    assert.equal(runResponse.status, 400);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.error.code, 'bad_request');
    assert.match(runPayload.error.message, /status must be one of/i);

    const traceResponse = await fetch(`${baseUrl}/api/core/traces?kind=update`);
    assert.equal(traceResponse.status, 400);
    const tracePayload = await traceResponse.json();
    assert.equal(tracePayload.error.code, 'bad_request');
    assert.match(tracePayload.error.message, /kind must be one of/i);
  });
});
