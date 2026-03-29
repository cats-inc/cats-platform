import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';
import { createCat } from '../dist-server/chat/model.js';

let tempDir;

test.before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cats-suite-test-'));
});

test.after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function getBaseConfig() {
  return {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    chatStatePath: path.join(tempDir, 'chat-state.json'),
  };
}

function createRuntimeStub() {
  let nextSession = 1;
  return {
    createdSessions: [],
    sentMessages: [],
    closedSessions: [],
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
        cwd: input.cwd ?? path.join(tmpdir(), '.cats-runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: 'Acknowledged.',
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    shared: {
      config: getBaseConfig(),
      runtimeClient,
      now: () => new Date('2026-03-25T00:00:00.000Z'),
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
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/app-shell returns lastProductSurface: null before setup', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.lastProductSurface, null);
  });
});

test('POST /api/suite/setup/complete with createBossCat=true creates Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: true,
        bossCatName: 'Meowster',
        bossCatProvider: 'claude',
        bossCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.setupCompleteAt, 'setupCompleteAt should be set');
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, 'chat');
    assert.ok(payload.chat.bossCatId, 'bossCatId should be non-null');
    assert.deepEqual(payload.chat.capabilities.availableSurfaces, ['chat']);

    const bossCat = payload.chat.cats.find((cat) => cat.id === payload.chat.bossCatId);
    assert.ok(bossCat, 'Boss Cat should exist in cats array');
    assert.equal(bossCat.name, 'Meowster');
    assert.deepEqual(bossCat.products, ['chat']);
  });
});

test('POST /api/suite/setup/complete persists Boss Cat modelSelection and orchestrator selection', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: true,
        bossCatName: 'Meowster',
        bossCatProvider: 'codex',
        bossCatModel: 'gpt-5.4',
        bossCatModelSelection: {
          entryMode: 'auto',
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'high',
          },
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const bossCat = payload.chat.cats.find((cat) => cat.id === payload.chat.bossCatId);

    assert.deepEqual(bossCat.defaultModelSelection, {
      entryMode: 'auto',
      presetId: 'balanced',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
    assert.deepEqual(payload.chat.globalOrchestrator.executionModelSelection, {
      entryMode: 'auto',
      presetId: 'balanced',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
  });
});

test('POST /api/suite/setup/complete with createBossCat=false does not create Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.setupCompleteAt, 'setupCompleteAt should be set');
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, 'chat');
    assert.equal(payload.chat.bossCatId, null, 'bossCatId should remain null');
    assert.equal(payload.chat.cats.length, 0, 'no cats should be created');
  });
});

test('POST /api/suite/setup/complete returns 409 if already completed', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    const secondResponse = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny Again',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    assert.equal(secondResponse.status, 409);
  });
});

test('POST /api/suite/setup/complete with createBossCat=true defaults name to Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: true,
        bossCatName: '',
        bossCatProvider: 'claude',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    const bossCat = payload.chat.cats.find((cat) => cat.id === payload.chat.bossCatId);
    assert.ok(bossCat);
    assert.equal(bossCat.name, 'Boss Cat');
  });
});

test('chat functions normally after suite setup without Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup without Boss Cat
    await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    // Verify app-shell works
    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.ok(shell.setupCompleteAt);
    assert.equal(shell.chat.bossCatId, null);
    assert.equal(shell.chat.channels.length, 0, 'no channels created during setup');
  });
});

test('old POST /api/setup/complete still works alongside new endpoint', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
        bossCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.ok(payload.chat.bossCatId, 'old endpoint still creates Boss Cat');
  });
});

test('POST /api/setup/reset clears lastProductSurface and setupCompleteAt', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    const resetResponse = await fetch(`${baseUrl}/api/setup/reset`, {
      method: 'POST',
    });
    assert.equal(resetResponse.status, 200);
    const payload = await resetResponse.json();

    assert.equal(payload.setupCompleteAt, null, 'setupCompleteAt should be cleared');
    assert.equal(payload.lastProductSurface, null, 'lastProductSurface should be cleared');
    assert.equal(payload.chat.bossCatId, null, 'bossCatId should be cleared');
  });
});

test('POST /api/suite/preferences updates lastProductSurface', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    const prefsResponse = await fetch(`${baseUrl}/api/suite/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastProductSurface: 'work' }),
    });
    assert.equal(prefsResponse.status, 200);

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    const shell = await shellResponse.json();
    assert.equal(shell.lastProductSurface, 'work', 'lastProductSurface should be updated to work');
  });
});

test('POST /api/suite/preferences rejects invalid surface', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastProductSurface: 'invalid' }),
    });
    assert.equal(response.status, 400);
  });
});

test('GET /api/app-shell treats legacy active chat state as setup-complete even when setupCompleteAt is missing', async () => {
  const chatStore = new MemoryChatStore();
  const seeded = createCat(
    await chatStore.read(),
    {
      name: 'Boss Cat',
      provider: 'claude',
      makeBoss: true,
    },
    new Date('2026-03-25T00:00:00.000Z'),
  );
  await chatStore.write(seeded);

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(payload.setupCompleteAt, 'legacy active state should not be forced back into setup');
    assert.ok(payload.chat.bossCatId, 'boss cat should remain visible');
  }, chatStore);
});
