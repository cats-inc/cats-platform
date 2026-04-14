import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import {
  addDurableMemory,
  createDefaultCoreState,
  upsertCoreProject,
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

  core = upsertCoreProject(
    core,
    {
      id: 'project-1',
      title: 'Project one',
      status: 'active',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-15T05:50:00.000Z',
    },
    new Date('2026-04-15T05:50:00.000Z'),
  ).core;

  core = addDurableMemory(core, {
    id: 'memory-1',
    subjectType: 'project',
    subjectId: 'project-1',
    category: 'policy',
    content: 'Primary project memory',
    confidence: 0.9,
    sourceRefs: ['source-1'],
    createdAt: '2026-04-15T05:51:00.000Z',
    updatedAt: '2026-04-15T05:51:00.000Z',
  });

  core = addDurableMemory(core, {
    id: 'memory-2',
    subjectType: 'project',
    subjectId: 'project-1',
    category: 'fact',
    content: 'Secondary project memory',
    confidence: 0.4,
    sourceRefs: ['source-2'],
    createdAt: '2026-04-15T05:52:00.000Z',
    updatedAt: '2026-04-15T05:52:00.000Z',
  });

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-memory-filter-'));
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
      now: () => new Date('2026-04-15T05:50:00.000Z'),
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

test('core memory routes support filtered scoped memory queries', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/core/projects/project-1/memory?category=policy&sourceRef=source-1&minConfidence=0.8&maxConfidence=1&limit=1`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].id, 'memory-1');
  });
});

test('core memory routes reject invalid scoped memory filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const categoryResponse = await fetch(
      `${baseUrl}/api/core/projects/project-1/memory?category=unknown`,
    );
    assert.equal(categoryResponse.status, 400);
    const categoryPayload = await categoryResponse.json();
    assert.equal(categoryPayload.error.code, 'invalid_category');

    const confidenceResponse = await fetch(
      `${baseUrl}/api/core/projects/project-1/memory?minConfidence=high`,
    );
    assert.equal(confidenceResponse.status, 400);
    const confidencePayload = await confidenceResponse.json();
    assert.equal(confidencePayload.error.code, 'invalid_query_number');
  });
});
