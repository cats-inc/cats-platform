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
    assert.deepEqual(
      payload.products.map((product) => ({
        id: product.id,
        group: product.group,
        maturity: product.maturity,
        selectable: product.setup.selectable,
      })),
      [
        { id: 'chat', group: 'home', maturity: 'active', selectable: true },
        { id: 'work', group: 'office', maturity: 'preview', selectable: true },
        { id: 'code', group: 'office', maturity: 'preview', selectable: true },
      ],
    );
  });
});

test('POST /api/suite/setup/complete with createGuideCat=true creates a Guide Cat without assigning Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: true,
        guideCatName: 'Meowster',
        guideCatProvider: 'claude',
        guideCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.setupCompleteAt, 'setupCompleteAt should be set');
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, 'chat');
    assert.equal(payload.chat.bossCatId, null, 'bossCatId should remain null');
    assert.deepEqual(payload.chat.capabilities.availableSurfaces, ['chat', 'work', 'code']);

    const guideCat = payload.chat.cats.find((cat) => cat.name === 'Meowster');
    assert.ok(guideCat, 'Guide Cat should exist in cats array');
    assert.deepEqual(guideCat.products, ['chat']);
    assert.equal(payload.chat.globalOrchestrator.executionTarget.provider, 'claude');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, 'claude-sonnet');
  });
});

test('POST /api/suite/setup/complete persists Guide Cat modelSelection and orchestrator selection', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: true,
        guideCatName: 'Meowster',
        guideCatProvider: 'codex',
        guideCatModel: 'gpt-5.4',
        guideCatModelSelection: {
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
    const guideCat = payload.chat.cats.find((cat) => cat.name === 'Meowster');

    assert.deepEqual(guideCat.defaultModelSelection, {
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

test('POST /api/suite/setup/complete with createGuideCat=false does not create Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: false,
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
        createGuideCat: false,
      }),
    });

    const secondResponse = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny Again',
        selectedProduct: 'chat',
        createGuideCat: false,
      }),
    });

    assert.equal(secondResponse.status, 409);
  });
});

test('POST /api/suite/setup/complete with createGuideCat=true defaults name to Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: true,
        guideCatName: '',
        guideCatProvider: 'claude',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    const guideCat = payload.chat.cats.find((cat) => cat.name === 'Guide Cat');
    assert.ok(guideCat);
  });
});

test('chat functions normally after suite setup without Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup without Guide Cat
    await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: false,
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

test('POST /api/suite/setup/complete can create Guide Cat even when starting product is not chat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'work',
        createGuideCat: true,
        guideCatName: 'CrossProduct',
        guideCatProvider: 'claude',
        guideCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.lastProductSurface, 'work');
    assert.equal(payload.chat.bossCatId, null);
    assert.ok(payload.chat.cats.some((cat) => cat.name === 'CrossProduct'));
    assert.equal(payload.chat.globalOrchestrator.executionTarget.provider, 'claude');
  });
});

test('POST /api/suite/setup/complete still accepts legacy Boss Cat aliases as Guide Cat compatibility', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: true,
        bossCatName: 'Legacy Boss',
        bossCatProvider: 'claude',
        bossCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.chat.bossCatId, null, 'suite setup should not assign Boss Cat');
    assert.ok(payload.chat.cats.some((cat) => cat.name === 'Legacy Boss'));
    assert.equal(payload.chat.globalOrchestrator.executionTarget.provider, 'claude');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, 'claude-sonnet');
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
        createGuideCat: false,
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
        createGuideCat: false,
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
