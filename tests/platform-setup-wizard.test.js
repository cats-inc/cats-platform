import { readCatlasCatalog, updateCatlasCatalog } from '../build/server/shared/guideCatCurationStore.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { GUIDE_CAT_ASSIST_SCOPE_KEYS } from '../build/server/shared/guideCatAssist.js';
import {
  GUIDE_CAT_SYSTEM_NAME,
  resolveGuideCatSystemName,
} from '../build/server/shared/guideCatIdentity.js';
import {
  readGuideCatAssistCache,
} from '../build/server/shared/guideCatAssistStore.js';
import { waitForGuideCatAssistRefreshIdle } from '../build/server/products/chat/api/guideCatAssist.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createCat } from '../build/server/products/chat/state/model/index.js';
import {
  createUnprovisionedTestSession,
  TEST_ADMIN_CREDENTIALS,
  createTestAuthConfig,
  installAuthenticatedFetch,
} from './testUtils.js';

let tempDir;
let configId = 0;
const TEST_NOW = new Date('2026-03-25T00:00:00.000Z');

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
      const request = (() => { try { return JSON.parse(content); } catch { return null; } })();
      const output = request?.scopes ? JSON.stringify({ surfaces: request.scopes.map(scope => ({ scopeKey: scope.scopeKey,
        ...(scope.catalog ? { operations: [{ op: 'add', kind: 'greeting', text: state.greeting ?? 'Catlas fixture greeting', locale: request.snapshot.context.locale }] } : {}),
        recommendations: [],
      })) }) : 'Acknowledged.';
      return {
        segments: [{ kind: 'text', text: output, toolName: null, toolId: null }],
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
  const auth = createUnprovisionedTestSession({ now: TEST_NOW });
  const server = createServer({
    shared: {
      config: {
        ...config,
        auth: createTestAuthConfig({
          allowedBrowserOrigins: [`http://${config.host}:${config.port}`],
          authStatePath: path.join(path.dirname(config.chatStatePath), 'auth-state.local.json'),
          recoveryTokenPath: path.join(
            path.dirname(config.chatStatePath),
            'auth-recovery-token.local.txt',
          ),
        }),
      },
      runtimeClient,
      authStore: auth.authStore,
      now: () => TEST_NOW,
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

  let restoreFetch = () => {};
  try {
    restoreFetch = installAuthenticatedFetch(`http://127.0.0.1:${address.port}`, auth, {
      origin: `http://${config.host}:${config.port}`,
    });
    await callback(`http://127.0.0.1:${address.port}`, config, chatStore);
  } finally {
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    restoreFetch();
    server.close();
    await once(server, 'close');
  }
}

async function waitForGuideCatAssistSurface(
  chatStatePath,
  scopeKey,
  options = {},
) {
  const deadline = Date.now() + (options.timeoutMs ?? 4_000);
  while (Date.now() < deadline) {
    const catalog = await readCatlasCatalog(chatStatePath);
    const surface = catalog.surfaces[scopeKey] ?? null;
    if (surface?.prompt) return surface;
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
    assert.equal(payload.runtime.baseUrl, '/runtime');
    assert.equal(payload.guideCat, null);
    assert.deepEqual(payload.assistantPresets, []);
    assert.equal(payload.lastProductSurface, null);
    assert.deepEqual({
      startAtLogin: payload.desktop.startAtLogin,
      openWindowOnStartup: payload.desktop.openWindowOnStartup,
      systemTrayEnabled: payload.desktop.systemTrayEnabled,
    }, {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    });
    assert.equal(payload.desktop.mobilePairing?.bindReachability, 'loopback');
    assert.equal(payload.desktop.mobilePairing?.pairingUrlStatus, 'phase1_pending');
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
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatProvider: 'claude',
        guideCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.setupCompleteAt, 'setupCompleteAt should be set');
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, null);
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false, 'no cat should become a Boss Cat');
    assert.deepEqual(payload.chat.capabilities.availableSurfaces, ['chat', 'work', 'code']);
    assert.equal(payload.chat.cats.length, 0, 'platform setup should not inject Guide Cat into chat cats');
    assert.equal(payload.guideCat?.name, GUIDE_CAT_SYSTEM_NAME);
    assert.deepEqual(payload.assistantPresets, []);
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.guideCat?.executionTarget.model, 'claude-sonnet');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.provider, 'codex');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shellPayload = await shellResponse.json();
    assert.equal(shellPayload.guideCat?.name, GUIDE_CAT_SYSTEM_NAME);
    assert.deepEqual(shellPayload.assistantPresets, []);
    assert.equal(shellPayload.chat.cats.length, 0);
    assert.equal(shellPayload.lastProductSurface, null);
  });
});

