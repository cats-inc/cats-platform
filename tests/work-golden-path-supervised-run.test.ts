/**
 * Supervised-run driving for the golden path (SPEC-114 FR-28..FR-31).
 *
 * The behaviour under test is the one the product got wrong before: a provider
 * step returning is not completion. Every test here drives a deterministic fake
 * agent through the real runner against temporary in-memory state.
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
  type WorkGoldenPathStepExecutor,
  type WorkGoldenPathStepResult,
} from '../src/products/work/state/workGoldenPathRunner.js';
import {
  createWorkGoldenPathRuntimeExecutor,
} from '../src/products/work/state/workGoldenPathRuntimeExecutor.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';
import { createRuntimeDeliveryClient } from '../src/platform/runtime/deliveryClient.js';
import { createRuntimeEvidenceCollector } from '../src/products/work/state/workGoldenPathDeliveryEvidence.js';

const BINDING_ID = 'binding-supervised-test';
const CHAT_REF = 'tg-chat-9';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/supervised-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

const COMMIT = {
  commitId: 'a1b2c3d4e5f6',
  changeSummary: 'Added a 0.1.21 section',
  validation: { command: 'npm run typecheck', passed: true },
};

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
  sends: Array<{ purpose: string; text: string }>;
}

function createHarness(): Harness {
  const sends: Array<{ purpose: string; text: string }> = [];
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const outbox = createTransportWorkOutbox({
    send: async (row) => {
      sends.push({ purpose: row.purpose, text: row.payload.text });
      return { ok: true, externalMessageRef: `tg-${sends.length}` };
    },
  });
  const service = createWorkGoldenPathService({ coreStore, outbox });
  return { coreStore, outbox, service, sends };
}

/** Drives intake plus authorization so a test starts from an admitted Run. */
async function admit(harness: Harness, overrides: {
  deliveryMode?: 'commit_only' | 'artifact_only';
  acceptanceCriteria?: string[];
} = {}): Promise<{ workItemId: string; runId: string }> {
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-supervised',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/supervised-workspace',
    acceptanceCriteria: overrides.acceptanceCriteria ?? [CRITERION],
    deliveryMode: overrides.deliveryMode ?? 'commit_only',
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
  });
  assert.equal(received.status, 'accepted');
  const startWork = received.offers.find((offer) => offer.action === 'start_work');
  assert.ok(startWork);

  const authorized = await harness.service.authorize({
    callbackData: startWork.callbackData,
    bindingId: BINDING_ID,
    externalUserRef: 'tg-owner',
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  assert.equal(authorized.status, 'admitted');
  return {
    workItemId: received.workItemId!,
    runId: authorized.admission!.runId!,
  };
}

/** A fake agent driven by a fixed script, one entry per step. */
function scriptedExecutor(
  script: readonly Partial<WorkGoldenPathStepResult>[],
  onStep?: (stepIndex: number) => Promise<void> | void,
): { executor: WorkGoldenPathStepExecutor; calls: Array<{ gaps: string[]; unmet: string[] }> } {
  const calls: Array<{ gaps: string[]; unmet: string[] }> = [];
  const executor: WorkGoldenPathStepExecutor = async (context) => {
    calls.push({
      gaps: [...context.outstandingGaps],
      unmet: [...context.outstandingCriteria],
    });
    await onStep?.(context.stepIndex);
    const entry = script[context.stepIndex] ?? script[script.length - 1] ?? {};
    return {
      status: 'claims_complete',
      summary: `step ${context.stepIndex}`,
      satisfiedCriteria: [],
      artifact: null,
      commit: null,
      blockedReason: null,
      ...entry,
    };
  };
  return { executor, calls };
}

// --- FR-30: a provider response is not completion ----------------------------

test('a confident "I am done" with no evidence does not complete the run (FR-30)', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  const { executor, calls } = scriptedExecutor([
    { summary: 'I have finished the task.' },
  ]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 3,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.steps, 3, 'the run keeps trying until its budget is spent');
  assert.equal(outcome.evidence?.accepted, false);
  assert.ok(outcome.evidence?.gaps.includes('no_commit_evidence'));

  const core = await harness.coreStore.readCore();
  assert.equal(core.outcomes.length, 0, 'no Outcome is written for unproven work');
  assert.equal(
    core.runs.find((run) => run.id === runId)?.status,
    'blocked',
    'the Run is blocked for an owner decision, never completed',
  );
  assert.ok(
    harness.sends.some((send) => send.purpose === 'decision'),
    'the owner is told the acceptance bar was not met',
  );
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'decision_needed');

  // Every retry told the agent what was still missing, rather than re-asking.
  assert.deepEqual(calls[0].gaps.sort(), ['acceptance_criteria_unmet', 'no_commit_evidence']);
  assert.deepEqual(calls[1].unmet, [CRITERION]);
});

