/**
 * End-to-end acceptance for the SPEC-114 golden path.
 *
 * Everything here runs against a temporary in-memory Core store and a fake
 * Telegram sender: no real bot, no real credentials, and nothing written to the
 * operator's persisted development state (AGENTS.md state-hygiene policy).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import type { CatsCoreState } from '../src/core/types.js';
import { classifyTransportWorkInbound } from '../src/platform/transports/work-delivery/inboundClassification.js';
import {
  createTransportWorkOutbox,
  type TransportWorkOutbox,
} from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkDeliveryV1 } from '../src/platform/transports/work-delivery/contracts.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import { assertSafeTransportPayload } from '../src/products/work/shared/workGoldenPathMessages.js';
import { messageKeys } from '../src/shared/i18n/index.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathRequestInput,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';

const BASE_TIME = new Date('2026-09-02T10:00:00.000Z');
const BINDING_ID = 'binding-telegram-test';
const OWNER_EXTERNAL_REF = 'tg-user-owner';
const CONVERSATION_ID = 'conversation-telegram-test';

/** One outbound Telegram call the fake API observed. */
interface FakeTelegramSend {
  purpose: string;
  bindingId: string;
  workItemId: string;
  sequence: number;
  messageRef: string;
}

interface FakeTelegramServer {
  sends: FakeTelegramSend[];
  /** Forces the next N sends to fail with a classified error. */
  failNext(count: number, options?: { ambiguous?: boolean }): void;
  sender: Parameters<typeof createTransportWorkOutbox>[0]['send'];
}

function createFakeTelegramServer(): FakeTelegramServer {
  const sends: FakeTelegramSend[] = [];
  let failures = 0;
  let ambiguous = false;
  let messageCounter = 0;

  return {
    sends,
    failNext(count, options = {}) {
      failures = count;
      ambiguous = options.ambiguous === true;
    },
    sender: async (row) => {
      if (failures > 0) {
        failures -= 1;
        return {
          ok: false,
          externalMessageRef: null,
          errorCode: 'telegram_api_error',
          ambiguous,
        };
      }
      messageCounter += 1;
      const messageRef = `tg-msg-${messageCounter}`;
      sends.push({
        purpose: row.purpose,
        bindingId: row.bindingId,
        workItemId: row.workItemId,
        sequence: row.sequence,
        messageRef,
      });
      return { ok: true, externalMessageRef: messageRef };
    },
  };
}

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude-opus-5',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/golden-path-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
  telegram: FakeTelegramServer;
  ownerActorId: string;
}

function createHarness(options: {
  initialState?: CatsCoreState;
  initialRows?: readonly TransportWorkDeliveryV1[];
} = {}): Harness {
  const state = options.initialState ?? createDefaultCoreState();
  const coreStore = new MemoryCoreStore(state);
  const telegram = createFakeTelegramServer();
  const outbox = createTransportWorkOutbox({
    send: telegram.sender,
    now: () => new Date(),
    initialRows: options.initialRows,
  });
  const service = createWorkGoldenPathService({ coreStore, outbox });
  return { coreStore, outbox, service, telegram, ownerActorId: state.ownerProfile.actorId };
}

function requestInput(
  harness: Harness,
  overrides: Partial<WorkGoldenPathRequestInput> = {},
): WorkGoldenPathRequestInput {
  return {
    bindingId: BINDING_ID,
    conversationId: CONVERSATION_ID,
    ownerActorId: harness.ownerActorId,
    externalUserRef: OWNER_EXTERNAL_REF,
    externalConversationRef: 'tg-chat-1',
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/golden-path-workspace',
    acceptanceCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    deliveryMode: 'commit_only',
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
    ...overrides,
  };
}

function startWorkCallback(
  offers: readonly { action: string; callbackData: string }[],
): string {
  const offer = offers.find((candidate) => candidate.action === 'start_work');
  assert.ok(offer, 'the proposal must offer a Start work action');
  return offer.callbackData;
}

