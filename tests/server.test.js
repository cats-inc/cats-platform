import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { UUID_PATTERN } from '../dist-server/shared/channelPaths.js';
import { createSharedCoreFixtureBundle } from '../dist-server/shared/core.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  setChannelCatLease,
} from '../dist-server/chat/model.js';
import {
  createCatsMemoryService,
  MemoryCanonicalMemoryStore,
} from '../dist-server/platform/memory/index.js';
import { createChatMemorySurface } from '../dist-server/products/chat/state/memoryAdapter.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let nextSession = 1;
  let nextWakeup = 1;
  return {
    createdSessions: [],
    sentMessages: [],
    closedSessions: [],
    wakeups: [],
    streamedSessions: [],
    observedSessionPayloads: new Map(),
    setObservedSession(sessionId, payload) {
      this.observedSessionPayloads.set(sessionId, payload);
    },
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
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        entries: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        presets: [
          {
            id: 'balanced',
            label: 'Balanced',
            availability: 'supported',
            applicableEntryIds: [`${provider}-default`],
            preferredEntryId: `${provider}-default`,
            controlDefaults: {
              'openai.reasoning_effort': 'medium',
            },
          },
        ],
        controls: [
          {
            key: 'openai.reasoning_effort',
            label: 'Reasoning effort',
            kind: 'enum',
            scope: 'session_default',
            values: [
              { value: 'low', label: 'low' },
              { value: 'medium', label: 'medium' },
              { value: 'high', label: 'high' },
            ],
          },
        ],
        defaultSelection: {
          entryMode: 'auto',
          entryId: `${provider}-default`,
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'medium',
          },
        },
        support: {
          tier: 'entry_only',
        },
        warnings: [],
      };
    },
    async createSession(input) {
      const session = {
        id: `session-${nextSession++}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? 'C:/chat/runtime',
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: content.includes('Agent-1')
          ? 'Agent-1 handled the routed turn.'
          : 'Orchestrator acknowledged the chat request.',
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async createWakeup(input) {
      const request = {
        id: `wakeup-${nextWakeup++}`,
        scheduleAt: input.scheduleAt ?? null,
        target: input.target,
        metadata: input.metadata ?? {},
      };
      this.wakeups.push({
        ...input,
        request,
      });
      return {
        request,
        coalesced: false,
      };
    },
    async observeSession(sessionId) {
      return this.observedSessionPayloads.get(sessionId) ?? {
        session: {
          id: sessionId,
          inspection: {
            state: 'idle',
          },
        },
        observePath: `/sessions/${sessionId}/observe`,
        stream: {
          path: `/sessions/${sessionId}/stream`,
          available: false,
        },
      };
    },
    async streamSession(sessionId, onEvent) {
      this.streamedSessions.push(sessionId);
      const payload = this.observedSessionPayloads.get(sessionId);
      const events = Array.isArray(payload?.stream?.events) ? payload.stream.events : [];
      for (const event of events) {
        await onEvent(event);
      }
    },
  };
}

async function withServer(
  runtimeClient,
  callback,
  chatStore = new MemoryChatStore(),
  overrides = {},
) {
  const {
    startup,
    coreStore,
    resumePendingOrchestratorDispatch,
    work,
    code,
    ...chatOverrides
  } = overrides;
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-03-11T00:00:00.000Z'),
      startup,
      coreStore,
      resumePendingOrchestratorDispatch,
    },
    chat: {
      chatStore,
      ...chatOverrides,
    },
    work,
    code,
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

test('GET /health reports runtime reachability', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.service, 'cats');
    assert.equal(payload.status, 'ok');
    assert.equal(payload.readiness.ready, true);
    assert.equal(payload.readiness.endpoint, '/health');
    assert.equal(payload.contract.startup, 1);
    assert.ok(Array.isArray(payload.contract.supportedModes));
    assert.equal(payload.startup.mode, 'standalone');
    assert.equal(payload.startup.phase, 'ready');
    assert.equal(payload.shutdown.stdinCloseEnabled, false);
    assert.equal(payload.runtime.service, 'cats-runtime');
  });
});

test('GET /api/providers/:provider/models/advanced returns the runtime advanced catalog additively', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/codex/models/advanced`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.provider, 'codex');
    assert.equal(payload.catalog.defaultSelection.entryMode, 'auto');
    assert.equal(payload.catalog.defaultSelection.presetId, 'balanced');
    assert.equal(payload.catalog.presets[0].availability, 'supported');
    assert.deepEqual(payload.catalog.controls[0].values, [
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
    ]);
  });
});

