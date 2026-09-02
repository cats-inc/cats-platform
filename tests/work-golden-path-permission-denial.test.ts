/**
 * Permission denial as its own state (SPEC-114 FR-29, PLAN-105 Phase 4).
 *
 * A supervision refusal and a provider failure look alike from a distance and
 * need opposite responses. A failed call may succeed on the next attempt; a
 * refused one will fail identically forever until the owner widens the
 * envelope. Collapsing them into "something went wrong" sends the owner to
 * retry a button that cannot work, so this state exists to name the tool.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';
import { buildWorkGoldenPathDetailProjectionForTask } from '../src/products/work/api/goldenPathProjection.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';
import {
  createWorkGoldenPathRunner,
  WORK_GOLDEN_PATH_DENIAL_METADATA_KEY,
  type WorkGoldenPathStepResult,
} from '../src/products/work/state/workGoldenPathRunner.js';
import { createWorkGoldenPathRuntimeExecutor } from '../src/products/work/state/workGoldenPathRuntimeExecutor.js';

const BINDING_ID = 'binding-denial-test';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';
const DENIED_TOOL = 'cats.runtime.session.create';

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/denial-workspace',
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

async function admit(harness: Harness): Promise<{ workItemId: string; runId: string; taskId: string }> {
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-denial',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: 'tg-chat-1',
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/denial-workspace',
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
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  return {
    workItemId: received.workItemId!,
    runId: authorized.admission!.runId!,
    taskId: authorized.admission!.taskId!,
  };
}

function deniedStep(): WorkGoldenPathStepResult {
  return {
    status: 'permission_denied',
    summary: 'The supervision boundary refused this step.',
    satisfiedCriteria: [],
    artifact: null,
    commit: null,
    blockedReason: `${DENIED_TOOL} rejected: E_TOOL_SCOPE_DENIED`,
    denial: { toolName: DENIED_TOOL, code: 'E_TOOL_SCOPE_DENIED' },
  };
}

// --- The state itself ----------------------------------------------------------

test('a refused step blocks the run and names the tool, without failing it', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  let steps = 0;
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 4,
    executeStep: async () => {
      steps += 1;
      return deniedStep();
    },
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'permission_denied');
  assert.equal(steps, 1, 'a refusal stops the loop immediately; retrying it changes nothing');
  assert.match(outcome.reason ?? '', /E_TOOL_SCOPE_DENIED/u);

  const core = await harness.coreStore.readCore();
  const run = core.runs.find((candidate) => candidate.id === runId)!;
  assert.equal(
    run.status,
    'blocked',
    'the work is not failed: it is waiting on the owner, and can proceed once granted',
  );
  const envelope = run.metadata[WORK_GOLDEN_PATH_DENIAL_METADATA_KEY] as Record<string, unknown>;
  assert.equal(envelope.toolName, DENIED_TOOL);
  assert.equal(envelope.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal(core.outcomes.length, 0, 'a refused run delivers nothing');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'decision_needed');
});

test('the owner is told what to grant, not that something went wrong', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => deniedStep(),
  });
  await runner.drive({ runId });

  const decision = harness.sends.find((send) => send.purpose === 'decision');
  assert.ok(decision, 'the owner is told');
  assert.ok(decision.text.includes(DENIED_TOOL), 'the refused tool is named');
  assert.ok(decision.text.includes('E_TOOL_SCOPE_DENIED'), 'so is the reason');
  assert.ok(
    decision.text.includes('Grant') || decision.text.includes('permission is granted'),
    'and the message says a grant is what unblocks it',
  );
  assert.ok(decision.actions.includes('retry'), 'retry is offered for after the grant');
});

test('a refusal is recorded as its own activity (FR-50)', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => deniedStep(),
  });
  await runner.drive({ runId });

  const core = await harness.coreStore.readCore();
  const activity = core.activities.find((entry) => entry.message.includes('Supervision refused'));
  assert.ok(activity, 'the refusal is auditable');
  assert.equal(activity.runId, runId);
  const metadata = activity.metadata[WORK_GOLDEN_PATH_DENIAL_METADATA_KEY] as
    Record<string, unknown>;
  assert.equal(metadata.toolName, DENIED_TOOL);
});

// --- Distinguished from a plain failure ----------------------------------------

test('a provider failure still fails the run, unlike a refusal', async () => {
  const harness = createHarness();
  const { runId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => ({
      status: 'failed',
      summary: 'lost the session',
      satisfiedCriteria: [],
      artifact: null,
      commit: null,
      blockedReason: 'provider session lost',
    }),
  });

  const outcome = await runner.drive({ runId });

  assert.equal(outcome.status, 'failed');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.find((candidate) => candidate.id === runId)?.status, 'failed');
  assert.equal(
    core.runs.find((candidate) => candidate.id === runId)
      ?.metadata[WORK_GOLDEN_PATH_DENIAL_METADATA_KEY],
    undefined,
    'a failure is not recorded as a permission denial',
  );
});

// --- The executor's mapping ------------------------------------------------------

test('a narrow envelope is refused by the boundary, not sent to the provider', async () => {
  let reachedProvider = false;
  const runtimeClient = {
    createSession: async () => {
      reachedProvider = true;
      return { id: 'session-1', provider: 'claude', model: 'opus' };
    },
  } as unknown as RuntimeClient;

  const result = await createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
    // No workspace was configured, so the run may not write.
    resolveToolScope: () => 'read_only',
  })({
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

  assert.equal(result.status, 'permission_denied');
  assert.equal(result.denial?.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal(result.denial?.toolName, DENIED_TOOL);
  assert.equal(
    reachedProvider,
    false,
    'an under-permissioned run is stopped at the boundary, never at the provider',
  );
});

test('a sufficient envelope reaches the provider as before', async () => {
  let reachedProvider = false;
  const runtimeClient = {
    createSession: async () => {
      reachedProvider = true;
      return { id: 'session-1', provider: 'claude', model: 'opus' };
    },
    sendMessage: async () => ({
      segments: [{ kind: 'text', text: 'ok' }],
      inputTokens: 1,
      outputTokens: 1,
      tokensUsed: 2,
    }),
  } as unknown as RuntimeClient;

  const result = await createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
    resolveToolScope: () => 'broad_write',
  })({
    runId: 'run-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    stepIndex: 0,
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    workspacePath: '/tmp/denial-workspace',
    outstandingGaps: [],
    outstandingCriteria: [],
  });

  assert.equal(result.status, 'claims_complete');
  assert.equal(reachedProvider, true);
});

test('the default envelope is unchanged for callers that do not set one', async () => {
  let reachedProvider = false;
  const runtimeClient = {
    createSession: async () => {
      reachedProvider = true;
      return { id: 'session-1', provider: 'claude', model: 'opus' };
    },
    sendMessage: async () => ({
      segments: [], inputTokens: 0, outputTokens: 0, tokensUsed: 0,
    }),
  } as unknown as RuntimeClient;

  await createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
  })({
    runId: 'run-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    stepIndex: 0,
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    workspacePath: '/tmp/denial-workspace',
    outstandingGaps: [],
    outstandingCriteria: [],
  });

  assert.equal(reachedProvider, true, 'omitting the scope keeps the previous behaviour');
});

test('an ordinary transport error is still a plain failure', async () => {
  const runtimeClient = {
    createSession: async () => {
      throw new Error('socket hang up');
    },
  } as unknown as RuntimeClient;

  const result = await createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
  })({
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
  assert.equal(result.denial ?? null, null);
});

// --- Desktop -------------------------------------------------------------------

test('Desktop shows the refused tool so the owner knows what to grant', async () => {
  const harness = createHarness();
  const { runId, taskId } = await admit(harness);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => deniedStep(),
  });
  await runner.drive({ runId });

  const view = buildWorkGoldenPathDetailProjectionForTask({
    core: await harness.coreStore.readCore(),
    taskId,
    deliveryReader: harness.outbox,
  });

  assert.ok(view);
  assert.deepEqual(
    { toolName: view.permissionDenial?.toolName, code: view.permissionDenial?.code },
    { toolName: DENIED_TOOL, code: 'E_TOOL_SCOPE_DENIED' },
  );
  assert.ok(view.permissionDenial?.deniedAt, 'when it happened is recorded');
  assert.ok(view.recoveryActions.includes('retry_run'), 'retry is available after the grant');
});

test('a run that was never refused reports no denial', async () => {
  const harness = createHarness();
  const { taskId } = await admit(harness);

  const view = buildWorkGoldenPathDetailProjectionForTask({
    core: await harness.coreStore.readCore(),
    taskId,
    deliveryReader: harness.outbox,
  });

  assert.equal(view?.permissionDenial, null);
});
