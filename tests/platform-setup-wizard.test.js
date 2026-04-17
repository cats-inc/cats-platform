import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { GUIDE_CAT_ASSIST_V1_SCOPE_KEYS } from '../build/server/shared/guideCatAssist.js';
import {
  readGuideCatAssistCache,
  upsertGuideCatAssistBundle,
} from '../build/server/shared/guideCatAssistStore.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createCat } from '../build/server/products/chat/state/model/index.js';

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
    chatStatePath: path.join(tempDir, `case-${configId}`, 'platform', 'state', 'chat-state.local.json'),
  };
}

function createRuntimeStub(options = {}) {
  let nextSession = 1;
  const state = {
    reachable: options.reachable ?? true,
  };
  return {
    state,
    createdSessions: [],
    sentMessages: [],
    closedSessions: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: state.reachable,
        status: state.reachable ? 'ok' : 'down',
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
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        segments: [{ kind: 'text', text: 'Acknowledged.', toolName: null, toolId: null }],
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
  const config = getBaseConfig();
  const server = createServer({
    shared: {
      config,
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
    await callback(`http://127.0.0.1:${address.port}`, config);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function waitForGuideCatAssistBundle(
  chatStatePath,
  scopeKey,
  options = {},
) {
  const deadline = Date.now() + (options.timeoutMs ?? 4_000);
  while (Date.now() < deadline) {
    const cache = await readGuideCatAssistCache(chatStatePath);
    const bundle = cache.bundles[scopeKey] ?? null;
    if (bundle) {
      return bundle;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for assist bundle ${scopeKey}`);
}

test('GET /api/app-shell returns lastProductSurface: null before setup', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.guideCat, null);
    assert.deepEqual(payload.assistantPresets, []);
    assert.equal(payload.lastProductSurface, null);
    assert.deepEqual(payload.desktop, {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
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
        { id: 'code', group: 'office', maturity: 'preview', selectable: true },
        { id: 'work', group: 'office', maturity: 'preview', selectable: true },
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
    assert.equal(payload.lastProductSurface, null);
    assert.equal(payload.chat.bossCatId, null, 'bossCatId should remain null');
    assert.deepEqual(payload.chat.capabilities.availableSurfaces, ['chat', 'work', 'code']);
    assert.equal(payload.chat.cats.length, 0, 'platform setup should not inject Guide Cat into chat cats');
    assert.equal(payload.guideCat?.name, 'Meowster');
    assert.deepEqual(payload.assistantPresets, []);
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.guideCat?.executionTarget.model, 'claude-sonnet');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.provider, 'claude');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shellPayload = await shellResponse.json();
    assert.equal(shellPayload.guideCat?.name, 'Meowster');
    assert.deepEqual(shellPayload.assistantPresets, []);
    assert.equal(shellPayload.chat.cats.length, 0);
    assert.equal(shellPayload.lastProductSurface, null);
  });
});

test('platform assistant presets can be created, updated, listed, and removed without becoming chat cats', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const initialListResponse = await fetch(`${baseUrl}/api/platform/assistants`);
    assert.equal(initialListResponse.status, 200);
    assert.deepEqual(await initialListResponse.json(), { assistants: [] });

    const createResponse = await fetch(`${baseUrl}/api/platform/assistants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'API Reviewer',
        provider: 'claude',
        model: 'claude-sonnet',
        roleHint: 'Checks payload shape before runtime dispatch.',
      }),
    });
    assert.equal(createResponse.status, 201);
    const createdPayload = await createResponse.json();
    assert.equal(createdPayload.assistant.name, 'API Reviewer');
    assert.equal(createdPayload.assistant.executionTarget.provider, 'claude');
    assert.equal(createdPayload.assistant.executionTarget.model, 'claude-sonnet');
    assert.equal(createdPayload.assistant.roleHint, 'Checks payload shape before runtime dispatch.');
    assert.equal(createdPayload.assistants.length, 1);
    const assistantId = createdPayload.assistant.id;

    const shellAfterCreateResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellAfterCreateResponse.status, 200);
    const shellAfterCreate = await shellAfterCreateResponse.json();
    assert.equal(shellAfterCreate.chat.cats.length, 0);
    assert.equal(shellAfterCreate.assistantPresets.length, 1);
    assert.equal(shellAfterCreate.assistantPresets[0].name, 'API Reviewer');

    const updateResponse = await fetch(`${baseUrl}/api/platform/assistants/${assistantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Runtime Debugger',
        provider: 'codex',
        model: 'gpt-5.4',
        roleHint: 'Traces runtime session failures.',
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.assistant.name, 'Runtime Debugger');
    assert.equal(updatedPayload.assistant.executionTarget.provider, 'codex');
    assert.equal(updatedPayload.assistant.executionTarget.model, 'gpt-5.4');
    assert.equal(updatedPayload.assistants.length, 1);

    const listResponse = await fetch(`${baseUrl}/api/platform/assistants`);
    assert.equal(listResponse.status, 200);
    const listedPayload = await listResponse.json();
    assert.equal(listedPayload.assistants.length, 1);
    assert.equal(listedPayload.assistants[0].name, 'Runtime Debugger');

    const deleteResponse = await fetch(`${baseUrl}/api/platform/assistants/${assistantId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await deleteResponse.json(), {
      deletedId: assistantId,
      assistants: [],
    });

    const shellAfterDeleteResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellAfterDeleteResponse.status, 200);
    const shellAfterDelete = await shellAfterDeleteResponse.json();
    assert.equal(shellAfterDelete.chat.cats.length, 0);
    assert.deepEqual(shellAfterDelete.assistantPresets, []);
  });
});