test('cat durable-memory writes stay successful when canonical sync fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox() {
      throw new Error('canonical cat sync failed');
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile(input) {
      return baseMemoryService.flushOwnerProfile(input);
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Memory Cat',
        provider: 'claude',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const { cat } = await createCatResponse.json();

    const createMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'fact',
        content: 'Memory Cat likes rooftop naps.',
      }),
    });
    assert.equal(createMemoryResponse.status, 201);

    const listMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory`);
    assert.equal(listMemoryResponse.status, 200);
    const listMemoryPayload = await listMemoryResponse.json();
    assert.equal(listMemoryPayload.records.length, 1);
    assert.equal(listMemoryPayload.records[0].content, 'Memory Cat likes rooftop naps.');
  }, chatStore, { memoryService: failingMemoryService });
});

test('owner-profile writes stay successful when canonical sync fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox(input) {
      return baseMemoryService.flushCompanionBox(input);
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile() {
      throw new Error('canonical owner sync failed');
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Resilient Owner',
      }),
    });
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Resilient Owner');

    const coreState = await chatStore.readCore();
    assert.equal(coreState.ownerProfile.displayName, 'Resilient Owner');
  }, chatStore, { memoryService: failingMemoryService });
});

test('owner durable-memory writes stay successful when canonical sync fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox(input) {
      return baseMemoryService.flushCompanionBox(input);
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile() {
      throw new Error('canonical owner sync failed');
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'style',
        content: 'Owner prefers concise updates.',
      }),
    });
    assert.equal(createMemoryResponse.status, 201);
    const { memory } = await createMemoryResponse.json();

    const updateMemoryResponse = await fetch(`${baseUrl}/api/owner/memory/${memory.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Owner prefers bullet summaries.',
      }),
    });
    assert.equal(updateMemoryResponse.status, 200);

    const deleteMemoryResponse = await fetch(`${baseUrl}/api/owner/memory/${memory.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteMemoryResponse.status, 200);

    const listMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`);
    assert.equal(listMemoryResponse.status, 200);
    const listMemoryPayload = await listMemoryResponse.json();
    assert.equal(listMemoryPayload.records.length, 0);
  }, chatStore, { memoryService: failingMemoryService });
});

test('GET /api/app-shell exposes detailed chat state with global cats', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats');
    assert.equal(payload.chat.name, 'Chat');
    assert.equal(payload.chat.selectedChannelId, '');
    assert.equal(payload.chat.channels.length, 0);
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.chat.selectedChannel, null);
    assert.equal(payload.chat.capabilities.mentions, 'basic');
    assert.equal(payload.chat.capabilities.transcriptExport, true);
  });
});