test('first-run Catlas setup reads selected catalogs before login and requires login after completion', async () => {
  const anonymousFetch = globalThis.fetch;
  const runtime = createRuntimeStub();
  const target = { provider: 'claude', backend: 'cli', instance: 'native' };
  runtime.getSetupState = async () => ({
    bootstrapRequired: false,
    state: { status: 'ready', appliedAt: TEST_NOW.toISOString(), lastScanAt: null,
      lastManualScanAt: null, appliedConfigPath: null, error: null },
    selection: { state: 'selected', revision: 'first-run', targets: [target] },
    repair: { status: 'ready', summary: 'Runtime ready', providersReady: [{ provider: 'claude', family: 'Claude' }],
      providersNeedingAttention: [], preferredScan: { source: 'none', scannedAt: null,
        providerCount: 1, availableCount: 1, unavailableCount: 0, remediationCount: 0 } },
  });
  runtime.getProviderConfig = async () => ({
    claude: { defaultBackend: 'cli', defaultInstance: 'native',
      instances: [{ id: 'native', backend: 'cli', target: 'cli/native' }] },
  });
  runtime.getProviderDiagnostics = async () => ({ probe: 'light', providers: [
    { ...target, defaultTarget: true, availability: { status: 'ok', summary: 'CLI ready', attentionCodes: [] } },
    { provider: 'codex', backend: 'cli', instance: 'native', defaultTarget: true,
      availability: { status: 'ok', summary: 'Installed but not selected', attentionCodes: [] } },
  ] });
  runtime.getAdvancedProviderModels = async () => ({
    ...target, defaultSelection: null, entries: [{ id: 'claude-default', label: 'Claude default' }],
    presets: [], controls: [], warnings: [],
  });

  await withServer(runtime, async (baseUrl) => {
    const before = await (await anonymousFetch(`${baseUrl}/api/auth/status`)).json();
    assert.equal(before.authenticated, false);

    for (const query of ['', '?force=1']) {
      const response = await anonymousFetch(`${baseUrl}/api/providers${query}`);
      assert.equal(response.status, 200, 'the second setup step must read providers before an Admin exists');
      const registry = await response.json();
      assert.equal(registry.state, 'ready');
      assert.deepEqual(registry.providers.map((provider) => provider.id), ['claude']);
      assert.equal(registry.revision, 'first-run');
    }
    const catalogs = [
      '/api/providers',
      '/api/providers/claude/models?instance=cli%2Fnative',
      '/api/providers/claude/models/advanced?instance=cli%2Fnative',
    ];
    let model;
    for (const pathname of catalogs.slice(1)) {
      const response = await anonymousFetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200);
      const { catalog } = await response.json();
      assert.equal(catalog.provider, 'claude');
      assert.equal(catalog.instance, 'cli/native');
      if (catalog.models) model = catalog.models[0].id;
    }
    assert.equal(model, 'claude-default');
    assert.equal((await anonymousFetch(`${baseUrl}/api/providers/codex/models`)).status, 409);
    assert.equal((await anonymousFetch(`${baseUrl}/api/providers/models/refresh`, { method: 'POST' })).status, 401);

    const completed = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TEST_ADMIN_CREDENTIALS, ownerDisplayName: 'Fixture Owner',
        createGuideCat: true, guideCatProvider: 'claude', guideCatInstance: 'cli/native', guideCatModel: model }),
    });
    assert.equal(completed.status, 200);
    const envelope = await completed.json();
    assert.ok(envelope.setupCompleteAt);
    assert.equal(envelope.runtimeSetup.status, 'ready');
    assert.deepEqual(envelope.guideCat.executionTarget, { provider: 'claude', instance: 'cli/native', model });
    assert.equal((await (await fetch(`${baseUrl}/api/auth/status`)).json()).authenticated, true);

    for (const pathname of catalogs) {
      assert.equal((await anonymousFetch(`${baseUrl}${pathname}`)).status, 401,
        'the bootstrap read exemption must close after setup');
      assert.equal((await fetch(`${baseUrl}${pathname}`)).status, 200,
        'the newly issued Admin session must still read the catalogs');
    }
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
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
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
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: false,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(payload.setupCompleteAt, 'setupCompleteAt should be set');
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, null);
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false, 'no cat should become a Boss Cat');
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
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: false,
      }),
    });

    const secondResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny Again',
        createGuideCat: false,
      }),
    });

    assert.equal(secondResponse.status, 409);
  });
});

