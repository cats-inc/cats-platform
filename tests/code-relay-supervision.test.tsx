import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { readEvidenceEvents } from '../src/platform/persistence/evidence.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import { routeCodeApi } from '../src/products/code/api/index.ts';

function createRuntimeStub(): RuntimeClient & {
  sentMessages: Array<{ sessionId: string; content: string }>;
} {
  const providerConfig = {
    claude: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', target: 'cli/native', backend: 'cli' }],
    },
    codex: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', target: 'cli/native', backend: 'cli' }],
    },
    gemini: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', target: 'cli/native', backend: 'cli' }],
    },
  };

  return {
    sentMessages: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
      };
    },
    async getSetupState() {
      return {
        status: 'ready',
        providers: [],
        availableCount: 0,
        providerCount: 0,
        providersReadyToApply: [],
        providersNeedingAttention: [],
      };
    },
    async getProviderConfig() {
      return providerConfig;
    },
    async getProviderDiagnostics() {
      return {
        probe: 'light',
        providers: [],
      };
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'native',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'native',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
    async createSession(input) {
      return {
        id: `session-${input.provider}-${input.instance ?? 'default'}`,
        provider: input.provider,
        model: input.model ?? `${input.provider}-default`,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      const provider = sessionId.replace(/^session-([^-]+).*/u, '$1');
      return {
        segments: [{ kind: 'text', text: `[${provider}] ${content}`, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async observeSession() {
      return { session: {} };
    },
    async streamSession() {},
    async resumeSession(sessionId) {
      return {
        id: sessionId,
        provider: 'codex',
        model: 'gpt-5.4',
        status: 'ready',
        cwd: null,
      };
    },
    async createWakeup() {
      return {
        request: { id: 'wakeup-code-relay' },
        coalesced: false,
      };
    },
    async callMcp() {
      return null;
    },
    async cancelSession() {},
    async closeSession() {},
    async deleteSession(sessionId) {
      return {
        sessionId,
        status: 'deleted',
      };
    },
  };
}

test('Code relay fan-out creates sibling supervised runs and durable evidence', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-code-relay-supervision-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const runtimeClient = createRuntimeStub();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeCodeApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore,
        runtimeClient,
        config: loadConfig({ CATS_PLATFORM_DIR: tempDir }),
        evidenceDataDir: tempDir,
        readEvidenceEvents(conversationId) {
          return readEvidenceEvents(tempDir, conversationId);
        },
        now: () => new Date('2026-04-28T03:00:00.000Z'),
      },
    });

    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const createResponse = await fetch(`${baseUrl}/api/code/relay/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Supervised relay',
      objective: 'Compare implementation paths',
      repoPath: 'C:/repo/cats-platform',
    }),
  });
  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  const thread = createPayload.threads[0];

  const fanOutResponse = await fetch(
    `${baseUrl}/api/code/relay/threads/${thread.thread.id}/fan-out`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'discover',
        objective: 'Challenge the first implementation direction',
        prompt: 'Which path is lower risk for an MVP?',
        agentIds: thread.roster.slice(0, 2).map((entry) => entry.id),
      }),
    },
  );
  assert.equal(fanOutResponse.status, 202);
  const fanOutPayload = await fanOutResponse.json();
  const round = fanOutPayload.threads[0].rounds[0];
  assert.equal(round.dispatches.length, 2);
  assert.ok(round.dispatches.every((dispatch) => typeof dispatch.runId === 'string'));

  let settledPayload = fanOutPayload;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (settledPayload.threads[0].thread.status === 'waiting_for_user') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    const refreshResponse = await fetch(`${baseUrl}/api/code/relay/threads`);
    assert.equal(refreshResponse.status, 200);
    settledPayload = await refreshResponse.json();
  }

  const core = await coreStore.readCore();
  const runs = core.runs.filter((run) =>
    (run.metadata.supervision as Record<string, unknown> | undefined)?.source === 'code_relay_fan_out');
  const budgetEnvelopeIds = runs.map((run) =>
    ((run.metadata.supervision as Record<string, unknown>).budgetEnvelope as Record<string, unknown>).id);
  const evidence = readEvidenceEvents(tempDir, `code-relay-${thread.thread.id}`);

  assert.equal(settledPayload.threads[0].thread.status, 'waiting_for_user');
  assert.equal(runs.length, 2);
  assert.ok(runs.every((run) => run.status === 'completed'));
  assert.equal(new Set(budgetEnvelopeIds).size, 1);
  assert.equal(evidence.length, 4);
  assert.equal(new Set(evidence.map((event) => event.payload.runId)).size, 2);
});