const COMMIT_EVIDENCE = {
  commitId: 'a1b2c3d4e5f6',
  changeSummary: 'Added a 0.1.21 section to CHANGELOG.md',
  validation: { command: 'npm run typecheck', passed: true },
};

// --- The acceptance path -----------------------------------------------------

test('/work text request reaches delivered end to end (SPEC-114 acceptance)', async () => {
  const harness = createHarness();

  const classification = classifyTransportWorkInbound({
    text: '/work Add a changelog entry for 0.1.21',
    attachmentKinds: [],
  });
  assert.equal(classification.kind, 'work_command');
  assert.equal(classification.goal, 'Add a changelog entry for 0.1.21');

  // 1. Intake: acknowledged and scope proposed, with nothing executing yet.
  const received = await harness.service.receiveRequest(
    requestInput(harness, { goal: classification.goal! }),
  );
  assert.equal(received.status, 'accepted');
  assert.ok(received.workItemId);
  assert.ok(received.proposal);
  assert.equal(received.proposal!.revision, 1);
  assert.equal(received.proposal!.deliveryMode, 'commit_only');
  assert.deepEqual(
    received.proposal!.sideEffects,
    ['Writes files inside the selected workspace. Creates a local git commit.'],
    'material side effects are visible before any confirmation (FR-15)',
  );

  const workItemId = received.workItemId!;
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'scope_proposed');

  let core = await harness.coreStore.readCore();
  assert.equal(core.tasks.length, 0, 'no Task exists before owner authorization (FR-19)');
  assert.equal(core.runs.length, 0, 'no Run exists before owner authorization (FR-19)');

  // 2. Owner authorization: exactly one approved Task and one queued Run.
  const authorized = await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  assert.equal(authorized.status, 'admitted');
  assert.equal(authorized.stage, 'admitted');

  core = await harness.coreStore.readCore();
  assert.equal(core.tasks.length, 1);
  assert.equal(core.runs.length, 1);
  assert.equal(core.tasks[0].status, 'approved');
  assert.equal(core.tasks[0].approval.status, 'approved');
  assert.equal(core.tasks[0].approval.decidedByActorId, harness.ownerActorId);
  assert.equal(core.runs[0].status, 'queued');

  const runId = core.runs[0].id;

  // 3. Execution progresses through supervised state.
  await harness.service.markRunStatus({
    workItemId,
    runId,
    status: 'running',
    stageKey: messageKeys.workDeliveryStageRunning,
    milestoneKey: messageKeys.workDeliveryMilestoneAdmitted,
  });
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'running');

  // 4. A provider response that does not meet the acceptance bar must not
  //    complete the work (FR-30).
  const premature = await harness.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: [],
    summary: 'I have finished the task.',
    artifact: null,
    commit: null,
  });
  assert.equal(premature.status, 'insufficient_evidence');
  assert.equal(premature.stage, 'decision_needed');
  assert.ok(premature.evidence.gaps.includes('acceptance_criteria_unmet'));
  assert.ok(premature.evidence.gaps.includes('no_commit_evidence'));

  core = await harness.coreStore.readCore();
  assert.equal(core.outcomes.length, 0, 'no Outcome is written for unproven completion');

  // 5. Real evidence completes and delivers.
  const completed = await harness.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    summary: 'Added a 0.1.21 section to CHANGELOG.md.',
    artifact: null,
    commit: COMMIT_EVIDENCE,
  });

  assert.equal(completed.evidence.accepted, true);
  assert.deepEqual(completed.outstandingGates, []);
  assert.equal(completed.status, 'delivered');
  assert.equal(completed.stage, 'delivered');
  assert.ok(completed.deliveredMessageRef, 'a delivered result carries a Telegram message ref');

  // 6. The receipt, not the Run, is what makes it delivered.
  const resultRows = harness.outbox.list(workItemId).filter((row) => row.purpose === 'result');
  assert.equal(resultRows.length, 1);
  assert.equal(resultRows[0].state, 'sent');
  assert.equal(resultRows[0].attemptCount, 1);
  assert.equal(resultRows[0].externalMessageRef, completed.deliveredMessageRef);
  assert.ok(resultRows[0].sentAt);
  assert.equal(resultRows[0].bindingId, BINDING_ID, 'delivery targets the recorded binding (FR-43)');

  core = await harness.coreStore.readCore();
  assert.equal(core.runs[0].status, 'completed');
  assert.equal(core.outcomes.length, 1);
  assert.equal(core.outcomes[0].status, 'succeeded');
  assert.equal(core.outcomes[0].metadata.commitId, COMMIT_EVIDENCE.commitId);

  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');
});