test('GET /api/core endpoints expose the shared Cats Core contract', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.version, 5);
    assert.equal(statePayload.ownerProfile.actorId, 'actor-owner');
    assert.ok(Array.isArray(statePayload.actors));
    assert.ok(Array.isArray(statePayload.conversations));
    assert.ok(Array.isArray(statePayload.projects));
    assert.ok(Array.isArray(statePayload.workItems));
    assert.ok(Array.isArray(statePayload.tasks));
    assert.ok(Array.isArray(statePayload.runs));
    assert.ok(Array.isArray(statePayload.traces));
    assert.ok(Array.isArray(statePayload.checkpoints));
    assert.ok(Array.isArray(statePayload.outcomes));
    assert.ok(Array.isArray(statePayload.artifacts));
    assert.ok(Array.isArray(statePayload.activities));
    assert.ok(Array.isArray(statePayload.approvalBindings));

    const actorsResponse = await fetch(`${baseUrl}/api/core/actors`);
    assert.equal(actorsResponse.status, 200);
    const actorsPayload = await actorsResponse.json();
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'owner'));
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'orchestrator'));

    const approvalsResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsResponse.status, 200);
    const approvalsPayload = await approvalsResponse.json();
    assert.ok(Array.isArray(approvalsPayload.approvals));
    assert.equal(approvalsPayload.approvals.length, 0);

    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`);
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Owner');
  });
});

test('core write APIs persist shared project, work, approval, trace, artifact, and owner records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Boss Owner',
        decisionPreferences: ['show options first'],
      }),
    });
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Boss Owner');

    const ownerCanonicalResponse = await fetch(`${baseUrl}/api/owner/memory/canonical`);
    assert.equal(ownerCanonicalResponse.status, 200);
    const ownerCanonicalPayload = await ownerCanonicalResponse.json();
    assert.ok(
      ownerCanonicalPayload.records.some((record) =>
        record.origin.kind === 'owner_profile'
        && record.content === 'show options first',
      ),
    );

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          ...fixtures.task,
          parentTaskId: 'task-parent-suite',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.task.id, fixtures.task.id);
    assert.equal(taskPayload.task.parentTaskId, 'task-parent-suite');

    const projectResponse = await fetch(`${baseUrl}/api/core/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ project: fixtures.project }),
    });
    assert.equal(projectResponse.status, 201);

    const workItemResponse = await fetch(`${baseUrl}/api/core/work-items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ workItem: fixtures.workItem }),
    });
    assert.equal(workItemResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(fixtures.approvalDecision),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalPayload = await approvalResponse.json();
    assert.equal(approvalPayload.task.approval.status, 'pending');
    assert.equal(approvalPayload.queueItem.taskId, fixtures.task.id);

    const traceResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ trace: fixtures.trace }),
    });
    assert.equal(traceResponse.status, 201);
    const tracePayload = await traceResponse.json();
    assert.equal(tracePayload.trace.id, fixtures.trace.id);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ checkpoint: fixtures.checkpoint }),
    });
    assert.equal(checkpointResponse.status, 201);
    const checkpointPayload = await checkpointResponse.json();
    assert.equal(checkpointPayload.checkpoint.id, fixtures.checkpoint.id);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ run: fixtures.run }),
    });
    assert.equal(runResponse.status, 201);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.run.id, fixtures.run.id);

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ outcome: fixtures.outcome }),
    });
    assert.equal(outcomeResponse.status, 201);
    const outcomePayload = await outcomeResponse.json();
    assert.equal(outcomePayload.outcome.id, fixtures.outcome.id);

    const artifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ artifact: fixtures.artifact }),
    });
    assert.equal(artifactResponse.status, 201);

    const activityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(activityResponse.status, 201);

    const approvalBindingResponse = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approvalBinding: fixtures.approvalBinding }),
    });
    assert.equal(approvalBindingResponse.status, 201);

    const approvalsListResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsListResponse.status, 200);
    const approvalsListPayload = await approvalsListResponse.json();
    assert.equal(approvalsListPayload.approvals.length, 1);

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.ownerProfile.displayName, 'Boss Owner');
    assert.ok(statePayload.projects.some((project) => project.id === fixtures.project.id));
    assert.ok(statePayload.workItems.some((workItem) => workItem.id === fixtures.workItem.id));
    assert.ok(statePayload.tasks.some((task) => task.id === fixtures.task.id));
    assert.equal(
      statePayload.tasks.find((task) => task.id === fixtures.task.id)?.parentTaskId,
      'task-parent-suite',
    );
    assert.ok(statePayload.runs.some((run) => run.id === fixtures.run.id));
    assert.ok(statePayload.traces.some((trace) => trace.id === fixtures.trace.id));
    assert.ok(
      statePayload.checkpoints.some((checkpoint) => checkpoint.id === fixtures.checkpoint.id),
    );
    assert.ok(statePayload.outcomes.some((outcome) => outcome.id === fixtures.outcome.id));
    assert.ok(statePayload.artifacts.some((artifact) => artifact.id === fixtures.artifact.id));
    assert.ok(statePayload.activities.some((activity) => activity.id === fixtures.activity.id));
    assert.ok(
      statePayload.approvalBindings.some(
        (approvalBinding) => approvalBinding.id === fixtures.approvalBinding.id,
      ),
    );
  }, chatStore);
});

test('approved task assignment queues runtime wakeups for active assigned cat sessions', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-24T01:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Coder Cat',
      provider: 'claude',
      roles: ['coder'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Spec 032 Task Flow',
      topic: 'Wire approved task assignment into runtime wakeups.',
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  state = setChannelCatLease(
    state,
    channelId,
    catId,
    {
      sessionId: 'session-coder',
      status: 'ready',
      cwd: 'C:/repo/cats',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: seededAt.toISOString(),
      lastUsedAt: seededAt.toISOString(),
    },
    seededAt,
  );
  await chatStore.write(state);
  const core = await chatStore.readCore();
  const conversationId = core.conversations.find((candidate) => candidate.sourceChannelId === channelId)?.id;
  assert.ok(conversationId);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-runtime-wakeup',
          title: 'Implement the task lifecycle hook',
          status: 'approved',
          conversationId,
          assignedActorIds: [`actor-cat-${catId}`],
        },
      }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.task.id, 'task-runtime-wakeup');
    assert.equal(payload.wakeups.length, 1);
    assert.equal(payload.wakeups[0].request.target.sessionId, 'session-coder');
    assert.equal(runtime.wakeups.length, 1);
    assert.equal(runtime.wakeups[0].metadata.taskId, 'task-runtime-wakeup');
    assert.equal(payload.activities.length, 1);
    assert.match(payload.activities[0].message, /queued runtime wakeup/i);

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    const task = statePayload.tasks.find((candidate) => candidate.id === 'task-runtime-wakeup');
    assert.ok(task);
    assert.equal(task.metadata.taskLifecycle.wakeups.length, 1);
    assert.equal(task.metadata.taskLifecycle.wakeups[0].sessionId, 'session-coder');
  }, chatStore);
});

test('task checkout creates a run and reconciles runtime completion back into core state', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  runtime.setObservedSession('session-task-1', {
    session: {
      id: 'session-task-1',
      inspection: {
        state: 'idle',
        lastRun: {
          id: 'runtime-run-1',
          status: 'succeeded',
          startedAt: '2026-03-24T02:00:00.000Z',
          endedAt: '2026-03-24T02:01:00.000Z',
          resultSummary: 'Implemented the requested task.',
          usage: {
            inputTokens: 11,
            outputTokens: 7,
          },
        },
      },
    },
    observePath: '/sessions/session-task-1/observe',
    stream: {
      path: '/sessions/session-task-1/stream',
      available: true,
      events: [
        {
          event: 'result',
          data: {
            type: 'result',
          },
        },
        {
          event: 'session_closed',
          data: {
            type: 'session_closed',
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-checkout-runtime',
          title: 'Run task checkout',
          status: 'approved',
          assignedActorIds: ['actor-cat-runtime'],
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const checkoutResponse = await fetch(`${baseUrl}/api/core/tasks/task-checkout-runtime/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        actorId: 'actor-cat-runtime',
        sessionId: 'session-task-1',
      }),
    });
    assert.equal(checkoutResponse.status, 200);
    const checkoutPayload = await checkoutResponse.json();
    assert.equal(checkoutPayload.task.status, 'in_progress');
    assert.equal(checkoutPayload.run.status, 'running');
    assert.equal(checkoutPayload.watcherStarted, true);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    const task = statePayload.tasks.find((candidate) => candidate.id === 'task-checkout-runtime');
    const run = statePayload.runs.find((candidate) => candidate.id === checkoutPayload.run.id);
    const completionActivity = statePayload.activities.find((candidate) =>
      candidate.taskId === 'task-checkout-runtime'
      && /completed/i.test(candidate.message));

    assert.ok(task);
    assert.equal(task.status, 'completed');
    assert.ok(run);
    assert.equal(run.status, 'completed');
    assert.equal(run.metadata.runtimeRunStatus, 'succeeded');
    assert.ok(completionActivity);
    assert.ok(runtime.streamedSessions.includes('session-task-1'));
  }, chatStore);
});

