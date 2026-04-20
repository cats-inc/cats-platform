import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../src/app/server/index.ts';
import {
  RuntimeRequestError,
  type RuntimeClient,
  type RuntimeDeleteSessionResult,
} from '../src/runtime/client.ts';
import type { RuntimeSetupReadModel } from '../src/runtime/setup.ts';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  setChannelCatLease,
} from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  debugLiveTrace: false,
  debugKeepRuntimeSessionsOnProductDelete: false,
};

function createRuntimeStub(options: {
  deleteResults?: Map<string, RuntimeDeleteSessionResult>;
  deleteErrors?: Map<string, Error>;
} = {}): RuntimeClient {
  const {
    deleteResults = new Map(),
    deleteErrors = new Map(),
  } = options;

  return {
    async getHealth() {
      return {
        baseUrl: baseConfig.runtimeBaseUrl,
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getSetupState(): Promise<RuntimeSetupReadModel> {
      return {
        bootstrapRequired: false,
        state: {
          status: 'ready',
          lastScanAt: null,
          lastManualScanAt: null,
          appliedAt: null,
          appliedConfigPath: null,
          error: null,
        },
        repair: {
          status: 'ready',
          summary: 'Cats Runtime is ready.',
          preferredScan: {
            source: 'none',
            scannedAt: null,
            providerCount: 0,
            availableCount: 0,
            unavailableCount: 0,
            remediationCount: 0,
          },
          providersReadyToApply: [],
          providersNeedingAttention: [],
        },
      };
    },
    async getProviderConfig() { return {}; },
    async getProviderDiagnostics() { return { probe: 'light', providers: [] }; },
    async getProviderModels(provider: string) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider: string) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        entries: [],
        presets: [],
        controls: [],
        defaultSelection: null,
        support: {
          tier: 'full',
          notes: [],
        },
        warnings: [],
      };
    },
    async createSession() {
      throw new Error('createSession should not be called in product delete tests');
    },
    async sendMessage() {
      throw new Error('sendMessage should not be called in product delete tests');
    },
    async observeSession() { return null; },
    async streamSession() {},
    async createWakeup() {
      throw new Error('createWakeup should not be called in product delete tests');
    },
    async callMcp() { return null; },
    async cancelSession() {},
    async closeSession() {},
    async deleteSession(sessionId: string) {
      if (deleteErrors.has(sessionId)) {
        throw deleteErrors.get(sessionId);
      }
      return deleteResults.get(sessionId) ?? {
        action: 'delete',
        sessionId,
        status: 'deleted' as const,
      };
    },
  };
}

async function withServer(
  runtimeClient: ReturnType<typeof createRuntimeStub>,
  callback: (baseUrl: string, chatStore: MemoryChatStore) => Promise<void>,
  chatStore = new MemoryChatStore(),
) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-delete-cleanup-source-'));
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        runtimeStaleSessionRetryLimit: 0,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
        desktopHostStatePath: path.join(tempStateDir, 'desktop', 'state.json'),
        desktopDir: path.join(tempStateDir, 'desktop'),
        runtimeDir: path.join(tempStateDir, 'runtime'),
        platformDir: path.join(tempStateDir, 'platform'),
        platformStateDir: path.join(tempStateDir, 'platform', 'state'),
        platformConfigDir: path.join(tempStateDir, 'platform', 'config'),
        maxBossCats: 1,
        maxCats: 5,
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
        maxParallelChats: 3,
      },
      runtimeClient,
      now: () => new Date('2026-04-21T12:00:00.000Z'),
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

async function seedChannelWithSession(chatStore: MemoryChatStore, sessionId: string): Promise<string> {
  const now = new Date('2026-04-21T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'Delete Cat', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Delete Me',
    topic: 'cleanup',
    originSurface: 'chat',
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId,
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);
  return channelId;
}

test('DELETE /api/channels/:id no longer fails on retained runtime deletes', async () => {
  const runtime = createRuntimeStub({
    deleteResults: new Map([
      ['session-retained-channel', {
        action: 'delete',
        sessionId: 'session-retained-channel',
        status: 'retained',
        reason: 'Session files were kept for retry.',
      }],
    ]),
  });
  const chatStore = new MemoryChatStore();
  const channelId = await seedChannelWithSession(chatStore, 'session-retained-channel');

  await withServer(runtime, async (baseUrl, store) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deleted, true);

    const persisted = await store.read();
    assert.equal(persisted.channels.some((channel) => channel.id === channelId), false);
  }, chatStore);
});

test('DELETE /api/channels/:id still fails on real runtime delete errors', async () => {
  const runtime = createRuntimeStub({
    deleteErrors: new Map([
      ['session-delete-error', new RuntimeRequestError('Runtime delete failed', 500)],
    ]),
  });
  const chatStore = new MemoryChatStore();
  const channelId = await seedChannelWithSession(chatStore, 'session-delete-error');

  await withServer(runtime, async (baseUrl, store) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.error.code, 'runtime_session_delete_failed');

    const persisted = await store.read();
    assert.equal(persisted.channels.some((channel) => channel.id === channelId), true);
  }, chatStore);
});