test('POST /api/platform/setup/complete with createGuideCat=true defaults name to the shipped guide cat name', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatProvider: 'claude',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.guideCat?.name, GUIDE_CAT_SYSTEM_NAME);
  });
});

test('POST /api/platform/setup/complete keeps the shipped guide cat name across current locales', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatProvider: 'claude',
        guideCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.guideCat?.name, resolveGuideCatSystemName('zh-TW,zh;q=0.9,en;q=0.8'));
  });
});

test('POST /api/platform/setup/complete rejects guide cat name overrides', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
        guideCatName: 'Meowster',
        guideCatProvider: 'claude',
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(
      payload.error?.message,
      'Unexpected name field. Guide Cat name is system-managed.',
    );
  });
});

test('chat functions normally after platform setup without Guide Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup without Guide Cat
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: false,
      }),
    });

    // Verify app-shell works
    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.ok(shell.setupCompleteAt);
    assert.equal(shell.chat.cats.some((cat) => cat.group === 'admin'), false);
    assert.equal(shell.chat.channels.length, 0, 'no channels created during setup');
  });
});

test('POST /api/platform/setup/complete still honors legacy selectedProduct for older clients', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        selectedProduct: 'work',
        createGuideCat: true,
        guideCatProvider: 'claude',
        guideCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.lastProductSurface, 'work');
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false);
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.guideCat?.name, GUIDE_CAT_SYSTEM_NAME);
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);
  });
});

test('POST /api/platform/setup/complete still accepts legacy Boss Cat provider aliases as Guide Cat compatibility', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createBossCat: true,
        bossCatProvider: 'claude',
        bossCatModel: 'claude-sonnet',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false, 'platform setup should not assign Boss Cat');
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.guideCat?.name, GUIDE_CAT_SYSTEM_NAME);
    assert.equal(payload.guideCat?.executionTarget.provider, 'claude');
    assert.equal(payload.guideCat?.executionTarget.model, 'claude-sonnet');
    assert.equal(payload.chat.globalOrchestrator.executionTarget.model, null);
  });
});

