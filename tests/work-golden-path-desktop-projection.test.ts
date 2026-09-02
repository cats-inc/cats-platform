/**
 * Desktop projection for the golden path (SPEC-114 FR-49, FR-46).
 *
 * The obligation under test: Desktop can explain every Telegram message from
 * durable records alone — where it came in, which revision the owner
 * authorized, what executed, what evidence was accepted, and whether the result
 * actually arrived.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import {
  buildWorkGoldenPathDetailProjectionForTask,
} from '../src/products/work/api/goldenPathProjection.js';
import { retryWorkGoldenPathDelivery } from '../src/products/work/api/index.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';
import { createWorkGoldenPathRunner } from '../src/products/work/state/workGoldenPathRunner.js';

const BINDING_ID = 'binding-desktop-test';
const CHAT_REF = 'tg-chat-77';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';
const COMMIT = {
  commitId: 'a1b2c3d4e5f6',
  changeSummary: 'Added a 0.1.21 section',
  validation: { command: 'runtime repo status: worktree clean at the new HEAD', passed: true },
};

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/desktop-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
  /** Fails the next N sends of one purpose, leaving the rest alone. */
  failPurpose: (purpose: string, count: number) => void;
}

function createHarness(): Harness {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const failuresByPurpose = new Map<string, number>();
  let sent = 0;
  const outbox = createTransportWorkOutbox({
    send: async (row) => {
      const remaining = failuresByPurpose.get(row.purpose) ?? 0;
      if (remaining > 0) {
        failuresByPurpose.set(row.purpose, remaining - 1);
        return { ok: false, externalMessageRef: null, errorCode: 'telegram_api_error' };
      }
      sent += 1;
      return { ok: true, externalMessageRef: `tg-${sent}` };
    },
  });
  return {
    coreStore,
    outbox,
    service: createWorkGoldenPathService({ coreStore, outbox }),
    failPurpose: (purpose, count) => {
      failuresByPurpose.set(purpose, count);
    },
  };
}

async function admit(harness: Harness): Promise<{ workItemId: string; taskId: string; runId: string }> {
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-desktop',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/desktop-workspace',
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
    taskId: authorized.admission!.taskId!,
    runId: authorized.admission!.runId!,
  };
}

async function project(harness: Harness, taskId: string) {
  return buildWorkGoldenPathDetailProjectionForTask({
    core: await harness.coreStore.readCore(),
    taskId,
    deliveryReader: harness.outbox,
  });
}

// --- Provenance ---------------------------------------------------------------

test('Desktop shows the source, the exact authorized revision, and the owner event', async () => {
  const harness = createHarness();
  const { taskId, runId } = await admit(harness);

  const view = await project(harness, taskId);

  assert.ok(view);
  assert.equal(view.source.transport, 'telegram');
  assert.equal(view.source.bindingId, BINDING_ID);
  assert.equal(view.source.externalConversationRef, CHAT_REF);
  assert.equal(view.source.locale, 'en');

  assert.equal(view.scope.revision, 1);
  assert.equal(view.scope.goal, 'Add a changelog entry for 0.1.21');
  assert.deepEqual(view.scope.acceptanceCriteria, [CRITERION]);
  assert.equal(view.scope.deliveryMode, 'commit_only');
  assert.equal(view.scope.workspacePath, '/tmp/desktop-workspace');

  // FR-24: the evidence that replaces a second Desktop "Start Run" click.
  assert.equal(
    view.authorization.authorizedByActorId,
    (await harness.coreStore.readCore()).ownerProfile.actorId,
  );
  assert.equal(view.authorization.bindingId, BINDING_ID);
  assert.equal(view.authorization.proposalRevision, 1);
  assert.equal(view.authorization.proposalDigest, view.scope.digest);
  assert.ok(view.authorization.admissionKey);

  assert.equal(view.taskId, taskId);
  assert.equal(view.runId, runId);
  assert.equal(view.stage, 'admitted');
  assert.deepEqual(view.recoveryActions, ['cancel']);
});

test('a Task that never came through a transport has no golden-path view', async () => {
  const harness = createHarness();
  await harness.coreStore.updateCore((core) => ({
    ...core,
    tasks: [{
      id: 'task-desktop-only',
      title: 'Created in Desktop',
      status: 'approved',
      conversationId: null,
      ownerActorId: core.ownerProfile.actorId,
      orchestratorActorId: null,
      assignedActorIds: [],
      summary: null,
      approval: {
        status: 'approved',
        requestedAt: null,
        decidedAt: null,
        decidedByActorId: null,
        decisionAction: 'approve',
        notes: null,
      },
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
      metadata: {},
    }],
  }));

  assert.equal(await project(harness, 'task-desktop-only'), null);
});

// --- Evidence and receipts -----------------------------------------------------