test('artifact_only delivers on a ready Artifact that never self-publishes (FR-38)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness, {
    goal: 'Summarize the runtime delivery routes',
    deliveryMode: 'artifact_only',
    workspacePath: '/tmp/golden-path-notes',
    acceptanceCriteria: ['A summary document exists'],
  }));
  const workItemId = received.workItemId!;

  await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const core = await harness.coreStore.readCore();
  const runId = core.runs[0].id;

  const completed = await harness.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['A summary document exists'],
    summary: 'Wrote the summary.',
    artifact: { title: 'Runtime delivery routes', path: null, mimeType: 'text/markdown' },
    commit: null,
  });

  assert.equal(completed.status, 'delivered');
  const after = await harness.coreStore.readCore();
  assert.equal(after.artifacts.length, 1);
  assert.equal(
    after.artifacts[0].status,
    'ready',
    'an ordinary declaration reaches ready, never published',
  );
});

// --- Duplicates, concurrency, and restart -----------------------------------

test('a duplicate Start work tap resolves to the same Task and Run (FR-26)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness));
  const callbackData = startWorkCallback(received.offers);

  const first = await harness.service.authorize({
    callbackData,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const second = await harness.service.authorize({
    callbackData,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    // A replayed callback carries a new Telegram callback id but the same scope.
    ownerEventRef: 'tg-callback-2',
    readiness: READINESS,
  });

  assert.equal(first.status, 'admitted');
  assert.equal(second.status, 'already_admitted');
  assert.equal(first.admission?.taskId, second.admission?.taskId);
  assert.equal(first.admission?.runId, second.admission?.runId);

  const core = await harness.coreStore.readCore();
  assert.equal(core.tasks.length, 1);
  assert.equal(core.runs.length, 1);
});

test('concurrent Start work taps converge on one Run (FR-26)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness));
  const callbackData = startWorkCallback(received.offers);

  const results = await Promise.all([
    harness.service.authorize({
      callbackData,
      bindingId: BINDING_ID,
      externalUserRef: OWNER_EXTERNAL_REF,
      ownerEventRef: 'tg-callback-a',
      readiness: READINESS,
    }),
    harness.service.authorize({
      callbackData,
      bindingId: BINDING_ID,
      externalUserRef: OWNER_EXTERNAL_REF,
      ownerEventRef: 'tg-callback-b',
      readiness: READINESS,
    }),
  ]);

  assert.ok(results.every((result) => result.status !== 'rejected'));
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.length, 1, 'a concurrent double tap must not fork the Run');
  assert.equal(core.tasks.length, 1);
});

test('a repeated /work update does not create a second Work Item (FR-10)', async () => {
  const harness = createHarness();
  const first = await harness.service.receiveRequest(requestInput(harness));
  const second = await harness.service.receiveRequest(requestInput(harness));

  assert.equal(first.workItemId, second.workItemId);
  assert.equal(
    first.proposal!.revision,
    second.proposal!.revision,
    'an unchanged scope must not bump the revision or invalidate outstanding buttons',
  );

  const core = await harness.coreStore.readCore();
  assert.equal(core.workItems.length, 1);

  // The still-valid button from the first render must still work.
  const authorized = await harness.service.authorize({
    callbackData: startWorkCallback(first.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  assert.equal(authorized.status, 'admitted');
});

test('restart between admission and completion resumes the same records', async () => {
  const first = createHarness();
  const received = await first.service.receiveRequest(requestInput(first));
  const workItemId = received.workItemId!;
  await first.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });

  // "Restart": a brand-new service and outbox over the persisted Core state and
  // the recovered outbox rows.
  const persisted = await first.coreStore.readCore();
  const restarted = createHarness({
    initialState: persisted,
    initialRows: first.outbox.list(workItemId),
  });

  const stage = await restarted.service.describeStage(workItemId);
  assert.equal(stage?.stage, 'admitted', 'the stage survives a restart because it is derived');

  const runId = persisted.runs[0].id;
  const completed = await restarted.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    summary: 'Added a 0.1.21 section to CHANGELOG.md.',
    artifact: null,
    commit: COMMIT_EVIDENCE,
  });

  assert.equal(completed.status, 'delivered');
  const core = await restarted.coreStore.readCore();
  assert.equal(core.runs.length, 1, 'restart must not create a second Run');
  assert.equal(core.tasks.length, 1);
});