test('POST /api/setup/reset clears lastProductSurface and setupCompleteAt', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
      }),
    });

    await waitForGuideCatAssistSurface(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault,
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
      }),
    });

    const resetResponse = await fetch(`${baseUrl}/api/setup/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESET', resetRuntime: false }),
    });
    assert.equal(resetResponse.status, 200);
    const payload = await resetResponse.json();

    assert.equal(payload.setupCompleteAt, null, 'setupCompleteAt should be cleared');
    assert.equal(payload.lastProductSurface, null, 'lastProductSurface should be cleared');
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false, 'Boss Cats should be cleared');
    assert.deepEqual({
      startAtLogin: payload.desktop.startAtLogin,
      openWindowOnStartup: payload.desktop.openWindowOnStartup,
      systemTrayEnabled: payload.desktop.systemTrayEnabled,
    }, {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    });
    assert.equal(payload.desktop.mobilePairing?.bindReachability, 'loopback');
    assert.equal(payload.desktop.mobilePairing?.pairingUrlStatus, 'phase1_pending');

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
        ...TEST_ADMIN_CREDENTIALS,
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
      assistantResponseLanguage: 'unspecified',
      uiLanguagePreference: 'auto',
      codePreviewServersEnabled: false,
      claudeInChromeEnabled: false,
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
      assistantResponseLanguage: 'unspecified',
      uiLanguagePreference: 'auto',
      codePreviewServersEnabled: false,
      claudeInChromeEnabled: false,
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
      assistantResponseLanguage: 'unspecified',
      uiLanguagePreference: 'auto',
      codePreviewServersEnabled: false,
      claudeInChromeEnabled: false,
    });

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    const shell = await shellResponse.json();
    assert.equal(shell.lastProductSurface, 'code');
    assert.deepEqual({
      startAtLogin: shell.desktop.startAtLogin,
      openWindowOnStartup: shell.desktop.openWindowOnStartup,
      systemTrayEnabled: shell.desktop.systemTrayEnabled,
    }, {
      startAtLogin: false,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    });
    assert.equal(shell.desktop.mobilePairing?.bindReachability, 'loopback');
    assert.equal(shell.desktop.mobilePairing?.pairingUrlStatus, 'phase1_pending');
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

test('PATCH /api/platform/guide-cat disable status survives later guide cat edits', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
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
        provider: 'claude',
        model: 'claude-sonnet',
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.guideCat.name, GUIDE_CAT_SYSTEM_NAME);
    assert.equal(updatedPayload.guideCat.status, 'dismissed');

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shell = await shellResponse.json();
    assert.equal(shell.guideCat?.name, GUIDE_CAT_SYSTEM_NAME);
    assert.equal(shell.guideCat?.status, 'dismissed');
  });
});

test('DELETE /api/platform/guide-cat clears assist cache and restores deterministic lobby assist', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
      }),
    });
    assert.equal(setupResponse.status, 200);

    await waitForGuideCatAssistSurface(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault,
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

test('GET /api/app-shell uses last-good generated assist when runtime is offline', async () => {
  const runtime = createRuntimeStub();
  await withServer(runtime, async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...TEST_ADMIN_CREDENTIALS, ownerDisplayName: 'Kenny', createGuideCat: true }) });
    assert.equal(setupResponse.status, 200);
    await waitForGuideCatAssistSurface(config.chatStatePath, GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault);
    runtime.state.reachable = false;
    const shell = await (await fetch(`${baseUrl}/api/app-shell`)).json();
    assert.equal(shell.runtime.reachable, false);
    assert.equal(shell.lobby.guideCatAssist.renderSource, 'cache');
    assert.ok(shell.lobby.guideCatAssist.bundle.content.greetings.some(item => item.text === 'Catlas fixture greeting'));
    assert.equal(shell.lobby.guideCatAssist.refreshEligible, false);
    assert.equal(shell.guideCatAssist.codeNewDraft.scopeKey, GUIDE_CAT_ASSIST_SCOPE_KEYS.codeNewDefault);
    assert.equal(shell.chat.newChatAssist.bundle.content.entryChips.length, 5);
  });
});

test('GET /api/app-shell serves last-good assist immediately while stale generation refreshes in the background', async () => {
  const runtime = createRuntimeStub();
  await withServer(runtime, async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...TEST_ADMIN_CREDENTIALS, ownerDisplayName: 'Kenny', createGuideCat: true }) });
    assert.equal(setupResponse.status, 200);
    await waitForGuideCatAssistSurface(config.chatStatePath, GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault);
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    await updateCatlasCatalog(config.chatStatePath, catalog => {
      const surface = catalog.surfaces[GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault];
      surface.prompt.refreshedAt = '2026-03-24T12:00:00Z';
      surface.prompt.expiresAt = '2026-03-24T18:00:00Z';
      surface.attemptedAt.prompt.at = surface.prompt.refreshedAt;
    });
    runtime.state.greeting = 'A refreshed Catlas greeting';
    const shell = await (await fetch(`${baseUrl}/api/app-shell`)).json();
    assert.equal(shell.lobby.guideCatAssist.renderSource, 'cache');
    assert.ok(shell.lobby.guideCatAssist.bundle.content.greetings.some(item => item.text === 'Catlas fixture greeting'));
    assert.equal(shell.lobby.guideCatAssist.stale, true);
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    const current = await readCatlasCatalog(config.chatStatePath);
    assert.equal(current.surfaces[GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault].prompt.refreshedAt, TEST_NOW.toISOString());
    assert.ok(current.surfaces[GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault].catalog.greetings.some(item => item.text === 'A refreshed Catlas greeting'));
  });
});

test('PUT /api/platform/guide-cat generates assist without requiring an app-shell refresh', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const updateResponse = await fetch(`${baseUrl}/api/platform/guide-cat`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-sonnet',
      }),
    });
    assert.equal(updateResponse.status, 200);

    const lobbyBundle = await waitForGuideCatAssistSurface(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault,
    );
    const newChatBundle = await waitForGuideCatAssistSurface(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_SCOPE_KEYS.chatNewDefault,
    );

    assert.ok(lobbyBundle.prompt);
    assert.ok(lobbyBundle.catalog.greetings.some(item => item.origin === 'catlas'));
    assert.ok(newChatBundle.prompt);
  });
});

test('PUT /api/platform/guide-cat refreshes generated assist immediately when its binding changes', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config) => {
    const setup = await fetch(`${baseUrl}/api/platform/setup/complete`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TEST_ADMIN_CREDENTIALS, ownerDisplayName: 'Kenny', createGuideCat: true, guideCatProvider: 'claude', guideCatModel: 'claude-sonnet' }) });
    assert.equal(setup.status, 200);
    const first = await waitForGuideCatAssistSurface(config.chatStatePath, GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault);
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    const update = await fetch(`${baseUrl}/api/platform/guide-cat`, { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'codex', model: 'gpt-5.4' }) });
    assert.equal(update.status, 200);
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    const current = await readCatlasCatalog(config.chatStatePath);
    assert.notEqual(current.surfaces[GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault].prompt.refreshContextHash, first.prompt.refreshContextHash);
  });
});

test('PATCH /api/platform/guide-cat status=active generates assist after restore', async () => {
  const runtime = createRuntimeStub({ reachable: false });
  await withServer(runtime, async (baseUrl, config) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        createGuideCat: true,
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
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);

    const newChatBundle = await waitForGuideCatAssistSurface(
      config.chatStatePath,
      GUIDE_CAT_ASSIST_SCOPE_KEYS.chatNewDefault,
    );
    assert.ok(newChatBundle.prompt);
  });
});

test('PUT /api/platform/guide-cat rejects guide cat name overrides', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
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

    assert.equal(updateResponse.status, 400);
    const payload = await updateResponse.json();
    assert.equal(
      payload.error?.message,
      'Unexpected name field. Guide Cat name is system-managed.',
    );
  });
});

test('GET /api/app-shell treats legacy active chat state as setup-complete even when setupCompleteAt is missing', async () => {
  const chatStore = new MemoryChatStore();
  const seeded = createCat(
    await chatStore.read(),
    {
      name: 'Boss Cat',
      provider: 'claude',
      group: 'admin',
    },
    new Date('2026-03-25T00:00:00.000Z'),
  );
  await chatStore.write(seeded);

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(payload.setupCompleteAt, 'legacy active state should not be forced back into setup');
    assert.ok(payload.chat.cats.some((cat) => cat.group === 'admin'), 'boss cat should remain visible');
  }, chatStore);
});

test('feedback records only known workspace basis IDs and never returns or refetches the app shell', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, config, chatStore) => {
    const setup = await fetch(`${baseUrl}/api/platform/setup/complete`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TEST_ADMIN_CREDENTIALS, ownerDisplayName: 'Kenny', createGuideCat: true }) });
    assert.equal(setup.status, 200);
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    const { upsertCoreProject } = await import('../build/server/core/model/index.js');
    await chatStore.updateCore(core => upsertCoreProject(core, { id: 'project-fixture', title: 'Feedback target', status: 'active' }, TEST_NOW).core);
    const before = await fetch(`${baseUrl}/api/catlas-assist/signals`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeKey: GUIDE_CAT_ASSIST_SCOPE_KEYS.chatNewDefault, basisIds: ['unknown'], event: 'dismissed' }) });
    assert.equal(before.status, 200);
    const response = await fetch(`${baseUrl}/api/catlas-assist/signals`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeKey: GUIDE_CAT_ASSIST_SCOPE_KEYS.chatNewDefault, basisIds: ['project-fixture'], event: 'dismissed' }) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    const { readCatlasSignals } = await import('../build/server/shared/guideCatCurationStore.js');
    const signals = await readCatlasSignals(config.chatStatePath);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].id, 'project-fixture');
    const invalid = await fetch(`${baseUrl}/api/catlas-assist/signals`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeKey: GUIDE_CAT_ASSIST_SCOPE_KEYS.chatNewDefault, basisIds: [], event: 'dismissed', prompt: 'cannot write content' }) });
    assert.equal(invalid.status, 400);
  });
});