test('a delivered run shows its verified evidence and the receipt that closed it', async () => {
  const harness = createHarness();
  const { taskId, runId, workItemId } = await admit(harness);

  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => ({
      status: 'claims_complete',
      summary: 'Edited and committed the changelog.',
      satisfiedCriteria: [CRITERION],
      artifact: null,
      commit: COMMIT,
      blockedReason: null,
    }),
  });
  assert.equal((await runner.drive({ runId })).status, 'delivered');

  const view = await project(harness, taskId);

  assert.ok(view);
  assert.equal(view.stage, 'delivered');
  assert.equal(view.runStatus, 'completed');
  assert.equal(view.evidence.outcomeStatus, 'succeeded');
  assert.equal(view.evidence.commitId, COMMIT.commitId);
  assert.equal(view.evidence.changeSummary, COMMIT.changeSummary);
  assert.equal(view.evidence.validation?.passed, true);
  assert.match(
    view.evidence.validation?.command ?? '',
    /worktree clean at the new HEAD/u,
    'the check is named for what it verifies, not called a test run',
  );
  assert.deepEqual(view.evidence.unmetCriteria, []);

  const receipt = view.delivery.receipt;
  assert.ok(receipt, 'the receipt that made it delivered is visible');
  assert.equal(receipt.purpose, 'result');
  assert.equal(receipt.state, 'sent');
  assert.ok(receipt.externalMessageRef);
  assert.ok(receipt.sentAt);
  assert.deepEqual(view.recoveryActions, ['none']);

  assert.equal(view.workItemId, workItemId);
});

test('an unmet run shows the gap and stays out of delivered', async () => {
  const harness = createHarness();
  const { taskId, runId } = await admit(harness);

  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => ({
      status: 'claims_complete',
      summary: 'I have finished.',
      satisfiedCriteria: [],
      artifact: null,
      commit: null,
      blockedReason: null,
    }),
  });
  await runner.drive({ runId });

  const view = await project(harness, taskId);

  assert.ok(view);
  assert.equal(view.stage, 'decision_needed');
  assert.equal(view.evidence.outcomeStatus, null);
  assert.deepEqual(view.evidence.unmetCriteria, [CRITERION]);
  assert.equal(view.delivery.receipt, null);
  assert.ok(view.blockers.length > 0, 'Desktop states why the run is stuck');
});

// --- Recovery -----------------------------------------------------------------

test('a failed final send exposes retry, and retrying delivers exactly once (FR-46)', async () => {
  const harness = createHarness();
  const { taskId, runId } = await admit(harness);

  // Only the final result send fails; every earlier message got through.
  harness.failPurpose('result', 1);
  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => ({
      status: 'claims_complete',
      summary: 'Committed.',
      satisfiedCriteria: [CRITERION],
      artifact: null,
      commit: COMMIT,
      blockedReason: null,
    }),
  });
  await runner.drive({ runId });

  const before = await project(harness, taskId);
  assert.ok(before);
  assert.notEqual(before.stage, 'delivered');
  assert.ok(before.recoveryActions.includes('retry_delivery'));
  const failedAttempt = before.delivery.attempts.find(
    (attempt) => attempt.purpose === 'result',
  );
  assert.equal(failedAttempt?.state, 'failed');
  assert.equal(failedAttempt?.lastErrorCode, 'telegram_api_error');

  const dependencies = {
    coreStore: harness.coreStore,
    transportWorkDelivery: harness.outbox,
  };
  const retried = await retryWorkGoldenPathDelivery(dependencies, taskId);

  assert.equal(retried.status, 'delivered');
  assert.equal(retried.goldenPath?.stage, 'delivered');
  assert.equal(retried.goldenPath?.delivery.receipt?.state, 'sent');

  // Retrying again is refused rather than sending a second message.
  const again = await retryWorkGoldenPathDelivery(dependencies, taskId);
  assert.equal(again.status, 'not_available');
  assert.match(again.reason ?? '', /no failed delivery/iu);
  assert.equal(
    (await project(harness, taskId))?.delivery.attempts.filter(
      (attempt) => attempt.purpose === 'result',
    ).length,
    1,
    'one result row, one message',
  );
});

test('retry is refused when the host has no outbox', async () => {
  const harness = createHarness();
  const { taskId } = await admit(harness);

  const result = await retryWorkGoldenPathDelivery({ coreStore: harness.coreStore }, taskId);

  assert.equal(result.status, 'not_available');
  assert.match(result.reason ?? '', /no transport delivery outbox/iu);
});

test('retry is refused for a Task that did not arrive through a transport', async () => {
  const harness = createHarness();

  const result = await retryWorkGoldenPathDelivery(
    { coreStore: harness.coreStore, transportWorkDelivery: harness.outbox },
    'task-that-does-not-exist',
  );

  assert.equal(result.status, 'not_available');
  assert.match(result.reason ?? '', /did not arrive through a transport/iu);
});

// --- Hygiene -------------------------------------------------------------------

test('the Desktop view carries no credentials', async () => {
  const harness = createHarness();
  const { taskId } = await admit(harness);

  const serialized = JSON.stringify(await project(harness, taskId));

  assert.ok(!/bot[_-]?token/iu.test(serialized));
  assert.ok(!/api[_-]?key/iu.test(serialized));
  // The workspace path is legitimately shown: Desktop runs on the owner's own
  // machine, unlike a Telegram payload.
  assert.ok(serialized.includes('/tmp/desktop-workspace'));
});
