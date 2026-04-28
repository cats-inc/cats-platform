import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { readEvidenceEvents } from '../src/platform/persistence/evidence.ts';
import { CatsRuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigYaml,
} from '../src/platform/supervision/providerCapabilityBootstrapYaml.ts';
import { routeCodeApi } from '../src/products/code/api/index.ts';

const RUN_LIVE_PROVIDER_SMOKE = process.env.CATS_CODE_LIVE_PROVIDER_SMOKE === '1';
const LIVE_PROVIDER_IDS = (process.env.CATS_CODE_LIVE_PROVIDERS ?? 'claude,codex')
  .split(',')
  .map((provider) => provider.trim())
  .filter((provider) => provider.length > 0);
const PLAN_080_BOOTSTRAP_FIXTURE_URL =
  new URL('./fixtures/provider-capability-bootstrap.yaml', import.meta.url);
const PLAN_080_BOOTSTRAP_FIXTURE_PATH = fileURLToPath(PLAN_080_BOOTSTRAP_FIXTURE_URL);

test(
  'live Claude/Codex Code paths run through supervision',
  {
    skip: RUN_LIVE_PROVIDER_SMOKE
      ? false
      : 'Set CATS_CODE_LIVE_PROVIDER_SMOKE=1 to run live cats-runtime provider smoke.',
    timeout: 180_000,
  },
  async (t) => {
    assert.ok(LIVE_PROVIDER_IDS.length > 0, 'expected at least one live provider id');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-code-live-provider-smoke-'));
    t.after(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    const config = {
      ...loadConfig({
        ...process.env,
        CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG: PLAN_080_BOOTSTRAP_FIXTURE_PATH,
      }),
      chatStatePath: tempDir,
    };
    const bootstrapResult = parseProviderCapabilityBootstrapConfigYaml(
      readFileSync(PLAN_080_BOOTSTRAP_FIXTURE_PATH, 'utf8'),
      {
        observedAt: new Date().toISOString(),
        configPath: PLAN_080_BOOTSTRAP_FIXTURE_PATH,
      },
    );
    assert.ok(
      bootstrapResult.config,
      bootstrapResult.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
    );
    assert.equal(config.providerCapabilityBootstrapConfigPath, PLAN_080_BOOTSTRAP_FIXTURE_PATH);
    const runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
      apiKey: config.runtimeApiKey,
      timeoutMs: 120_000,
      providerRegistryTimeoutMs: 120_000,
    });
    const health = await runtimeClient.getHealth();
    assert.equal(health.reachable, true, health.error ?? 'cats-runtime must be reachable');

    const coreStore = new MemoryCoreStore(createDefaultCoreState());
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
          config,
          evidenceDataDir: tempDir,
          readEvidenceEvents(conversationId) {
            return readEvidenceEvents(tempDir, conversationId);
          },
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

    for (const provider of LIVE_PROVIDER_IDS) {
      const createTaskResponse = await fetch(`${baseUrl}/api/code/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `Live ${provider} supervised task`,
          summary: 'Live provider smoke for supervised Code task execute.',
          workspacePath: process.cwd(),
          workspaceKind: 'user_selected',
          conversationId: `live-code-task-${provider}`,
        }),
      });
      assert.equal(createTaskResponse.status, 201);
      const createTaskPayload = await createTaskResponse.json();
      const taskId = createTaskPayload.task.task.id;

      const executeResponse = await fetch(`${baseUrl}/api/code/tasks/${taskId}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspacePath: process.cwd(),
          workspaceKind: 'user_selected',
          provider,
        }),
      });
      const executePayload = await executeResponse.json();
      assert.equal(executeResponse.status, 200);
      assert.equal(executePayload.task.supervision.run.id, executePayload.runId);
      assert.equal(
        executePayload.task.supervision.run.metadata.supervision.runtimeBridge.provider,
        provider,
      );
      await runtimeClient.closeSession(executePayload.sessionId);
    }

    const createRelayResponse = await fetch(`${baseUrl}/api/code/relay/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Live supervised relay',
        objective: 'Live provider smoke for supervised Code relay fan-out.',
        repoPath: process.cwd(),
      }),
    });
    assert.equal(createRelayResponse.status, 201);
    let relayPayload = await createRelayResponse.json();
    const thread = relayPayload.threads[0];
    const targetRoster = thread.roster.slice(0, LIVE_PROVIDER_IDS.length);

    for (const [index, provider] of LIVE_PROVIDER_IDS.entries()) {
      const rosterEntry = targetRoster[index];
      assert.ok(rosterEntry, `missing relay roster entry for ${provider}`);
      const patchResponse = await fetch(
        `${baseUrl}/api/code/relay/threads/${thread.thread.id}/roster/${rosterEntry.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider,
            instance: null,
            model: null,
          }),
        },
      );
      assert.equal(patchResponse.status, 200);
      relayPayload = await patchResponse.json();
    }

    const selectedThread = relayPayload.threads[0];
    const fanOutResponse = await fetch(
      `${baseUrl}/api/code/relay/threads/${selectedThread.thread.id}/fan-out`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'discover',
          objective: 'Live smoke',
          prompt: 'Reply with one short sentence confirming this supervised Code relay smoke.',
          agentIds: selectedThread.roster.slice(0, LIVE_PROVIDER_IDS.length).map((entry) => entry.id),
        }),
      },
    );
    assert.equal(fanOutResponse.status, 202);
    relayPayload = await fanOutResponse.json();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (relayPayload.threads[0].thread.status === 'waiting_for_user') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const refreshResponse = await fetch(`${baseUrl}/api/code/relay/threads`);
      assert.equal(refreshResponse.status, 200);
      relayPayload = await refreshResponse.json();
    }

    const settledRound = relayPayload.threads[0].rounds[0];
    const dispatchSummary = settledRound.dispatches.map((dispatch) => ({
      agentId: dispatch.agentId,
      runId: dispatch.runId,
      status: dispatch.status,
      error: dispatch.error,
    }));
    assert.equal(relayPayload.threads[0].thread.status, 'waiting_for_user');
    assert.equal(settledRound.dispatches.length, LIVE_PROVIDER_IDS.length);
    assert.equal(
      settledRound.dispatches.every((dispatch) => dispatch.status === 'completed'),
      true,
      JSON.stringify(dispatchSummary, null, 2),
    );
    assert.equal(
      settledRound.dispatches.every((dispatch) => typeof dispatch.runId === 'string'),
      true,
      JSON.stringify(dispatchSummary, null, 2),
    );
  },
);