test('the run continues across steps and completes on real evidence (FR-31)', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  const { executor, calls } = scriptedExecutor([
    { summary: 'Explored the repo.' },
    { summary: 'Edited the changelog.', satisfiedCriteria: [CRITERION] },
    { summary: 'Committed the change.', satisfiedCriteria: [CRITERION], commit: COMMIT },
  ]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 6,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'delivered');
  assert.equal(outcome.steps, 3, 'it stops as soon as the evidence holds, not at the budget');
  assert.equal(outcome.evidence?.accepted, true);
  assert.equal(calls.length, 3);

  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'completed');
  assert.equal(core.outcomes.length, 1);
  assert.equal(core.outcomes[0].metadata.commitId, COMMIT.commitId);
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');
  assert.ok(harness.sends.some((send) => send.purpose === 'result'));
});

test('evidence accumulated in an earlier step is not lost by a later one', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const { executor } = scriptedExecutor([
    { summary: 'Committed.', commit: COMMIT },
    // A later step reports nothing; the commit from step 0 must still count.
    { summary: 'Tidied up.', satisfiedCriteria: [CRITERION] },
  ]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 4,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'delivered');
  assert.equal(outcome.steps, 2);
});

// --- Checkpoints -------------------------------------------------------------

test('each continuation records a checkpoint with a structured reason', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const { executor } = scriptedExecutor([{ summary: 'still working' }]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 3,
  });

  await runner.drive({ runId });

  const core = await harness.coreStore.readCore();
  const checkpoints = core.checkpoints.filter((entry) => entry.runId === runId);
  assert.equal(checkpoints.length, 2, 'the terminal step is not a continuation checkpoint');
  const metadata = checkpoints[0].metadata.workGoldenPath as Record<string, unknown>;
  assert.equal(metadata.continuationReason, 'acceptance_gaps');
  assert.deepEqual(metadata.outstandingCriteria, [CRITERION]);
  assert.ok(
    Array.isArray(metadata.gaps) && metadata.gaps.includes('no_commit_evidence'),
    'recovery can read why the run continued without parsing a transcript',
  );
});

// --- Lifecycle ---------------------------------------------------------------

test('a cancellation landing mid-run stops the loop at the next boundary', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  const { executor, calls } = scriptedExecutor(
    [{ summary: 'working' }],
    async (stepIndex) => {
      if (stepIndex === 0) {
        // The owner cancels while step 0 is still in flight.
        await harness.coreStore.updateCore((core) => ({
          ...core,
          runs: core.runs.map((run) =>
            run.id === runId ? { ...run, status: 'cancelled' as const } : run),
        }));
      }
    },
  );
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 5,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'cancelled');
  assert.equal(calls.length, 1, 'no further step runs after cancellation');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'cancelled');
});

test('a terminal run is never resurrected by a late step (FR-29)', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  await harness.coreStore.updateCore((core) => ({
    ...core,
    runs: core.runs.map((run) =>
      run.id === runId ? { ...run, status: 'cancelled' as const } : run),
  }));

  const { executor, calls } = scriptedExecutor([{ summary: 'late arrival' }]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 3,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'not_runnable');
  assert.equal(calls.length, 0, 'a cancelled run does not execute at all');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'cancelled');
});

