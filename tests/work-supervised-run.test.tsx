import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildApprovalQueue } from '../src/core/approvalQueue.ts';
import {
  createDefaultCoreState,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL,
  createDurableToolEvidenceSink,
  createInMemoryWorkSupervisedTools,
  createSupervisedLifecycleTools,
  createSupervisedToolRegistry,
  createToolBoundary,
  applySupervisionApprovalDecision,
  persistSupervisionApprovalRequest,
  persistSupervisionPolicySnapshot,
  type BudgetEnvelope,
  type SupervisionPolicySnapshot,
} from '../src/platform/supervision/index.ts';
import { readEvidenceEvents } from '../src/platform/persistence/evidence.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';
import {
  createScriptedFakeDrivingAgent,
  runFakeDrivingAgentHarness,
  type FakeAgentInput,
  type SemanticPlan,
  type UnknownToolExecutor,
} from './fakeDrivingAgentHarness.ts';

test('Work supervised run launch can be driven by a fake agent and inspected from task detail', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-work-supervised-run-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const coreStore = createWorkCoreStore();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeWorkApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore,
        now: () => new Date('2026-04-25T13:00:00.000Z'),
        readEvidenceEvents: (conversationId) => readEvidenceEvents(tempDir, conversationId),
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const launchResponse = await fetch(
    `${baseUrl}/api/work/tasks/task-fake-agent/supervised-run`,
    { method: 'POST' },
  );
  const launchPayload = await launchResponse.json();

  assert.equal(launchResponse.status, 201);
  assert.equal(launchPayload.run.status, 'queued');

  const queuedCore = await coreStore.readCore();
  const queuedRun = queuedCore.runs.find((candidate) => candidate.id === launchPayload.run.id);
  assert.ok(queuedRun);
  await coreStore.writeCore(
    upsertCoreRun(
      queuedCore,
      {
        id: queuedRun.id,
        title: queuedRun.title,
        status: 'running',
      },
      new Date('2026-04-25T13:00:30.000Z'),
    ).core,
  );

  const lifecycleTools = createSupervisedLifecycleTools({
    coreStore,
    now: () => new Date('2026-04-25T13:01:00.000Z'),
  });
  const tools = createInMemoryWorkSupervisedTools({
    context: {
      goal: 'Prove Work supervised fake run path',
    },
  });
  const registry = createSupervisedToolRegistry();
  lifecycleTools.register(registry);
  tools.register(registry);
  const boundary = createToolBoundary({
    registry,
    evidenceSink: createDurableToolEvidenceSink({
      dataDir: tempDir,
      conversationId: 'conversation-fake-agent',
    }),
    now: () => '2026-04-25T13:01:00.000Z',
  });
  const executors: Record<string, UnknownToolExecutor> = {
    [SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL]: lifecycleTools.executors[
      SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL
    ] as UnknownToolExecutor,
    'work.context.lookup': tools.executors['work.context.lookup'] as UnknownToolExecutor,
    'work.local_note.apply': tools.executors['work.local_note.apply'] as UnknownToolExecutor,
    'work.approval_gated.apply': tools.executors[
      'work.approval_gated.apply'
    ] as UnknownToolExecutor,
  };
  const plan: SemanticPlan = {
    planId: 'work-agent-plan',
    steps: [
      {
        stepId: 'step-read-goal',
        target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
        toolName: 'work.context.lookup',
        args: { key: 'goal' },
      },
      {
        stepId: 'step-note',
        target: { kind: 'worker_tool', toolName: 'work.local_note.apply' },
        toolName: 'work.local_note.apply',
        args: {
          noteId: 'work-fake-agent-note',
          body: 'Fake agent selected this Work mutation.',
        },
      },
      {
        stepId: 'step-spawn-child',
        target: { kind: 'worker_tool', toolName: SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL },
        toolName: SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL,
        args: {
          title: 'Delegated fake Work child run',
          target: {
            kind: 'durable_agent',
            agentId: 'agent:worker',
            projection: 'work',
          },
          requestedBudget: {
            maxTokens: 10_000,
            maxDurationMs: 5 * 60 * 1000,
            hardStop: false,
          },
        },
      },
      {
        stepId: 'step-approval',
        target: { kind: 'worker_tool', toolName: 'work.approval_gated.apply' },
        toolName: 'work.approval_gated.apply',
        args: {
          value: 'approval-gated fake Work change',
        },
        expectation: 'pending_approval',
      },
    ],
    stopCondition: 'after_approval',
  };
  const agent = createScriptedFakeDrivingAgent({
    initialPlan: plan,
    revisions: [],
  });
  const runId = String(launchPayload.run.id);
  const runBudget = readBudgetEnvelopeFromLaunch(launchPayload);
  const policySnapshot = fakePolicySnapshot(runId);
  await persistSupervisionPolicySnapshot({
    coreStore,
    snapshot: policySnapshot,
    conversationId: 'conversation-fake-agent',
    taskId: 'task-fake-agent',
    now: () => new Date('2026-04-25T13:01:00.000Z'),
  });
  const result = await runFakeDrivingAgentHarness({
    agent,
    input: {
      runId,
      goal: 'Prove Work supervised fake run path',
      availableTools: tools.manifests,
      policySnapshot,
      contextRefs: ['goal'],
      budget: runBudget,
    } satisfies FakeAgentInput,
    boundary,
    executors,
    grantForStep: (step) =>
      step.toolName === 'work.local_note.apply'
        ? { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' }
        : step.toolName === SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL
          ? { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' }
        : step.toolName === 'work.approval_gated.apply'
          ? { parentToolScope: 'broad_write', policyToolScope: 'broad_write' }
          : { parentToolScope: 'read_only', policyToolScope: 'read_only' },
  });

  assert.equal(result.finalState, 'completed');
  assert.deepEqual(result.traces[0]?.observedStepIds, [
    'step-read-goal',
    'step-note',
    'step-spawn-child',
    'step-approval',
  ]);
  assert.equal(
    tools.state.notes.get('work-fake-agent-note')?.body,
    'Fake agent selected this Work mutation.',
  );
  assert.equal(tools.state.approvalMutations.length, 0);
  const approvalCall = result.traces[0]?.toolCalls.find((call) =>
    call.status === 'pending_approval');

  assert.equal(approvalCall?.toolName, 'work.approval_gated.apply');
  const approvalRequestId = approvalCall?.requestId;
  assert.ok(approvalRequestId);

  const approvalPersistence = persistSupervisionApprovalRequest({
    core: await coreStore.readCore(),
    runId,
    approvalRequestId,
    actionId: approvalCall?.stepId ?? 'step-approval',
    toolName: approvalCall?.toolName ?? 'work.approval_gated.apply',
    summary: 'Apply approval-gated fake Work change.',
    requestedByActorId: 'fake-agent',
    now: new Date('2026-04-25T13:02:00.000Z'),
  });
  const pendingApprovalQueue = buildApprovalQueue(approvalPersistence.core);
  const approved = writeApprovalDecision(
    approvalPersistence.core,
    {
      taskId: approvalPersistence.task.id,
      status: 'approved',
      action: 'approve',
      decidedByActorId: 'owner:local',
    },
    new Date('2026-04-25T13:03:00.000Z'),
  );
  const approvedSync = applySupervisionApprovalDecision({
    core: approved.core,
    approvalTaskId: approvalPersistence.task.id,
    fallbackPolicy: 'retry',
    now: new Date('2026-04-25T13:03:00.000Z'),
  });
  await coreStore.writeCore(approvedSync.core);
  const coreAfterFakeRun = await coreStore.readCore();
  const childRun = coreAfterFakeRun.runs.find((candidate) => candidate.parentRunId === runId);
  const childSupervision = childRun?.metadata.supervision as Record<string, unknown> | undefined;

  assert.equal(childRun?.title, 'Delegated fake Work child run');
  assert.equal(childRun?.status, 'queued');
  assert.deepEqual(childSupervision?.budget, {
    maxTokens: 10_000,
    maxDurationMs: 5 * 60 * 1000,
    hardStop: true,
  });
  assert.equal(pendingApprovalQueue[0]?.taskId, approvalPersistence.task.id);
  assert.equal(buildApprovalQueue(coreAfterFakeRun).length, 0);
  assert.equal(approvalPersistence.approvalBinding.subjectId, runId);

  const detailResponse = await fetch(`${baseUrl}/api/work/tasks/task-fake-agent`);
  const detailPayload = await detailResponse.json();

  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.supervision.run.id, runId);
  assert.equal(detailPayload.supervision.primaryState, 'running');
  assert.equal(detailPayload.supervision.counts.pendingApprovals, 0);
  assert.equal(detailPayload.supervision.counts.policySnapshots, 1);
  assert.equal(detailPayload.supervision.latestPolicySnapshot.snapshot.actionId, 'work-fake-policy');
  assert.equal(detailPayload.supervision.counts.evidence, 4);
  assert.equal(
    detailPayload.supervision.evidence[0]?.policySnapshotRef?.snapshotId,
    detailPayload.supervision.latestPolicySnapshot.snapshotRef.snapshotId,
  );
  assert.deepEqual(
    detailPayload.supervision.evidence.map((event: { status: string }) => event.status),
    ['applied', 'applied', 'applied', 'pending_approval'],
  );
  assert.equal(detailPayload.supervision.evidence[3]?.approvalRequestId !== undefined, true);
});