test('core approval write returns 409 for invalid terminal-to-pending transition', async () => {
  const chatStore = new MemoryChatStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-system-invalid-transition',
          title: 'Invalid transition guard',
          status: 'pending_approval',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const pendingResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'pending',
      }),
    });
    assert.equal(pendingResponse.status, 200);

    const approvedResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(approvedResponse.status, 200);

    const invalidResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'pending',
      }),
    });
    assert.equal(invalidResponse.status, 409);
    const invalidPayload = await invalidResponse.json();
    assert.equal(invalidPayload.error.code, 'approval_transition_invalid');
  }, chatStore);
});

test('core approval write supports reroute actions and records the decision activity', async () => {
  const chatStore = new MemoryChatStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-system-reroute',
          title: 'Reroute approval contract',
          status: 'pending_approval',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const pendingResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-reroute',
        status: 'pending',
      }),
    });
    assert.equal(pendingResponse.status, 200);

    const rerouteResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-reroute',
        status: 'rejected',
        action: 'reroute',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(rerouteResponse.status, 200);
    const reroutePayload = await rerouteResponse.json();
    assert.equal(reroutePayload.task.status, 'draft');
    assert.equal(reroutePayload.approval.status, 'rejected');
    assert.equal(reroutePayload.approval.decisionAction, 'reroute');
    assert.equal(reroutePayload.activity.kind, 'approval_decided');
    assert.match(reroutePayload.activity.message, /requested a reroute/i);
    assert.equal(reroutePayload.governanceSummary.approval.pending, false);
    assert.equal(reroutePayload.governanceSummary.approval.latestDecisionAction, 'reroute');
  }, chatStore);
});