test('a provider failure ends the run and tells the owner', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);
  const { executor } = scriptedExecutor([
    { status: 'failed', blockedReason: 'provider session lost' },
  ]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 3,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.reason, 'provider session lost');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'failed');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'failed');
});

test('a step that asks for a decision blocks without consuming the budget', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const { executor, calls } = scriptedExecutor([
    { status: 'blocked', blockedReason: 'needs a destructive migration approved' },
  ]);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    executeStep: executor,
    maxSteps: 5,
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'blocked');
  assert.equal(calls.length, 1);
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'blocked');
});

test('an owner Cancel callback cancels the authoritative Task and Run (FR-35)', async () => {
  const harness = createHarness();
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-supervised',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/supervised-workspace',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
  });
  const startWork = received.offers.find((offer) => offer.action === 'start_work')!;
  const cancel = received.offers.find((offer) => offer.action === 'cancel')!;

  await harness.service.authorize({
    callbackData: startWork.callbackData,
    bindingId: BINDING_ID,
    externalUserRef: 'tg-owner',
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const cancelled = await harness.service.authorize({
    callbackData: cancel.callbackData,
    bindingId: BINDING_ID,
    externalUserRef: 'tg-owner',
    ownerEventRef: 'tg-callback-2',
    readiness: READINESS,
  });

  assert.equal(cancelled.status, 'cancelled');
  const after = await harness.coreStore.readCore();
  assert.equal(after.runs[0].status, 'cancelled');
  assert.equal(after.tasks[0].status, 'cancelled');
  assert.ok(harness.sends.some((send) => send.text.includes('Cancelled')));
  assert.equal(
    (await harness.service.describeStage(received.workItemId!))?.stage,
    'cancelled',
  );
});

// --- The runtime-backed executor ---------------------------------------------

test('the runtime executor reuses one session and states the gap on continuation', async () => {
  const created: unknown[] = [];
  const messages: string[] = [];
  const runtimeClient = {
    createSession: async (input: unknown) => {
      created.push(input);
      return { id: 'session-1', provider: 'claude', model: 'opus' };
    },
    sendMessage: async (_sessionId: string, content: string) => {
      messages.push(content);
      return { segments: [{ kind: 'text', text: 'did some work' }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
    },
  } as unknown as RuntimeClient;

  const executor = createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
  });

  const base = {
    runId: 'run-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only' as const,
    workspacePath: '/tmp/supervised-workspace',
  };

  const first = await executor({ ...base, stepIndex: 0, outstandingGaps: [], outstandingCriteria: [] });
  const second = await executor({
    ...base,
    stepIndex: 1,
    outstandingGaps: ['no_commit_evidence'],
    outstandingCriteria: [CRITERION],
  });

  assert.equal(created.length, 1, 'one session serves the whole run');
  assert.equal(first.status, 'claims_complete');
  assert.deepEqual(
    first.satisfiedCriteria,
    [],
    'the executor never claims criteria for the provider',
  );
  assert.equal(second.summary, 'did some work');
  assert.ok(messages[0].includes('Done when:'));
  assert.ok(messages[0].includes(CRITERION));
  assert.ok(messages[1].includes('Still unmet:'));
  assert.ok(messages[1].includes('no_commit_evidence'));
});

test('a runtime failure is reported as a failed step, not a silent retry', async () => {
  const runtimeClient = {
    createSession: async () => {
      throw new Error('runtime unreachable');
    },
  } as unknown as RuntimeClient;

  const executor = createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
  });

  const result = await executor({
    runId: 'run-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    stepIndex: 0,
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    workspacePath: null,
    outstandingGaps: [],
    outstandingCriteria: [],
  });

  assert.equal(result.status, 'failed');
  // The supervision boundary wraps the cause, so the reason names the tool and
  // its rejection code as well as the underlying error.
  assert.match(result.blockedReason ?? '', /cats\.runtime\.session\.create rejected/u);
  assert.match(result.blockedReason ?? '', /runtime unreachable/u);
});