function createWorkCoreStore() {
  let core = createDefaultCoreState();
  core = upsertCoreTask(
    core,
    {
      id: 'task-fake-agent',
      title: 'Fake agent supervised task',
      status: 'in_progress',
      conversationId: 'conversation-fake-agent',
      createdAt: '2026-04-25T12:55:00.000Z',
    },
    new Date('2026-04-25T12:55:00.000Z'),
  ).core;

  return new MemoryCoreStore(core);
}

function fakePolicySnapshot(runId: string): SupervisionPolicySnapshot {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    policyBundleVersion: 'test-policy@work-fake',
    evaluatedAt: '2026-04-25T13:01:00.000Z',
    actionId: 'work-fake-policy',
    runId,
    actorRef: 'fake-agent',
    policy: {
      autonomy: 'outcome_delegation',
      taskGranularity: 'outcome',
      toolScope: 'broad_write',
      scaffolding: 'few_shot',
      validation: 'schema_required',
      checkpointCadence: 'milestone',
      approvalThreshold: 'high',
      fallbackPolicy: 'delegate_other',
    },
    contextSummary: {
      actorRef: 'fake-agent',
      targetRef: 'task-fake-agent',
      actionType: 'work_fake_run',
      sideEffect: 'local_state',
      capabilityConfidence: 'evaluated',
    },
    reasons: ['work fake-agent vertical slice'],
  };
}

function readBudgetEnvelopeFromLaunch(payload: unknown): BudgetEnvelope {
  const run = asRecord(asRecord(payload)?.run);
  const supervision = asRecord(asRecord(run?.metadata)?.supervision);
  const budget = asRecord(supervision?.budget);

  assert.ok(budget, 'expected launched run supervision budget');

  return {
    ...(typeof budget.maxCostUsd === 'number' ? { maxCostUsd: budget.maxCostUsd } : {}),
    ...(typeof budget.maxTokens === 'number' ? { maxTokens: budget.maxTokens } : {}),
    ...(typeof budget.maxDurationMs === 'number' ? { maxDurationMs: budget.maxDurationMs } : {}),
    ...(typeof budget.hardStop === 'boolean' ? { hardStop: budget.hardStop } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