test('core operator actions annotate blocked runs and append operator activity records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          ...fixtures.run,
          status: 'blocked',
        },
      }),
    });
    await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ checkpoint: fixtures.checkpoint }),
    });
    await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ outcome: fixtures.outcome }),
    });

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: fixtures.task.id,
        runId: fixtures.run.id,
        checkpointId: fixtures.checkpoint.id,
        outcomeId: fixtures.outcome.id,
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'retry');
    assert.equal(operatorActionPayload.run.id, fixtures.run.id);
    assert.equal(operatorActionPayload.task.id, fixtures.task.id);
    assert.equal(operatorActionPayload.governanceSummary.latestOperatorAction.kind, 'retry');

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    const statePayload = await stateResponse.json();
    const run = statePayload.runs.find((candidate) => candidate.id === fixtures.run.id);
    const activity = statePayload.activities.find(
      (candidate) =>
        candidate.kind === 'operator_action'
        && candidate.runId === fixtures.run.id,
    );

    assert.equal(run.metadata.operatorRetryRequestedBy, 'actor-owner');
    assert.ok(typeof run.metadata.operatorRetryRequestedAt === 'string');
    assert.ok(activity);
    assert.equal(activity.metadata.action, 'retry');
  }, chatStore);
});

test('core acknowledge actions use acknowledged metadata keys and append operator activity records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          ...fixtures.run,
          status: 'blocked',
        },
      }),
    });

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'acknowledge',
        actorId: 'actor-owner',
        taskId: fixtures.task.id,
        runId: fixtures.run.id,
        notes: 'Owner has seen the guardrail.',
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'acknowledge');
    assert.equal(operatorActionPayload.run.id, fixtures.run.id);
    assert.equal(
      operatorActionPayload.governanceSummary.latestOperatorAction.kind,
      'acknowledge',
    );

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    const statePayload = await stateResponse.json();
    const run = statePayload.runs.find((candidate) => candidate.id === fixtures.run.id);
    const activity = statePayload.activities.find(
      (candidate) =>
        candidate.kind === 'operator_action'
        && candidate.runId === fixtures.run.id
        && candidate.metadata.action === 'acknowledge',
    );

    assert.equal(run.metadata.operatorAcknowledgedBy, 'actor-owner');
    assert.ok(typeof run.metadata.operatorAcknowledgedAt === 'string');
    assert.equal(
      run.metadata.operatorAcknowledgedNotes,
      'Owner has seen the guardrail.',
    );
    assert.equal('operatorAcknowledgeNotes' in run.metadata, false);
    assert.ok(activity);
    assert.equal(activity.metadata.action, 'acknowledge');
  }, chatStore);
});