// --- The whole chain ----------------------------------------------------------

test('a run reaches delivered on a commit Cats verified itself', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  // A fake `cats-runtime`: the agent edits on turn 1, so the worktree is dirty,
  // and the commit endpoint reports a new HEAD that the follow-up status
  // confirms is clean.
  const repoStates = [
    { supported: true, repository: true, clean: false, headOid: 'aaaaaaaaaaaa', stagedCount: 0, modifiedCount: 1, untrackedCount: 0 },
    { supported: true, repository: true, clean: true, headOid: 'cccccccccccc', stagedCount: 0, modifiedCount: 0, untrackedCount: 0 },
  ];
  let statusIndex = 0;
  const deliveryFetch = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/u, '');
    void init;
    const payload = path === '/delivery/repo/status'
      ? {
        state: 'completed',
        repo: repoStates[Math.min(statusIndex++, repoStates.length - 1)],
      }
      : { state: 'completed', metadata: { commit: { oid: 'cccccccccccc' } } };
    return { ok: true, status: 200, statusText: 'OK', json: async () => payload } as unknown as Response;
  }) as unknown as typeof fetch;

  const collectEvidence = createRuntimeEvidenceCollector({
    deliveryClient: createRuntimeDeliveryClient({
      baseUrl: 'http://127.0.0.1:3110',
      fetchImpl: deliveryFetch,
    }),
  });

  const runtimeClient = {
    createSession: async () => ({ id: 'session-1', provider: 'claude', model: 'opus' }),
    sendMessage: async () => ({
      segments: [{ kind: 'text', text: `Edited the changelog.\nCRITERIA-MET: ${CRITERION}` }],
      inputTokens: 1,
      outputTokens: 1,
      tokensUsed: 2,
    }),
  } as unknown as RuntimeClient;

  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 4,
    executeStep: createWorkGoldenPathRuntimeExecutor({
      runtimeClient,
      resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
      collectEvidence,
    }),
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'delivered');
  assert.equal(outcome.steps, 1, 'verified evidence on the first turn ends the run');
  assert.equal(outcome.evidence?.accepted, true);

  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((run) => run.id === runId)?.status, 'completed');
  assert.equal(core.outcomes[0].metadata.commitId, 'cccccccccccc');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');

  const result = harness.sends.find((send) => send.purpose === 'result');
  assert.ok(result, 'the owner receives a result message');
  assert.ok(result.text.includes('cccccccccccc'), 'the commit id is reported');
  assert.ok(result.text.includes('Acceptance: met'));
});

test('the same chain stays unmet when the agent changes nothing', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);

  const cleanRepo = {
    supported: true, repository: true, clean: true, headOid: 'aaaaaaaaaaaa',
    stagedCount: 0, modifiedCount: 0, untrackedCount: 0,
  };
  const deliveryFetch = (async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ state: 'completed', repo: cleanRepo }),
  } as unknown as Response)) as unknown as typeof fetch;

  const runtimeClient = {
    createSession: async () => ({ id: 'session-1', provider: 'claude', model: 'opus' }),
    sendMessage: async () => ({
      segments: [{ kind: 'text', text: `All done!\nCRITERIA-MET: ${CRITERION}` }],
      inputTokens: 1,
      outputTokens: 1,
      tokensUsed: 2,
    }),
  } as unknown as RuntimeClient;

  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: createWorkGoldenPathRuntimeExecutor({
      runtimeClient,
      resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
      collectEvidence: createRuntimeEvidenceCollector({
        deliveryClient: createRuntimeDeliveryClient({
          baseUrl: 'http://127.0.0.1:3110',
          fetchImpl: deliveryFetch,
        }),
      }),
    }),
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'blocked');
  assert.deepEqual(outcome.evidence?.gaps, ['no_commit_evidence']);
  const core = await harness.coreStore.readCore();
  assert.equal(core.outcomes.length, 0, 'claiming the criterion is not delivering it');
});