test('restart while a result send is pending does not send it twice (FR-47)', async () => {
  const first = createHarness();
  const received = await first.service.receiveRequest(requestInput(first));
  const workItemId = received.workItemId!;
  await first.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const persisted = await first.coreStore.readCore();
  const runId = persisted.runs[0].id;

  await first.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    summary: 'Added a 0.1.21 section to CHANGELOG.md.',
    artifact: null,
    commit: COMMIT_EVIDENCE,
  });
  const sentResults = first.telegram.sends.filter((send) => send.purpose === 'result');
  assert.equal(sentResults.length, 1);

  const restarted = createHarness({
    initialState: await first.coreStore.readCore(),
    initialRows: first.outbox.list(workItemId),
  });
  // A recovery pass re-drives the outbox for this work item.
  await restarted.outbox.flushWorkItem(workItemId);

  assert.equal(
    restarted.telegram.sends.filter((send) => send.purpose === 'result').length,
    0,
    'a result already marked sent must not be re-sent after a restart',
  );
  assert.equal((await restarted.service.describeStage(workItemId))?.stage, 'delivered');
});

test('two open requests on one binding authorize independently', async () => {
  const harness = createHarness();
  const first = await harness.service.receiveRequest(requestInput(harness, {
    goal: 'Add a changelog entry for 0.1.21',
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
  }));
  const second = await harness.service.receiveRequest(requestInput(harness, {
    goal: 'Rename the release notes heading',
    acceptanceCriteria: ['The heading reads "Release notes"'],
    externalUpdateRef: 'tg-update-2',
    externalMessageRef: 'tg-message-2',
  }));

  assert.notEqual(first.workItemId, second.workItemId, 'two goals are two work items');

  // Authorizing the *second* request must not be judged against the first
  // request's revision just because they share a binding.
  const authorizedSecond = await harness.service.authorize({
    callbackData: startWorkCallback(second.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-2',
    readiness: READINESS,
  });
  assert.equal(authorizedSecond.status, 'admitted');

  const authorizedFirst = await harness.service.authorize({
    callbackData: startWorkCallback(first.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  assert.equal(authorizedFirst.status, 'admitted');

  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.length, 2, 'each authorized scope gets its own Run');
  assert.equal(core.tasks.length, 2);
  assert.notEqual(authorizedFirst.admission?.runId, authorizedSecond.admission?.runId);
});

// --- Fail-closed authorization ----------------------------------------------

test('a stale proposal revision fails closed (FR-21)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness));
  const oldCallbackData = startWorkCallback(received.offers);

  // The owner adjusts the scope; the delivery mode is execution-relevant.
  const revised = await harness.service.receiveRequest(requestInput(harness, {
    deliveryMode: 'artifact_only',
  }));
  assert.equal(revised.proposal!.revision, 2);
  assert.notEqual(revised.proposal!.digest, received.proposal!.digest);

  const rejected = await harness.service.authorize({
    callbackData: oldCallbackData,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejection, 'unknown_token', 'old tokens are destroyed when scope changes');
  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.length, 0);
});

test('a callback from another Telegram user fails closed (FR-13)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness));

  const rejected = await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: 'tg-user-someone-else',
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejection, 'unauthorized_owner');
  assert.equal((await harness.coreStore.readCore()).runs.length, 0);
});