test('core artifact and activity writes enforce non-negative sizeBytes and append-only ids', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const artifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        artifact: {
          ...fixtures.artifact,
          id: 'artifact-invalid-size',
          sizeBytes: -1,
        },
      }),
    });
    assert.equal(artifactResponse.status, 400);

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    assert.equal(taskResponse.status, 201);

    const firstActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(firstActivityResponse.status, 201);

    const duplicateActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(duplicateActivityResponse.status, 409);
    const duplicateActivityPayload = await duplicateActivityResponse.json();
    assert.equal(duplicateActivityPayload.error.code, 'activity_already_exists');
  }, chatStore);
});

test('core approval bindings require an existing approval task', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approvalBinding: fixtures.approvalBinding }),
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'task_not_found');
  }, chatStore);
});

test('GET /api/work and /api/code expose dedicated placeholder surfaces', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const workResponse = await fetch(`${baseUrl}/api/work`);
    assert.equal(workResponse.status, 200);
    const workPayload = await workResponse.json();
    assert.equal(workPayload.product.id, 'work');
    assert.equal(workPayload.product.status, 'placeholder');
    assert.equal(workPayload.product.routeBase, '/work');
    assert.equal(workPayload.summary.ownerActorId, 'actor-owner');
    assert.ok(workPayload.extensionPoints.futureRoutes.includes('/api/work/war-room'));

    const codeResponse = await fetch(`${baseUrl}/api/code`);
    assert.equal(codeResponse.status, 200);
    const codePayload = await codeResponse.json();
    assert.equal(codePayload.product.id, 'code');
    assert.equal(codePayload.product.status, 'placeholder');
    assert.equal(codePayload.product.routeBase, '/code');
    assert.equal(codePayload.summary.ownerActorId, 'actor-owner');
    assert.ok(codePayload.extensionPoints.futureRoutes.includes('/api/code/previews'));
  });
});

