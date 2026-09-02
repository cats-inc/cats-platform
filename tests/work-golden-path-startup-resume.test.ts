/**
 * Startup resume for stranded golden-path runs (SPEC-114 FR-14, FR-29).
 *
 * The failure this closes: the host dies mid-run, the Core record survives, and
 * the owner waits forever for a message nobody is going to send. The risk it
 * introduces is the opposite one — a sweep that re-drives finished work, or
 * work that was never the golden path's to touch — so most of these tests are
 * about what it must leave alone.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import type { CoreRunStatus } from '../src/core/types.js';
import { resumeGoldenPathRuns } from '../src/app/server/goldenPathStartupResume.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';
import {
  createWorkGoldenPathRunner,
  type WorkGoldenPathRunOutcome,
  type WorkGoldenPathRunner,
  type WorkGoldenPathStepResult,
} from '../src/products/work/state/workGoldenPathRunner.js';

const BINDING_ID = 'binding-startup-test';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';
const COMMIT = {
  commitId: 'a1b2c3d4e5f6',
  changeSummary: 'Added the entry',
  validation: { command: 'runtime repo status: worktree clean at the new HEAD', passed: true },
};

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/startup-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
}

function createHarness(): Harness {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const outbox = createTransportWorkOutbox({
    send: async () => ({ ok: true, externalMessageRef: 'tg-1' }),
  });
  return { coreStore, outbox, service: createWorkGoldenPathService({ coreStore, outbox }) };
}

async function admit(
  harness: Harness,
  suffix = '1',
): Promise<{ workItemId: string; runId: string }> {
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: `conversation-startup-${suffix}`,
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: 'tg-chat-1',
    externalUpdateRef: `tg-update-${suffix}`,
    externalMessageRef: `tg-message-${suffix}`,
    goal: `Add a changelog entry (${suffix})`,
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/startup-workspace',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
  });
  const startWork = received.offers.find((offer) => offer.action === 'start_work')!;
  const authorized = await harness.service.authorize({
    callbackData: startWork.callbackData,
    bindingId: BINDING_ID,
    externalUserRef: 'tg-owner',
    ownerEventRef: `tg-callback-${suffix}`,
    readiness: READINESS,
  });
  return { workItemId: received.workItemId!, runId: authorized.admission!.runId! };
}

async function setRunStatus(
  harness: Harness,
  runId: string,
  status: CoreRunStatus,
): Promise<void> {
  await harness.coreStore.updateCore((core) => ({
    ...core,
    runs: core.runs.map((run) => (run.id === runId ? { ...run, status } : run)),
  }));
}

function successfulRunner(harness: Harness, driven: string[]): WorkGoldenPathRunner {
  return createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async (context) => {
      driven.push(context.runId);
      return {
        status: 'claims_complete',
        summary: 'Finished after the restart.',
        satisfiedCriteria: [CRITERION],
        artifact: null,
        commit: COMMIT,
        blockedReason: null,
      } satisfies WorkGoldenPathStepResult;
    },
  });
}

/** Waits for detached drives the sweep started. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

// --- What it resumes -----------------------------------------------------------

test('a run stranded in running by a restart is resumed and completes', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  // The previous host had started it and then died.
  await setRunStatus(harness, runId, 'running');

  const driven: string[] = [];
  const result = await resumeGoldenPathRuns({
    coreStore: harness.coreStore,
    runner: successfulRunner(harness, driven),
  });

  assert.deepEqual(result.resumed, [runId]);
  await settle();

  assert.deepEqual(driven, [runId], 'the stranded run got a driver');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'completed');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');
});

test('a run left queued is resumed too', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);

  const driven: string[] = [];
  const result = await resumeGoldenPathRuns({
    coreStore: harness.coreStore,
    runner: successfulRunner(harness, driven),
  });

  assert.deepEqual(result.resumed, [runId]);
  await settle();
  assert.deepEqual(driven, [runId]);
});

test('the resume is recorded so a post-restart completion can be explained (FR-50)', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  await setRunStatus(harness, runId, 'running');

  await resumeGoldenPathRuns({
    coreStore: harness.coreStore,
    runner: successfulRunner(harness, []),
  });
  await settle();

  const core = await harness.coreStore.readCore();
  const activity = core.activities.find(
    (entry) => entry.runId === runId && entry.message.includes('resumed'),
  );
  assert.ok(activity, 'the resume left an activity');
  const metadata = activity.metadata.workGoldenPathLifecycle as Record<string, unknown>;
  assert.equal(metadata.action, 'resume');
});

// --- What it must leave alone --------------------------------------------------

test('a completed run is never re-driven into a second delivery', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  await setRunStatus(harness, runId, 'completed');

  const driven: string[] = [];
  const result = await resumeGoldenPathRuns({
    coreStore: harness.coreStore,
    runner: successfulRunner(harness, driven),
  });
  await settle();

  assert.deepEqual(result.resumed, []);
  assert.equal(result.scanned, 0, 'a finished run is not even a candidate');
  assert.deepEqual(driven, []);
});

test('cancelled, failed, and blocked runs are left for the owner', async () => {
  for (const status of ['cancelled', 'failed', 'blocked'] as const) {
    const harness = createHarness();
    const { runId } = await admit(harness);
    await setRunStatus(harness, runId, status);

    const driven: string[] = [];
    const result = await resumeGoldenPathRuns({
      coreStore: harness.coreStore,
      runner: successfulRunner(harness, driven),
    });
    await settle();

    assert.deepEqual(result.resumed, [], `${status} must not be auto-resumed`);
    assert.deepEqual(driven, []);
  }
});

test('a Task created in Desktop is not this sweep\'s business', async () => {
  const harness = createHarness();
  await harness.coreStore.updateCore((core) => ({
    ...core,
    workItems: [{
      id: 'work-item-desktop',
      title: 'Made in Desktop',
      status: 'ready',
      projectId: null,
      conversationId: null,
      taskId: 'task-desktop',
      parentWorkItemId: null,
      ownerActorId: core.ownerProfile.actorId,
      assignedActorIds: [],
      summary: null,
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
      metadata: {},
    }],
    runs: [{
      id: 'run-desktop',
      title: 'Desktop run',
      status: 'running',
      conversationId: null,
      taskId: 'task-desktop',
      parentRunId: null,
      orchestratorActorId: null,
      traceId: null,
      summary: null,
      createdAt: '2026-09-02T10:00:00.000Z',
      startedAt: null,
      completedAt: null,
      updatedAt: '2026-09-02T10:00:00.000Z',
      metadata: {},
    }],
  }));

  const driven: string[] = [];
  const result = await resumeGoldenPathRuns({
    coreStore: harness.coreStore,
    runner: successfulRunner(harness, driven),
  });
  await settle();

  assert.equal(result.scanned, 0);
  assert.deepEqual(driven, []);
});

// --- Bounds and concurrency ----------------------------------------------------

test('the sweep is bounded so a crash loop cannot stampede the provider', async () => {
  const harness = createHarness();
  const runIds: string[] = [];
  for (const suffix of ['1', '2', '3']) {
    const admitted = await admit(harness, suffix);
    await setRunStatus(harness, admitted.runId, 'running');
    runIds.push(admitted.runId);
  }

  const driven: string[] = [];
  const result = await resumeGoldenPathRuns({
    coreStore: harness.coreStore,
    runner: successfulRunner(harness, driven),
    maxRuns: 2,
  });
  await settle();

  assert.equal(result.scanned, 3);
  assert.equal(result.resumed.length, 2, 'only the bound is started this boot');
  assert.equal(driven.length, 2);
  assert.ok(runIds.length === 3);
});

test('a run already being driven is joined, not driven twice', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  await setRunStatus(harness, runId, 'running');

  let steps = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => {
      steps += 1;
      await gate;
      return {
        status: 'claims_complete',
        summary: 'done',
        satisfiedCriteria: [CRITERION],
        artifact: null,
        commit: COMMIT,
        blockedReason: null,
      } satisfies WorkGoldenPathStepResult;
    },
  });

  // A Telegram retry is already driving when the sweep fires.
  const first: Promise<WorkGoldenPathRunOutcome> = runner.drive({ runId });
  await resumeGoldenPathRuns({ coreStore: harness.coreStore, runner });
  release?.();
  await first;
  await settle();

  assert.equal(steps, 1, 'the second caller joined the first rather than re-executing');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.filter((run) => run.id === runId).length, 1);
  assert.equal(core.outcomes.length, 1, 'one run, one outcome');
});
