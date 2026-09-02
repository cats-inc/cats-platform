/**
 * Timeout, retry, and resume (SPEC-114 FR-29, FR-35).
 *
 * These three all answer one question — may this Run be driven again? — and the
 * dangerous answers are the permissive ones. A completed Run must never be
 * re-driven into a second delivery, and a timed-out step must not be able to
 * come back later and overwrite what the owner was told.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';
import {
  createWorkGoldenPathRunner,
  type WorkGoldenPathStepResult,
} from '../src/products/work/state/workGoldenPathRunner.js';
import {
  applyWorkGoldenPathLifecycleAction,
} from '../src/products/work/state/workGoldenPathLifecycle.js';

const BINDING_ID = 'binding-lifecycle-test';
const CHAT_REF = 'tg-chat-88';
const OWNER_REF = 'tg-owner';
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
  workspacePath: '/tmp/lifecycle-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
  sends: Array<{ purpose: string; text: string; actions: string[] }>;
}

function createHarness(): Harness {
  const sends: Array<{ purpose: string; text: string; actions: string[] }> = [];
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const outbox = createTransportWorkOutbox({
    send: async (row) => {
      sends.push({
        purpose: row.purpose,
        text: row.payload.text,
        actions: row.payload.actions.map((action) => action.action),
      });
      return { ok: true, externalMessageRef: `tg-${sends.length}` };
    },
  });
  return { coreStore, outbox, sends, service: createWorkGoldenPathService({ coreStore, outbox }) };
}

async function admit(harness: Harness): Promise<{ workItemId: string; runId: string }> {
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-lifecycle',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: OWNER_REF,
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/lifecycle-workspace',
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
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  return { workItemId: received.workItemId!, runId: authorized.admission!.runId! };
}

function step(overrides: Partial<WorkGoldenPathStepResult> = {}): WorkGoldenPathStepResult {
  return {
    status: 'claims_complete',
    summary: 'worked',
    satisfiedCriteria: [],
    artifact: null,
    commit: null,
    blockedReason: null,
    ...overrides,
  };
}

function readCallback(harness: Harness, workItemId: string, action: string): string | null {
  const rows = harness.outbox.list(workItemId);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const match = rows[index].payload.actions.find((entry) => entry.action === action);
    if (match) {
      return match.callbackData;
    }
  }
  return null;
}

// --- Timeout ------------------------------------------------------------------

test('a step that overruns its budget blocks the run and tells the owner', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  // Held so the abandoned step can be released *after* the timeout, proving a
  // late result cannot change what the owner was already told.
  const releases: Array<() => void> = [];
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 3,
    stepTimeoutMs: 20,
    // Never resolves within the budget; the runner must not wait for it.
    executeStep: () => new Promise<WorkGoldenPathStepResult>((resolve) => {
      releases.push(() => resolve(step({ commit: COMMIT, satisfiedCriteria: [CRITERION] })));
    }),
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'timed_out');
  assert.equal(outcome.steps, 1, 'the loop stops at the step that overran');
  assert.match(outcome.reason ?? '', /exceeded its 20ms budget/u);

  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'blocked');
  assert.equal(core.outcomes.length, 0, 'a timeout delivers nothing');

  const decision = harness.sends.find((send) => send.purpose === 'decision');
  assert.ok(decision, 'the owner is told the step timed out');
  assert.ok(decision.actions.includes('retry'), 'and is offered a retry');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'decision_needed');

  // The abandoned step finishing later must change nothing.
  releases.forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 5));
  const after = await harness.coreStore.readCore();
  assert.equal(after.runs.find((run) => run.id === runId)?.status, 'blocked');
  assert.equal(after.outcomes.length, 0);
});

test('a step that finishes inside its budget is unaffected by the deadline', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    stepTimeoutMs: 5_000,
    executeStep: async () => step({ commit: COMMIT, satisfiedCriteria: [CRITERION] }),
  });

  assert.equal((await runner.drive({ runId })).status, 'delivered');
});

// --- Retry --------------------------------------------------------------------

test('retry reopens a blocked run and it can then succeed', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  let attempt = 0;
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => {
      attempt += 1;
      return attempt === 1
        ? step()
        : step({ commit: COMMIT, satisfiedCriteria: [CRITERION] });
    },
  });

  assert.equal((await runner.drive({ runId })).status, 'blocked');

  const retryCallback = readCallback(harness, workItemId, 'retry');
  assert.ok(retryCallback, 'the blocked message offered a retry');
  const retried = await harness.service.authorize({
    callbackData: retryCallback,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-retry',
    readiness: READINESS,
  });

  assert.equal(retried.status, 'retried');
  assert.equal(retried.redriveRunId, runId, 'retry re-drives the same Run, never a new one');
  assert.equal(
    (await harness.coreStore.readCore()).runs.find((run) => run.id === runId)?.status,
    'queued',
  );

  // The host would now drive it again.
  assert.equal((await runner.drive({ runId })).status, 'delivered');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.length, 1, 'no second Run was created');
  assert.equal(core.runs[0].status, 'completed');
});

test('retry is refused for a completed run (FR-29)', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => step({ commit: COMMIT, satisfiedCriteria: [CRITERION] }),
  });
  assert.equal((await runner.drive({ runId })).status, 'delivered');

  const result = await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'retry',
    actorRef: 'actor-test',
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'run_completed');
  assert.equal(
    (await harness.coreStore.readCore()).runs.find((run) => run.id === runId)?.status,
    'completed',
    'a delivered run stays delivered',
  );
});

test('retry is refused for a cancelled run', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  await harness.coreStore.updateCore((core) => ({
    ...core,
    runs: core.runs.map((run) =>
      run.id === runId ? { ...run, status: 'cancelled' as const } : run),
  }));

  const result = await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'retry',
    actorRef: 'actor-test',
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'run_cancelled');
});

test('retry is refused while the run is still queued or running', async () => {
  const harness = createHarness();
  const { workItemId } = await admit(harness);

  const result = await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'retry',
    actorRef: 'actor-test',
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'retry_not_valid_from_queued');
});

// --- Resume -------------------------------------------------------------------

test('resume re-drives a run left running by a restart', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  // Simulate a host that started the run and then died mid-flight.
  await harness.coreStore.updateCore((core) => ({
    ...core,
    runs: core.runs.map((run) =>
      run.id === runId ? { ...run, status: 'running' as const } : run),
  }));

  const stage = await harness.service.describeStage(workItemId);
  assert.equal(stage?.stage, 'running');
  assert.ok(stage?.allowedActions.includes('resume'), 'a running run offers resume');

  const result = await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'resume',
    actorRef: 'actor-test',
  });

  assert.equal(result.status, 'redrivable');
  assert.equal(result.runId, runId);
  assert.equal(
    (await harness.coreStore.readCore()).runs.find((run) => run.id === runId)?.status,
    'running',
    'resume re-attaches a driver rather than restarting the attempt',
  );

  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => step({ commit: COMMIT, satisfiedCriteria: [CRITERION] }),
  });
  assert.equal((await runner.drive({ runId })).status, 'delivered');
});

test('resume is refused for a blocked run, which needs a retry instead', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => step(),
  });
  await runner.drive({ runId });

  const result = await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'resume',
    actorRef: 'actor-test',
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'resume_not_valid_from_blocked');
});

// --- Provenance ----------------------------------------------------------------

test('every lifecycle action leaves an activity naming what changed (FR-50)', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => step(),
  });
  await runner.drive({ runId });

  await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'retry',
    actorRef: 'actor-test',
    ownerActorId: 'actor-owner',
  });

  const core = await harness.coreStore.readCore();
  const activity = core.activities.find((entry) => entry.message.includes('retried'));
  assert.ok(activity, 'the retry is recorded');
  assert.equal(activity.runId, runId);
  assert.equal(activity.actorId, 'actor-owner');
  const metadata = activity.metadata.workGoldenPathLifecycle as Record<string, unknown>;
  assert.equal(metadata.action, 'retry');
  assert.equal(metadata.previousStatus, 'blocked', 'the record says what it moved from');
});

test('a refused action writes nothing at all', async () => {
  const harness = createHarness();
  const { workItemId } = await admit(harness);
  const before = await harness.coreStore.readCore();

  await applyWorkGoldenPathLifecycleAction(harness.coreStore, {
    workItemId,
    action: 'retry',
    actorRef: 'actor-test',
  });

  const after = await harness.coreStore.readCore();
  assert.equal(after.activities.length, before.activities.length);
  assert.deepEqual(
    after.runs.map((run) => run.status),
    before.runs.map((run) => run.status),
  );
});