test('POST /api/platform/setup/complete persists Guide Cat modelSelection without overwriting orchestrator selection', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
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
        createGuideCat: false,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.setupCompleteAt, 'setupCompleteAt should be set');
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, null);
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
        createGuideCat: false,
      }),
    });

    const secondResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny Again',
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

test('POST /api/platform/setup/complete still honors legacy selectedProduct for older clients', async () => {
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
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
      }),
    });

    await waitForGuideCatAssistBundle(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    );

    const diagnosticsBeforeReset = await fetch(`${baseUrl}/api/platform/bootstrap-diagnostics`);
    assert.equal(diagnosticsBeforeReset.status, 200);
    const diagnosticsBeforeResetPayload = await diagnosticsBeforeReset.json();
    assert.ok(
      diagnosticsBeforeResetPayload.events.some((event) => event.kind === 'setup_completed'),
      'setup_completed should be present before reset',
    );

    await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lastProductSurface: 'work',
        startAtLogin: true,
        openWindowOnStartup: false,
        systemTrayEnabled: true,
        guideCatSidecarSeen: true,
        guideCatSidecarMode: 'bubble',
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
    assert.equal(payload.guideCatSidecarSeen, false, 'guideCatSidecarSeen should be cleared');
    assert.equal(payload.guideCatSidecarMode, 'auto', 'guideCatSidecarMode should reset to auto');
    assert.deepEqual(payload.desktop, {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    });

    const diagnosticsAfterReset = await fetch(`${baseUrl}/api/platform/bootstrap-diagnostics`);
    assert.equal(diagnosticsAfterReset.status, 200);
    const diagnosticsAfterResetPayload = await diagnosticsAfterReset.json();
    assert.equal(diagnosticsAfterResetPayload.attemptId, null);
    assert.deepEqual(diagnosticsAfterResetPayload.events, []);
    assert.equal(payload.guideCat, null);
    assert.equal(payload.lobby.guideCatAssist?.renderSource, 'deterministic');

    const assistCacheAfterReset = await readGuideCatAssistCache(config.chatStatePath);
    assert.deepEqual(assistCacheAfterReset.bundles, {});
    assert.deepEqual(assistCacheAfterReset.refreshFailures, {});
  });
});

test('POST /api/platform/preferences updates lastProductSurface', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
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
      systemTrayEnabled: true,
      lobbyAnimationMode: 'reduced',
      guideCatSidecarSeen: false,
      guideCatSidecarMode: 'auto',
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
        systemTrayEnabled: true,
      }),
    });
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), {
      lastProductSurface: 'code',
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
      lobbyAnimationMode: 'reduced',
      guideCatSidecarSeen: false,
      guideCatSidecarMode: 'auto',
    });

    const secondResponse = await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startAtLogin: false,
        systemTrayEnabled: true,
      }),
    });
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(await secondResponse.json(), {
      lastProductSurface: 'code',
      startAtLogin: false,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
      lobbyAnimationMode: 'reduced',
      guideCatSidecarSeen: false,
      guideCatSidecarMode: 'auto',
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    const shell = await shellResponse.json();
    assert.equal(shell.lastProductSurface, 'code');
    assert.deepEqual(shell.desktop, {
      startAtLogin: false,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
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

test('POST /api/platform/preferences persists guideCatSidecarSeen into the app shell', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
      }),
    });

    const prefsResponse = await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guideCatSidecarSeen: true }),
    });
    assert.equal(prefsResponse.status, 200);
    assert.deepEqual(await prefsResponse.json(), {
      lastProductSurface: null,
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
      lobbyAnimationMode: 'reduced',
      guideCatSidecarSeen: true,
      guideCatSidecarMode: 'auto',
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.equal(shell.guideCatSidecarSeen, true);
  });
});

