import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/products/chat/state/store.js';
import { createCat } from '../dist-server/products/chat/state/model/index.js';

let tempDir;
let configId = 0;

test.before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cats-platform-test-'));
});

test.after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function getBaseConfig() {
  configId += 1;
  return {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    chatStatePath: path.join(tempDir, `case-${configId}`, 'chat-state.json'),
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
    assert.equal(payload.guideCat, null);
    assert.equal(payload.lastProductSurface, null);
    assert.deepEqual(payload.desktop, {
      startAtLogin: true,
      openWindowOnStartup: false,
    });
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

test('POST /api/platform/setup/complete with createGuideCat=true persists a platform-level Guide Cat without assigning Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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
    assert.equal(payload.chat.cats.length, 0, 'platform setup should not inject Guide Cat into chat cats');
    assert.equal(payload.guideCat?.name, 'Meowster');
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.guideCat?.executionTarget.model, 'claude-sonnet');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.provider, 'claude');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shellPayload = await shellResponse.json();
    assert.equal(shellPayload.guideCat?.name, 'Meowster');
    assert.equal(shellPayload.chat.cats.length, 0);
  });
});

test('POST /api/platform/setup/complete persists Guide Cat modelSelection without overwriting orchestrator selection', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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

    assert.deepEqual(payload.guideCat?.modelSelection, {
      entryMode: 'auto',
      presetId: 'balanced',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
    assert.equal(payload.chat.globalOrchestrator.executionModelSelection, null);
  });
});

test('POST /api/platform/setup/complete with createGuideCat=false does not create Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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
    assert.equal(payload.guideCat, null);
  });
});

test('POST /api/platform/setup/complete returns 409 if already completed', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: false,
      }),
    });

    const secondResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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

test('POST /api/platform/setup/complete with createGuideCat=true defaults name to Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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

    assert.equal(payload.guideCat?.name, 'Guide Cat');
  });
});

test('chat functions normally after platform setup without Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup without Guide Cat
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
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

test('POST /api/platform/setup/complete can create Guide Cat even when starting product is not chat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.guideCat?.name, 'CrossProduct');
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);
  });
});

test('POST /api/platform/setup/complete still accepts legacy Boss Cat aliases as Guide Cat compatibility', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
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
    assert.equal(payload.chat.bossCatId, null, 'platform setup should not assign Boss Cat');
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.guideCat?.name, 'Legacy Boss');
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.guideCat?.executionTarget.model, 'claude-sonnet');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);
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
    await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startAtLogin: true,
        openWindowOnStartup: false,
      }),
    });

    await fetch(`${baseUrl}/api/platform/setup/complete`, {
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
    assert.deepEqual(payload.desktop, {
      startAtLogin: true,
      openWindowOnStartup: false,
    });
  });
});

test('POST /api/platform/preferences updates lastProductSurface', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: false,
      }),
    });

    const prefsResponse = await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastProductSurface: 'work' }),
    });
    assert.equal(prefsResponse.status, 200);
    assert.deepEqual(await prefsResponse.json(), {
      lastProductSurface: 'work',
      startAtLogin: true,
      openWindowOnStartup: false,
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    const shell = await shellResponse.json();
    assert.equal(shell.lastProductSurface, 'work', 'lastProductSurface should be updated to work');
  });
});

test('POST /api/platform/preferences updates desktop startup preferences without losing surface', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const firstResponse = await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lastProductSurface: 'code',
        startAtLogin: true,
        openWindowOnStartup: false,
      }),
    });
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), {
      lastProductSurface: 'code',
      startAtLogin: true,
      openWindowOnStartup: false,
    });

    const secondResponse = await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startAtLogin: false,
      }),
    });
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(await secondResponse.json(), {
      lastProductSurface: 'code',
      startAtLogin: false,
      openWindowOnStartup: false,
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    const shell = await shellResponse.json();
    assert.equal(shell.lastProductSurface, 'code');
    assert.deepEqual(shell.desktop, {
      startAtLogin: false,
      openWindowOnStartup: false,
    });
  });
});

test('POST /api/platform/preferences rejects invalid surface', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/preferences`, {
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