test('GET /api/shell/browse lists subdirectories for the folder browser modal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-folder-browser-'));
  const alphaDir = path.join(root, 'alpha');
  const betaDir = path.join(root, 'beta');
  const hiddenDir = path.join(root, '.hidden');
  const filePath = path.join(root, 'notes.txt');

  await mkdir(alphaDir);
  await mkdir(betaDir);
  await mkdir(hiddenDir);
  await writeFile(filePath, 'not a directory');

  try {
    await withServer(createRuntimeStub(), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/shell/browse?path=${encodeURIComponent(root)}`,
      );
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.equal(payload.current, root);
      assert.equal(payload.parent, path.dirname(root));
      assert.equal(payload.error, undefined);
      assert.deepEqual(
        payload.entries.map((entry) => entry.name),
        ['alpha', 'beta'],
      );
      assert.deepEqual(
        payload.entries.map((entry) => entry.path),
        [alphaDir, betaDir],
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('assigning a cat to a channel immediately creates a runtime session in the channel cwd', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Session Spawn',
        topic: 'Verify assignment spawns a session.',
        repoPath: 'C:/repo/cats',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Spawn',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0].cwd, 'C:/repo/cats');
    assert.equal(assignPayload.cat.execution.lease.sessionId, 'session-1');
    assert.equal(assignPayload.cat.execution.lease.cwd, 'C:/repo/cats');

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const sessionStartedMessage = channelPayload.channel.messages.find(
      (message) => message.metadata?.event === 'session_started' && message.metadata?.targetId === catId,
    );
    assert.ok(sessionStartedMessage);
    assert.equal(
      sessionStartedMessage.body,
      'Agent-Spawn connected to cats-runtime session session-1 (cwd: C:/repo/cats).',
    );
  });
});

test('assigning a cat forwards structured modelSelection to cats-runtime session creation', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Advanced Session Spawn',
        topic: 'Verify model selection reaches cats-runtime.',
        repoPath: 'C:/repo/cats',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Advanced',
        provider: 'codex',
        model: 'gpt-5.4',
        modelSelection: {
          entryMode: 'auto',
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'medium',
          },
        },
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'codex',
        model: 'gpt-5.4',
        modelSelection: {
          entryMode: 'auto',
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'high',
          },
        },
      }),
    });
    assert.equal(assignResponse.status, 201);

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.deepEqual(runtimeClient.createdSessions[0].modelSelection, {
      entryMode: 'auto',
      presetId: 'balanced',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
  });
});

test('assigning a cat without a channel cwd defers session creation until Boss Cat activation establishes one', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Deferred Session Spawn',
        topic: 'Wait for Boss Cat to anchor the chat first.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Deferred',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(assignPayload.cat.execution.lease.sessionId, null);
    assert.equal(assignPayload.cat.execution.lease.cwd, null);

    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 2);
    assert.equal(runtimeClient.createdSessions[0].cwd, null);
    assert.equal(runtimeClient.createdSessions[1].cwd, 'C:/chat/runtime');
    assert.equal(activatePayload.activation.results[0].targetKind, 'orchestrator');
    assert.equal(activatePayload.activation.results[1].targetKind, 'cat');
  });
});

test('PATCH /api/preferences wakes the selected Boss Chat entry participant', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Wake Boss Chat',
        topic: 'Wake the entry participant on room entry.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    assert.equal(runtimeClient.createdSessions.length, 0);

    const updatePrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, 'session-1');
    assert.equal(channelPayload.channel.status, 'active');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.reason, 'room_entry');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.status, 'completed');
    assert.equal(
      channelPayload.channel.roomRouting.lastWakeRequest.participant.participantKind,
      'orchestrator',
    );
  });
});

test('solo chats without a cwd create isolated runtime sessions', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Solo Draft',
        topic: 'Start without a repo path.',
        composerMode: 'solo',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const { channel } = await createChannelResponse.json();

    const messageResponse = await fetch(`${baseUrl}/api/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: 'Hello from solo mode',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
      }),
    });
    assert.equal(messageResponse.status, 200);
    const messagePayload = await messageResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0].workspaceKind, 'sandbox');
    assert.equal(runtimeClient.createdSessions[0].workspaceAccess, 'read_write');
    assert.equal(runtimeClient.createdSessions[0].cwd, null);
    assert.equal(messagePayload.dispatch.results[0].status, 'sent');
    assert.equal(messagePayload.dispatch.results[0].targetKind, 'orchestrator');

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channel.id}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(channelPayload.channel.composerMode, 'solo');
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, 'session-1');
    assert.equal(channelPayload.channel.orchestratorLease.status, 'ready');
  });
});

test('PATCH /api/preferences does not overwrite the last wake request when the selected room is already awake', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Wake Boss Chat',
        topic: 'Do not rewrite wake history on re-entry.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const firstPrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(firstPrefsResponse.status, 200);

    const secondPrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(secondPrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(channelPayload.channel.roomRouting.wakeHistory.length, 1);
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.status, 'completed');
    assert.equal(
      channelPayload.channel.roomRouting.lastWakeRequest.completedAt,
      '2026-03-11T00:00:00.000Z',
    );
  });
});

