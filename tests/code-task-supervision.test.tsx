import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type {
  RuntimeClient,
  RuntimeSessionCreateInput,
} from '../src/platform/runtime/client.ts';
import {
  bridgeCodeTaskToRuntime,
  createCodeTask,
} from '../src/products/code/state/taskExecution.ts';
import { routeCodeApi } from '../src/products/code/api/index.ts';
import { readEvidenceEvents } from '../src/platform/persistence/evidence.ts';

function createRuntimeStub(): RuntimeClient & {
  createdSessions: RuntimeSessionCreateInput[];
} {
  return {
    createdSessions: [],
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
      return {};
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
        instance: 'default',
        defaultModel: null,
        source: 'config',
        cache: null,
        models: [],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: null,
        source: 'config',
        cache: null,
        models: [],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
    async createSession(input) {
      this.createdSessions.push(input);
      return {
        id: 'runtime-session-code-1',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage() {
      return {
        segments: [],
        inputTokens: 0,
        outputTokens: 0,
        tokensUsed: 0,
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
        request: { id: 'wakeup-code-1' },
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

test('bridgeCodeTaskToRuntime creates a supervised run for Code task execution', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-code-supervision-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const created = createCodeTask(
    createDefaultCoreState(),
    {
      title: 'Patch runtime adapter',
      summary: 'Move execution behind supervision.',
      workspacePath: 'C:/repo/cats-platform',
      workspaceKind: 'user_selected',
      conversationId: 'conversation-code-supervision',
    },
    new Date('2026-04-28T01:00:00.000Z'),
  );
  const coreStore = new MemoryCoreStore(created.core);
  const runtimeClient = createRuntimeStub();
  const result = await bridgeCodeTaskToRuntime(
    coreStore,
    runtimeClient,
    {
      taskId: created.task.id,
      workspacePath: 'C:/repo/cats-platform',
      workspaceKind: 'user_selected',
      provider: 'codex',
      instance: 'native',
      model: 'gpt-5.4',
    },
    new Date('2026-04-28T01:05:00.000Z'),
    {
      evidenceDataDir: tempDir,
    },
  );
  const persisted = await coreStore.readCore();
  const run = persisted.runs.find((candidate) => candidate.id === result.runId);
  const task = persisted.tasks.find((candidate) => candidate.id === created.task.id);
  const evidence = readEvidenceEvents(tempDir, 'conversation-code-supervision');
  const runSupervision = run?.metadata.supervision as Record<string, unknown> | undefined;
  const runtimeBridge = runSupervision?.runtimeBridge as Record<string, unknown> | undefined;
  const taskExecution = task?.metadata.codeExecution as Record<string, unknown> | undefined;

  assert.ok(run);
  assert.equal(run.taskId, created.task.id);
  assert.equal(run.status, 'running');
  assert.equal(runSupervision?.source, 'code_task_execute');
  assert.equal(runtimeBridge?.status, 'started');
  assert.equal(runtimeBridge?.sessionId, 'runtime-session-code-1');
  assert.equal(runtimeBridge?.provider, 'codex');
  assert.equal(runtimeBridge?.requestedInstance, 'native');
  assert.equal(task?.status, 'in_progress');
  assert.equal(taskExecution?.latestRunId, run.id);
  assert.equal(taskExecution?.latestSessionId, 'runtime-session-code-1');
  assert.equal(result.sessionId, 'runtime-session-code-1');
  assert.equal(result.run.id, run.id);
  assert.equal(runtimeClient.createdSessions[0]?.context?.metadata?.runId, run.id);
  assert.equal(runtimeClient.createdSessions[0]?.context?.metadata?.taskId, created.task.id);
  assert.deepEqual(
    evidence.map((event) => event.payload.toolName),
    ['cats.runtime.session.create'],
  );
  assert.equal(evidence[0]?.payload.runId, run.id);
});

test('GET /api/code/tasks/:taskId includes supervised run evidence', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-code-route-supervision-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const created = createCodeTask(
    createDefaultCoreState(),
    {
      title: 'Expose Code supervision',
      summary: 'Make Code task detail inspectable.',
      workspacePath: 'C:/repo/cats-platform',
      workspaceKind: 'user_selected',
      conversationId: 'conversation-code-route-supervision',
    },
    new Date('2026-04-28T02:00:00.000Z'),
  );
  const coreStore = new MemoryCoreStore(created.core);
  const runtimeClient = createRuntimeStub();
  const bridged = await bridgeCodeTaskToRuntime(
    coreStore,
    runtimeClient,
    {
      taskId: created.task.id,
      workspacePath: 'C:/repo/cats-platform',
      workspaceKind: 'user_selected',
      provider: 'codex',
      model: 'gpt-5.4',
    },
    new Date('2026-04-28T02:05:00.000Z'),
    {
      evidenceDataDir: tempDir,
    },
  );

  let evidenceConversationId: string | null = null;
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
        readEvidenceEvents(conversationId) {
          evidenceConversationId = conversationId;
          return readEvidenceEvents(tempDir, conversationId);
        },
      },
    });

    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/code/tasks/${created.task.id}`,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(evidenceConversationId, 'conversation-code-route-supervision');
  assert.equal(payload.supervision.run.id, bridged.runId);
  assert.equal(payload.supervision.counts.evidence, 1);
  assert.equal(payload.supervision.evidence[0].toolName, 'cats.runtime.session.create');
});