test('a callback replayed on another binding fails closed (FR-13)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness));

  const rejected = await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: 'binding-someone-elses',
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejection, 'cross_binding');
});

test('incomplete readiness refuses work instead of claiming it is queued (FR-3)', async () => {
  const harness = createHarness();
  const notReady = evaluateTransportWorkReadiness({
    bindingEnabled: true,
    bindingHealthy: true,
    ownerAuthorized: true,
    boundCatId: 'cat-1',
    executionTargetId: null,
    capabilityProfileResolved: false,
    workspacePath: '/tmp/golden-path-workspace',
    permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
    deliveryMode: 'commit_only',
    deliveryGates: [],
    backgroundServiceAvailable: false,
  });

  const received = await harness.service.receiveRequest(
    requestInput(harness, { readiness: notReady }),
  );

  assert.equal(received.status, 'not_ready');
  assert.equal(received.workItemId, null);
  assert.deepEqual(
    received.readiness.blockers.map((blocker) => blocker.reason).sort(),
    ['background_service_unavailable', 'capability_profile_missing', 'execution_target_missing'],
  );
  const core = await harness.coreStore.readCore();
  assert.equal(core.workItems.length, 0);
  assert.equal(core.runs.length, 0);
});

// --- Gated publication -------------------------------------------------------

test('a gated delivery mode stops at result_ready until publication is authorized (FR-41)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness, {
    deliveryMode: 'push_branch',
    acceptanceCriteria: ['Branch pushed'],
  }));
  const workItemId = received.workItemId!;
  await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const runId = (await harness.coreStore.readCore()).runs[0].id;

  const completed = await harness.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['Branch pushed'],
    summary: 'Pushed the branch.',
    artifact: { title: 'Branch summary', path: null, mimeType: 'text/plain' },
    commit: null,
  });

  assert.equal(completed.status, 'result_ready');
  assert.deepEqual(completed.outstandingGates, ['owner_approval_required']);
  assert.equal(
    harness.telegram.sends.filter((send) => send.purpose === 'result').length,
    0,
    'no deliverable is sent while a publish gate is outstanding',
  );
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'result_ready');
});

// --- Delivery failure --------------------------------------------------------

test('a failed final send stays recoverable and is not projected as delivered (FR-46)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness));
  const workItemId = received.workItemId!;
  await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const runId = (await harness.coreStore.readCore()).runs[0].id;

  harness.telegram.failNext(1);
  const completed = await harness.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    summary: 'Added a 0.1.21 section to CHANGELOG.md.',
    artifact: null,
    commit: COMMIT_EVIDENCE,
  });

  assert.equal(completed.status, 'result_ready');
  assert.equal(completed.deliveredMessageRef, null);
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'publish_authorized');

  const resultRow = harness.outbox
    .list(workItemId)
    .find((row) => row.purpose === 'result');
  assert.equal(resultRow?.state, 'failed');
  assert.equal(resultRow?.lastErrorCode, 'telegram_api_error');

  // Retry succeeds and only then does the path become delivered.
  await harness.outbox.flush(resultRow!.idempotencyKey);
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');
  assert.equal(harness.telegram.sends.filter((send) => send.purpose === 'result').length, 1);
});

// --- Unsupported input -------------------------------------------------------

test('attachment-only input is refused truthfully (FR-48)', () => {
  const attachmentOnly = classifyTransportWorkInbound({
    text: null,
    attachmentKinds: ['document'],
  });
  assert.equal(attachmentOnly.kind, 'attachment_unsupported');
  assert.equal(attachmentOnly.goal, null, 'a filename must never become the goal');
  assert.equal(attachmentOnly.refusalKey, 'workDelivery.inbound.attachmentNotIngested');

  const captioned = classifyTransportWorkInbound({
    text: '/work summarize this spec',
    attachmentKinds: ['document'],
  });
  assert.equal(captioned.kind, 'attachment_unsupported');
  assert.equal(captioned.goal, null, 'an un-ingested attachment cannot be silently dropped');

  const emptyGoal = classifyTransportWorkInbound({ text: '/work', attachmentKinds: [] });
  assert.equal(emptyGoal.kind, 'empty');
  assert.equal(emptyGoal.refusalKey, 'workDelivery.inbound.goalRequired');

  const ordinary = classifyTransportWorkInbound({ text: 'hello', attachmentKinds: [] });
  assert.equal(ordinary.kind, 'not_work_request');
});