test('PATCH /api/preferences wakes the selected direct chat lead', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'Wake the lead cat on persisted room entry.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        leadParticipantId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const updatePrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(channelPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, null);
    assert.equal(
      channelPayload.channel.assignedCats[0].execution.lease.sessionId,
      'session-1',
    );
    assert.equal(channelPayload.channel.status, 'active');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.reason, 'room_entry');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.status, 'completed');
    assert.equal(
      channelPayload.channel.roomRouting.lastWakeRequest.participant.participantId,
      catId,
    );
  });
});

test('PATCH /api/preferences does not fall back to Boss Cat when a direct chat lead is missing', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'Do not wake Boss Cat when the direct lead is gone.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        leadParticipantId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const removeResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'DELETE',
    });
    assert.equal(removeResponse.status, 200);

    const updatePrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, null);
    assert.equal(channelPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.reason, 'room_entry');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.status, 'failed');
    assert.equal(
      channelPayload.channel.roomRouting.lastWakeRequest.participant.participantId,
      catId,
    );
    assert.match(
      channelPayload.channel.roomRouting.lastWakeRequest.error ?? '',
      /active lead Cat/i,
    );
  });
});

test('GET /api/app-shell stays read-only when booting a persisted room route', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'App shell reads should not wake runtime sessions.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        leadParticipantId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`, {
      headers: { 'x-cats-route-path': `/chats/${channelId}` },
    });
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(appShellPayload.chat.selectedChannel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(appShellPayload.chat.selectedChannel.orchestratorLease.sessionId, null);
    assert.equal(
      appShellPayload.chat.selectedChannel.assignedCats[0].execution.lease.sessionId,
      null,
    );
    assert.equal(appShellPayload.chat.selectedChannel.status, 'configured');
    assert.equal(appShellPayload.chat.selectedChannel.roomRouting.lastWakeRequest, null);
  });
});

test('re-adding a removed cat to an active chat wakes it again instead of leaving it sleeping', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Rejoin Wake',
        topic: 'Wake cats when they rejoin a live room.',
        repoPath: 'C:/repo/cats',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Rejoin',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 1);

    const firstAssignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(firstAssignResponse.status, 201);
    assert.equal(runtimeClient.createdSessions.length, 2);

    const removeResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'DELETE',
    });
    assert.equal(removeResponse.status, 200);

    const reassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(reassignResponse.status, 200);
    const reassignPayload = await reassignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 3);
    assert.equal(reassignPayload.cat.execution.lease.sessionId, 'session-3');
    assert.equal(reassignPayload.cat.execution.lease.cwd, 'C:/repo/cats');
    assert.ok(runtimeClient.closedSessions.includes('session-2'));
  });
});

test('attachment uploads sanitize names and avoid overwriting earlier files', async () => {
  const runtimeClient = createRuntimeStub();
  const tempWorkingDir = await mkdtemp(path.join(os.tmpdir(), 'cats-attachments-'));

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Attachment Uploads',
          topic: 'Verify unique attachment names.',
          repoPath: tempWorkingDir,
          skipBossCatGreeting: true,
        }),
      });
      assert.equal(createChannelResponse.status, 201);
      const createChannelPayload = await createChannelResponse.json();
      const channelId = createChannelPayload.channel.id;

      const uploadResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          files: [
            { name: 'notes.txt', data: Buffer.from('first').toString('base64') },
            { name: '../notes.txt', data: Buffer.from('second').toString('base64') },
            { name: '..', data: Buffer.from('third').toString('base64') },
          ],
        }),
      });
      assert.equal(uploadResponse.status, 200);
      const uploadPayload = await uploadResponse.json();

      assert.deepEqual(
        uploadPayload.attachments.map((attachment) => attachment.relativePath),
        [
          '.cats-attachments/notes.txt',
          '.cats-attachments/notes-2.txt',
          '.cats-attachments/attachment',
        ],
      );

      const firstContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'notes.txt'), 'utf8');
      const secondContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'notes-2.txt'), 'utf8');
      const thirdContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'attachment'), 'utf8');

      assert.equal(firstContent, 'first');
      assert.equal(secondContent, 'second');
      assert.equal(thirdContent, 'third');
    });
  } finally {
    await rm(tempWorkingDir, { recursive: true, force: true });
  }
});



