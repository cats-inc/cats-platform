import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import {
  inspectOriginSurfaceCompatibilityTelemetry,
  resetOriginSurfaceCompatibilityTelemetry,
} from '../build/server/products/chat/api/originSurfaceCompatibilityTelemetry.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
};

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: baseConfig.runtimeBaseUrl,
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
      throw new Error('createSession should not run during create-only route tests.');
    },
    async sendMessage() {
      throw new Error('sendMessage should not run during create-only route tests.');
    },
    async closeSession() {},
    async observeSession() {
      return null;
    },
    async streamSession() {},
  };
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-origin-surface-compat-'));
  const chatStore = new MemoryChatStore();
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    },
    chat: { chatStore },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`, chatStore);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('POST /api/channels keeps legacy raw create requests compatible by defaulting missing originSurface to chat', async () => {
  resetOriginSurfaceCompatibilityTelemetry();
  await withServer(async (baseUrl, chatStore) => {
    const response = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Legacy chat create',
        topic: 'No origin surface field yet.',
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.channel.originSurface, 'chat');

    const persisted = await chatStore.read();
    assert.equal(persisted.channels[0]?.originSurface, 'chat');

    assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
      fallbackCount: 1,
      fallbackTargetCounts: {
        channel: 1,
      },
      latestFallback: {
        targetNoun: 'channel',
        resolvedSurface: 'chat',
      },
    });
  });
});

test('POST /api/channels preserves explicit non-chat originSurface values without recording a compatibility fallback', async () => {
  resetOriginSurfaceCompatibilityTelemetry();
  await withServer(async (baseUrl, chatStore) => {
    const response = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Work-owned chat create',
        topic: 'This should keep its owning surface.',
        originSurface: 'work',
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.channel.originSurface, 'work');

    const persisted = await chatStore.read();
    assert.equal(persisted.channels[0]?.originSurface, 'work');
    assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
      fallbackCount: 0,
      fallbackTargetCounts: {},
      latestFallback: null,
    });
  });
});

test('POST /api/channels rejects invalid originSurface values instead of silently coercing them to chat', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const response = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Invalid surface create',
        topic: 'This should fail.',
        originSurface: 'bogus',
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, 'invalid_origin_surface');
    assert.match(payload.error.message, /must be one of: chat, work, code/u);

    const persisted = await chatStore.read();
    assert.equal(persisted.channels.length, 0);
  });
});

test('POST /api/concurrent-groups keeps legacy raw create requests compatible by defaulting missing originSurface to chat', async () => {
  resetOriginSurfaceCompatibilityTelemetry();
  await withServer(async (baseUrl, chatStore) => {
    const response = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Legacy compare create',
        targets: [
          { provider: 'claude', instance: null, model: 'claude-default' },
          { provider: 'codex', instance: null, model: 'gpt-5.4' },
        ],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.group.originSurface, 'chat');

    const persisted = await chatStore.read();
    const group = persisted.parallelChatGroups[0];
    assert.equal(group?.originSurface, 'chat');
    assert.ok(group);
    assert.deepEqual(
      group.memberChannelIds.map((channelId) =>
        persisted.channels.find((channel) => channel.id === channelId)?.originSurface ?? null),
      ['chat', 'chat'],
    );

    assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
      fallbackCount: 1,
      fallbackTargetCounts: {
        parallel_group: 1,
      },
      latestFallback: {
        targetNoun: 'parallel_group',
        resolvedSurface: 'chat',
      },
    });
  });
});

test('POST /api/concurrent-groups preserves explicit non-chat originSurface values without recording a compatibility fallback', async () => {
  resetOriginSurfaceCompatibilityTelemetry();
  await withServer(async (baseUrl, chatStore) => {
    const response = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Code-owned compare create',
        originSurface: 'code',
        targets: [
          { provider: 'claude', instance: null, model: 'claude-default' },
          { provider: 'codex', instance: null, model: 'gpt-5.4' },
        ],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.group.originSurface, 'code');

    const persisted = await chatStore.read();
    const group = persisted.parallelChatGroups[0];
    assert.equal(group?.originSurface, 'code');
    assert.ok(group);
    assert.deepEqual(
      group.memberChannelIds.map((channelId) =>
        persisted.channels.find((channel) => channel.id === channelId)?.originSurface ?? null),
      ['code', 'code'],
    );
    assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
      fallbackCount: 0,
      fallbackTargetCounts: {},
      latestFallback: null,
    });
  });
});

test('POST /api/concurrent-groups rejects invalid originSurface values instead of silently coercing them to chat', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const response = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Invalid compare create',
        originSurface: 'bogus',
        targets: [
          { provider: 'claude', instance: null, model: 'claude-default' },
          { provider: 'codex', instance: null, model: 'gpt-5.4' },
        ],
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, 'invalid_origin_surface');
    assert.match(payload.error.message, /must be one of: chat, work, code/u);

    const persisted = await chatStore.read();
    assert.equal(persisted.parallelChatGroups.length, 0);
    assert.equal(persisted.channels.length, 0);
  });
});