test('POST /api/platform/preferences persists guideCatSidecarMode into the app shell', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
      }),
    });

    const prefsResponse = await fetch(`${baseUrl}/api/platform/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guideCatSidecarMode: 'bubble' }),
    });
    assert.equal(prefsResponse.status, 200);
    assert.deepEqual(await prefsResponse.json(), {
      lastProductSurface: null,
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
      lobbyAnimationMode: 'reduced',
      guideCatSidecarSeen: false,
      guideCatSidecarMode: 'bubble',
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.equal(shell.guideCatSidecarMode, 'bubble');
  });
});

test('PATCH /api/platform/guide-cat dismissal survives later guide cat edits', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'Guide Cat',
      }),
    });

    const dismissResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    assert.equal(dismissResponse.status, 200);
    const dismissedPayload = await dismissResponse.json();
    assert.equal(dismissedPayload.guideCat.status, 'dismissed');

    const updateResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Resting Guide',
        provider: 'claude',
        model: 'claude-sonnet',
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.guideCat.name, 'Resting Guide');
    assert.equal(updatedPayload.guideCat.status, 'dismissed');

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.equal(shell.guideCat?.name, 'Resting Guide');
    assert.equal(shell.guideCat?.status, 'dismissed');
  });
});

test('DELETE /api/platform/guide-cat clears assist cache and restores deterministic lobby assist', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'Guide Cat',
      }),
    });
    assert.equal(setupResponse.status, 200);

    await waitForGuideCatAssistBundle(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    );

    const deleteResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 200);

    const assistCache = await readGuideCatAssistCache(config.chatStatePath);
    assert.deepEqual(assistCache.bundles, {});
    assert.deepEqual(assistCache.refreshFailures, {});

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.equal(shell.guideCat, null);
    assert.equal(shell.lobby.guideCatAssist?.renderSource, 'deterministic');
  });
});

test('GET /api/app-shell uses last-good assist cache when runtime is offline', async () => {
  const runtime = createRuntimeStub({ reachable: false });
  await withServer(runtime, async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'Guide Cat',
      }),
    });
    assert.equal(setupResponse.status, 200);

    await upsertGuideCatAssistBundle(config.chatStatePath, {
      bundleId: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
      scope: {
        surfaceId: 'lobby',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      content: {
        greeting: 'Cached offline lobby greeting',
        entryChips: [],
      },
      provenance: {
        originMode: 'runtime',
        refreshContextHash: 'gca:v1:offline-lobby',
        missionId: 'mission-offline-lobby',
        runId: 'run-offline-lobby',
      },
      freshness: {
        generatedAt: '2026-03-24T23:59:00.000Z',
        expiresAt: '2026-03-25T06:00:00.000Z',
        lastRefreshStatus: 'ok',
      },
    });
    await upsertGuideCatAssistBundle(config.chatStatePath, {
      bundleId: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewSolo,
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'solo',
        audienceState: 'default',
      },
      content: {
        greeting: 'Cached offline solo greeting',
        entryChips: [
          {
            id: 'cached-offline-solo',
            prompt: 'Use the cached offline solo prompt.',
          },
        ],
      },
      provenance: {
        originMode: 'runtime',
        refreshContextHash: 'gca:v1:offline-solo',
        missionId: 'mission-offline-solo',
        runId: 'run-offline-solo',
      },
      freshness: {
        generatedAt: '2026-03-24T23:59:00.000Z',
        expiresAt: '2026-03-25T06:00:00.000Z',
        lastRefreshStatus: 'ok',
      },
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();

    assert.equal(shell.runtime.reachable, false);
    assert.equal(shell.lobby.guideCatAssist?.renderSource, 'cache');
    assert.equal(shell.lobby.guideCatAssist?.bundle.content.greeting, 'Cached offline lobby greeting');
    assert.equal(shell.lobby.guideCatAssist?.refreshEligible, false);
    assert.equal(
      shell.guideCatAssist?.codeNewDraft?.scopeKey,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.codeNewDefault,
    );
    assert.equal(shell.chat.newChatAssist?.solo.renderSource, 'cache');
    assert.equal(
      shell.chat.newChatAssist?.solo.bundle.content.entryChips[0]?.prompt,
      'Use the cached offline solo prompt.',
    );
  });
});

test('GET /api/app-shell serves stale assist cache first and lazily rehydrates it when runtime is back', async () => {
  const runtime = createRuntimeStub({ reachable: false });
  await withServer(runtime, async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'Guide Cat',
      }),
    });
    assert.equal(setupResponse.status, 200);

    await upsertGuideCatAssistBundle(config.chatStatePath, {
      bundleId: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
      scope: {
        surfaceId: 'lobby',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      content: {
        greeting: 'Stale cached lobby greeting',
        entryChips: [],
      },
      provenance: {
        originMode: 'runtime',
        refreshContextHash: 'gca:v1:stale-lobby',
        missionId: 'mission-stale-lobby',
        runId: 'run-stale-lobby',
      },
      freshness: {
        generatedAt: '2026-03-24T12:00:00.000Z',
        expiresAt: '2026-03-24T12:05:00.000Z',
        lastRefreshStatus: 'ok',
      },
    });

    runtime.state.reachable = true;

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();

    assert.equal(shell.runtime.reachable, true);
    assert.equal(shell.lobby.guideCatAssist?.renderSource, 'cache');
    assert.equal(shell.lobby.guideCatAssist?.bundle.content.greeting, 'Stale cached lobby greeting');
    assert.equal(shell.lobby.guideCatAssist?.stale, true);
    assert.equal(shell.lobby.guideCatAssist?.refreshEligible, true);

    const deadline = Date.now() + 5_000;
    let refreshedBundle = null;
    while (Date.now() < deadline) {
      const cache = await readGuideCatAssistCache(config.chatStatePath);
      const bundle = cache.bundles[GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault] ?? null;
      if (bundle?.freshness.generatedAt === '2026-03-25T00:00:00.000Z') {
        refreshedBundle = bundle;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.ok(refreshedBundle);
    assert.equal(refreshedBundle.content.greeting, 'Stale cached lobby greeting');
    assert.equal(refreshedBundle.freshness.lastRefreshStatus, 'skipped');
  });
});

test('PUT /api/platform/guide-cat hydrates assist cache without requiring an app-shell refresh', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const updateResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Runtime Guide',
        provider: 'claude',
        model: 'claude-sonnet',
      }),
    });
    assert.equal(updateResponse.status, 200);

    const lobbyBundle = await waitForGuideCatAssistBundle(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    );
    const soloBundle = await waitForGuideCatAssistBundle(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewSolo,
    );

    assert.equal(lobbyBundle.freshness.lastRefreshStatus, 'skipped');
    assert.equal(soloBundle.freshness.lastRefreshStatus, 'skipped');
  });
});

test('PUT /api/platform/guide-cat refreshes a still-fresh assist cache when guide cat context changes', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'First Guide',
        guideCatProvider: 'claude',
        guideCatModel: 'claude-sonnet',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const firstBundle = await waitForGuideCatAssistBundle(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    );
    const firstHash = firstBundle.provenance.refreshContextHash;

    const updateResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Second Guide',
        provider: 'codex',
        model: 'gpt-5.4',
      }),
    });
    assert.equal(updateResponse.status, 200);

    const deadline = Date.now() + 5_000;
    let refreshedBundle = firstBundle;
    while (Date.now() < deadline) {
      const cache = await readGuideCatAssistCache(config.chatStatePath);
      refreshedBundle = cache.bundles[GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault] ?? firstBundle;
      if (refreshedBundle.provenance.refreshContextHash !== firstHash) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.notEqual(refreshedBundle.provenance.refreshContextHash, firstHash);
    assert.equal(refreshedBundle.freshness.lastRefreshStatus, 'skipped');
  });
});

test('PATCH /api/platform/guide-cat status=active rehydrates assist cache after restore', async () => {
  const runtime = createRuntimeStub({ reachable: false });
  await withServer(runtime, async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'Sleeping Guide',
      }),
    });
    assert.equal(setupResponse.status, 200);

    runtime.state.reachable = true;

    const dismissResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    assert.equal(dismissResponse.status, 200);

    const restoreResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(restoreResponse.status, 200);

    const parallelBundle = await waitForGuideCatAssistBundle(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewParallel,
    );
    assert.equal(parallelBundle.freshness.lastRefreshStatus, 'skipped');
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