// --- Secret and path hygiene -------------------------------------------------

test('no local path or credential reaches callback data or a Telegram payload (FR-6, FR-44)', async () => {
  const harness = createHarness();
  const received = await harness.service.receiveRequest(requestInput(harness, {
    workspacePath: '/Users/secret-operator/repos/cats-platform',
  }));
  const workItemId = received.workItemId!;
  await harness.service.authorize({
    callbackData: startWorkCallback(received.offers),
    bindingId: BINDING_ID,
    externalUserRef: OWNER_EXTERNAL_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  const runId = (await harness.coreStore.readCore()).runs[0].id;
  await harness.service.completeRun({
    workItemId,
    runId,
    satisfiedCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    summary: 'Added a 0.1.21 section to CHANGELOG.md.',
    artifact: null,
    commit: COMMIT_EVIDENCE,
  });

  for (const offer of received.offers) {
    assert.ok(
      !offer.callbackData.includes('/Users/'),
      'callback data must never carry a filesystem path',
    );
    assert.ok(!offer.callbackData.includes(workItemId));
    assert.ok(Buffer.byteLength(offer.callbackData, 'utf8') <= 64);
  }

  // Every payload that reached the transport is the surface FR-44 governs.
  const rows = harness.outbox.list(workItemId);
  assert.ok(rows.length >= 3, 'ack, proposal, and result all produce outbox rows');
  for (const row of rows) {
    assert.ok(
      !row.payload.text.includes('/Users/'),
      `payload for ${row.purpose} must not contain a local path`,
    );
    assert.ok(!/bot[_-]?token|api[_-]?key/iu.test(row.payload.text));
    assert.ok(
      row.payload.deepLink === null || row.payload.deepLink.startsWith('cats://'),
      'a deep link is a Desktop route, never a filesystem path',
    );
  }

  // The proposal still tells the owner what it will act on, by label.
  const proposalRow = rows.find((row) => row.purpose === 'proposal');
  assert.ok(proposalRow?.payload.text.includes('cats-platform'));
  // The proposal shows the localized delivery-mode label, not the enum value.
  assert.ok(proposalRow?.payload.text.includes('Commit only'));
  assert.equal(
    proposalRow?.payload.actions.map((action) => action.action).join(','),
    'start_work,adjust,cancel',
    'the proposal carries its inline actions so the transport can render buttons',
  );

  const resultRow = rows.find((row) => row.purpose === 'result');
  assert.ok(resultRow?.payload.text.includes(COMMIT_EVIDENCE.commitId));
  assert.ok(resultRow?.payload.text.includes('Acceptance: met'));

  // Bot tokens and provider credentials never enter Core at all (FR-6).
  const core = await harness.coreStore.readCore();
  const serialized = JSON.stringify(core);
  assert.ok(!/bot[_-]?token/iu.test(serialized));
  assert.ok(!/api[_-]?key/iu.test(serialized));
});

test('the payload guard refuses an unsafe summary outright (FR-44)', () => {
  assertSafeTransportPayload({ text: 'Result: done', deepLink: null, actions: [] });

  assert.throws(
    () => assertSafeTransportPayload({
      text: 'Wrote /Users/secret-operator/repos/notes.md',
      deepLink: null,
      actions: [],
    }),
    /local filesystem path/u,
  );
  assert.throws(
    () => assertSafeTransportPayload({
      text: 'Use bot_token 12345 to retry',
      deepLink: null,
      actions: [],
    }),
    /credential-like/u,
  );
});
