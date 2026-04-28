import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState, upsertCoreTask } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { readEvidenceEvents } from '../src/platform/persistence/evidence.ts';
import { CatsRuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigYaml,
} from '../src/platform/supervision/providerCapabilityBootstrapYaml.ts';
import { routeWorkApi, type WorkRuntimeTargetOverride } from '../src/products/work/api/index.ts';

const RUN_LIVE_PROVIDER_SMOKE = process.env.CATS_WORK_LIVE_PROVIDER_SMOKE === '1';
const LIVE_PROVIDER_IDS = (process.env.CATS_WORK_LIVE_PROVIDERS ?? 'claude,codex')
  .split(',')
  .map((provider) => provider.trim())
  .filter((provider) => provider.length > 0);
const LIVE_TARGETS: Record<string, { instance: string | null; model: string | null }> = {
  claude: { instance: 'native', model: 'sonnet' },
  codex: { instance: 'native', model: 'gpt-5.4' },
};
const PLAN_080_BOOTSTRAP_FIXTURE_URL =
  new URL('./fixtures/provider-capability-bootstrap.yaml', import.meta.url);
const PLAN_080_BOOTSTRAP_FIXTURE_PATH = fileURLToPath(PLAN_080_BOOTSTRAP_FIXTURE_URL);

interface WorkSupervisedRunLaunchPayload {
  created: boolean;
  run: {
    id: string;
    status: string;
    metadata: {
      supervision?: {
        runtimeBridge?: {
          provider?: string | null;
          requestedProvider?: string | null;
          sessionId?: string | null;
        };
      };
    };
  };
  supervision: {
    primaryState: string;
    counts: {
      evidence: number;
    };
    providerAgentRunLoop?: {
      latestHandoff?: {
        kind?: string;
      } | null;
      outcomes?: Array<{
        sessionId?: string | null;
      }>;
    };
  };
}

interface WorkTaskDetailPayload {
  supervision: {
    run: {
      id: string;
    };
    counts: {
      evidence: number;
    };
    providerAgentRunLoop?: {
      latestHandoff?: {
        kind?: string;
      } | null;
    };
    evidence: Array<{
      source: string;
      actionId: string | null;
    }>;
  };
  timeline: {
    view: {
      items: Array<{
        kind: string;
        summary: string | null;
        status: string | null;
        runId: string | null;
      }>;
    };
  };
}

test(
  'live Claude/Codex Work supervised runs start through supervision',
  {
    skip: RUN_LIVE_PROVIDER_SMOKE
      ? false
      : 'Set CATS_WORK_LIVE_PROVIDER_SMOKE=1 to run live cats-runtime provider smoke.',
    timeout: 180_000,
  },
  async (t) => {
    assert.ok(LIVE_PROVIDER_IDS.length > 0, 'expected at least one live provider id');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-work-live-provider-smoke-'));
    const openedSessionIds: string[] = [];
    let runtimeClient: CatsRuntimeClient | null = null;
    t.after(async () => {
      for (const sessionId of openedSessionIds) {
        await runtimeClient?.closeSession(sessionId).catch(() => {});
      }
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
    runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
      apiKey: config.runtimeApiKey,
      timeoutMs: 120_000,
      providerRegistryTimeoutMs: 120_000,
    });
    const health = await runtimeClient.getHealth();
    assert.equal(health.reachable, true, health.error ?? 'cats-runtime must be reachable');

    let core = createDefaultCoreState();
    for (const provider of LIVE_PROVIDER_IDS) {
      core = upsertCoreTask(
        core,
        {
          id: taskIdForProvider(provider),
          title: `Live ${provider} supervised Work task`,
          status: 'in_progress',
          conversationId: conversationIdForProvider(provider),
          summary: 'Live provider smoke for supervised Work task detail run.',
          createdAt: '2026-04-28T09:00:00.000Z',
        },
        new Date('2026-04-28T09:00:00.000Z'),
      ).core;
    }

    const coreStore = new MemoryCoreStore(core);
    const firstTarget = liveTargetForProvider(LIVE_PROVIDER_IDS[0]);
    const runtimeTarget: WorkRuntimeTargetOverride = {
      provider: LIVE_PROVIDER_IDS[0],
      instance: firstTarget.instance,
      model: firstTarget.model,
      cwd: process.cwd(),
    };
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const handled = await routeWorkApi({
        request,
        response,
        url,
        method: request.method ?? 'GET',
        dependencies: {
          coreStore,
          runtimeClient,
          runtimeTarget,
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
      const target = liveTargetForProvider(provider);
      runtimeTarget.provider = provider;
      runtimeTarget.instance = target.instance;
      runtimeTarget.model = target.model;
      runtimeTarget.cwd = process.cwd();

      const taskId = taskIdForProvider(provider);
      const response = await fetch(`${baseUrl}/api/work/tasks/${taskId}/supervised-run`, {
        method: 'POST',
      });
      const payload = (await response.json()) as WorkSupervisedRunLaunchPayload;
      const runtimeBridge = payload.run.metadata.supervision?.runtimeBridge;
      const sessionId = runtimeBridge?.sessionId;

      assert.equal(response.status, 201);
      assert.equal(payload.created, true);
      assert.equal(payload.run.status, 'running');
      assert.equal(payload.supervision.primaryState, 'running');
      assert.equal(runtimeBridge?.requestedProvider, provider);
      assert.equal(runtimeBridge?.provider, provider);
      assert.ok(typeof sessionId === 'string');
      openedSessionIds.push(sessionId);
      assert.equal(
        payload.supervision.providerAgentRunLoop?.latestHandoff?.kind,
        'provider_agent_seam',
      );
      assert.equal(payload.supervision.providerAgentRunLoop?.outcomes?.[0]?.sessionId, sessionId);

      const detailResponse = await fetch(`${baseUrl}/api/work/tasks/${taskId}`);
      const detailPayload = (await detailResponse.json()) as WorkTaskDetailPayload;

      assert.equal(detailResponse.status, 200);
      assert.equal(detailPayload.supervision.run.id, payload.run.id);
      assert.equal(
        detailPayload.supervision.providerAgentRunLoop?.latestHandoff?.kind,
        'provider_agent_seam',
      );
      assert.equal(detailPayload.supervision.counts.evidence, 3);
      assert.equal(
        detailPayload.supervision.evidence.some(
          (event) =>
            event.source === 'provider_agent_run_loop' &&
            event.actionId === `${payload.run.id}:runtime-message`,
        ),
        true,
      );
      assert.equal(
        detailPayload.timeline.view.items.some(
          (item) =>
            item.kind === 'trace' &&
            item.runId === payload.run.id &&
            typeof item.summary === 'string' &&
            item.summary.length > 0,
        ),
        true,
      );
      assert.equal(
        detailPayload.timeline.view.items.filter(
          (item) => item.kind === 'evidence' && item.runId === payload.run.id,
        ).length,
        3,
      );
    }
  },
);

function taskIdForProvider(provider: string): string {
  return `task-live-work-${slugForProvider(provider)}`;
}

function conversationIdForProvider(provider: string): string {
  return `conversation-live-work-${slugForProvider(provider)}`;
}

function slugForProvider(provider: string): string {
  return provider.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase();
}

function liveTargetForProvider(provider: string): { instance: string | null; model: string | null } {
  return LIVE_TARGETS[provider] ?? { instance: null, model: null };
}
