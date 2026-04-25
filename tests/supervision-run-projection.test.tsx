import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreRun,
  upsertCoreTask,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type { EvidenceEvent } from '../src/core/types.ts';
import { createWorkTaskDetailPayload } from '../src/products/work/api/index.ts';
import { buildWorkTaskDetailProjection } from '../src/products/work/api/projection.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  buildSupervisedRunInspectionProjection,
  createSupervisionPolicySnapshotRef,
  persistSupervisionPolicySnapshot,
  type SupervisionPolicySnapshot,
} from '../src/platform/supervision/index.ts';

function policySnapshot(): SupervisionPolicySnapshot {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    policyBundleVersion: 'test-policy@1',
    evaluatedAt: '2026-04-25T11:00:00.000Z',
    actionId: 'action-supervised-1',
    runId: 'run-supervised-1',
    actorRef: 'agent:boss',
    policy: {
      autonomy: 'single_step',
      taskGranularity: 'step',
      toolScope: 'broad_write',
      scaffolding: 'few_shot',
      validation: 'schema_required',
      checkpointCadence: 'every_step',
      approvalThreshold: 'high',
      fallbackPolicy: 'ask_human',
    },
    contextSummary: {
      actorRef: 'agent:boss',
      targetRef: 'work-item:supervised',
      actionType: 'tool_call',
      sideEffect: 'external_visible',
      capabilityConfidence: 'evaluated',
    },
    reasons: ['external_visible tool requires approval'],
  };
}

async function createFixtureCore() {
  let core = createDefaultCoreState();
  core = upsertCoreTask(
    core,
    {
      id: 'task-supervised-1',
      title: 'Inspect supervised run',
      status: 'in_progress',
      conversationId: 'conversation-supervised-1',
      createdAt: '2026-04-25T10:50:00.000Z',
    },
    new Date('2026-04-25T10:50:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-supervised-1',
      title: 'Supervised Work run',
      status: 'blocked',
      conversationId: 'conversation-supervised-1',
      taskId: 'task-supervised-1',
      summary: 'Waiting on a supervised approval.',
      createdAt: '2026-04-25T10:55:00.000Z',
      metadata: {
        supervision: {
          runState: {
            blockers: [
              {
                code: 'BUDGET_SOFT_LIMIT',
                message: 'Budget is near the configured soft limit.',
              },
            ],
            approvalRequests: [
              {
                requestId: 'approval-supervised-1',
                state: 'pending',
                gating: true,
              },
            ],
          },
        },
      },
    },
    new Date('2026-04-25T10:55:00.000Z'),
  ).core;

  const coreStore = new MemoryCoreStore(core);
  const snapshot = policySnapshot();
  await persistSupervisionPolicySnapshot({
    coreStore,
    snapshot,
    conversationId: 'conversation-supervised-1',
    taskId: 'task-supervised-1',
    now: () => new Date('2026-04-25T11:01:00.000Z'),
  });

  return {
    core: await coreStore.readCore(),
    snapshot,
  };
}

function evidenceEvent(snapshot: SupervisionPolicySnapshot): EvidenceEvent {
  return {
    id: 'evidence-supervised-1',
    conversationId: 'conversation-supervised-1',
    sessionId: null,
    layer: 'evidence',
    actorId: 'agent:boss',
    kind: 'system_event',
    timestamp: '2026-04-25T11:02:00.000Z',
    payload: {
      source: 'supervision_tool_boundary',
      runId: 'run-supervised-1',
      actionId: 'action-supervised-1',
      toolName: 'work.approval_gated.apply',
      status: 'pending_approval',
      approvalRequestId: 'approval-supervised-1',
      summary: 'Apply external visible change.',
      policySnapshotRef: createSupervisionPolicySnapshotRef(snapshot),
    },
  };
}

test('supervised run projection combines run state, policy snapshots, and evidence', async () => {
  const { core, snapshot } = await createFixtureCore();

  const projection = buildSupervisedRunInspectionProjection(
    core,
    'run-supervised-1',
    [evidenceEvent(snapshot)],
  );

  assert.ok(projection);
  assert.equal(projection.primaryState, 'waiting_for_approval');
  assert.deepEqual(projection.blockers.map((blocker) => blocker.code), ['BUDGET_SOFT_LIMIT']);
  assert.equal(projection.approvalRequests[0]?.requestId, 'approval-supervised-1');
  assert.equal(projection.latestPolicySnapshot?.snapshot.actionId, 'action-supervised-1');
  assert.deepEqual(
    projection.latestPolicySnapshot?.snapshotRef,
    createSupervisionPolicySnapshotRef(snapshot),
  );
  assert.equal(projection.evidence[0]?.toolName, 'work.approval_gated.apply');
  assert.equal(projection.evidence[0]?.status, 'pending_approval');
  assert.deepEqual(projection.counts, {
    policySnapshots: 1,
    evidence: 1,
    pendingApprovals: 1,
    rejectedActions: 0,
  });
});

test('Work task detail projection exposes supervised latest-run inspection', async () => {
  const { core, snapshot } = await createFixtureCore();
  const task = core.tasks.find((candidate) => candidate.id === 'task-supervised-1');
  assert.ok(task);

  const detail = buildWorkTaskDetailProjection(core, task, [evidenceEvent(snapshot)]);
  const payload = createWorkTaskDetailPayload(
    core,
    'task-supervised-1',
    [evidenceEvent(snapshot)],
  );

  assert.equal(detail.supervision?.run.id, 'run-supervised-1');
  assert.equal(detail.supervision?.primaryState, 'waiting_for_approval');
  assert.equal(detail.supervision?.counts.policySnapshots, 1);
  assert.equal(detail.supervision?.counts.evidence, 1);
  assert.equal(payload?.supervision?.evidence[0]?.eventId, 'evidence-supervised-1');
});
