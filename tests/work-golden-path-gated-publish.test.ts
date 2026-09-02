/**
 * Gated publication (SPEC-114 FR-40..FR-42).
 *
 * The rule these tests defend: authorizing execution never authorizes
 * publication. A mode with external side effects stops at `result_ready`, asks
 * again through an ordinary Cats Core approval, and only acts once the owner
 * says yes — and never twice for the same yes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import { buildApprovalQueue } from '../src/core/model/index.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import type { RuntimeDeliveryClient } from '../src/platform/runtime/deliveryClient.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';
import { createWorkGoldenPathRunner } from '../src/products/work/state/workGoldenPathRunner.js';
import { WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY } from '../src/products/work/state/workGoldenPathPublish.js';

const BINDING_ID = 'binding-publish-test';
const CHAT_REF = 'tg-chat-55';
const OWNER_REF = 'tg-owner';
const CRITERION = 'Branch is pushed';

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/publish-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'push_branch',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

interface DeliveryCall {
  action: string;
  approvalRef: string;
  resumeOperationId?: string | null;
}

function createFakeDeliveryClient(options: {
  pushState?: string;
  prState?: string;
  throwOnPush?: boolean;
  /** Outcomes returned by successive `waitForChecks` calls. */
  checkOutcomes?: Array<'completed' | 'pending' | 'failed'>;
  previewState?: string;
} = {}): { client: RuntimeDeliveryClient; calls: DeliveryCall[] } {
  const calls: DeliveryCall[] = [];
  let waitIndex = 0;
  const client = {
    inspectRepo: async () => ({
      supported: true,
      repository: true,
      clean: true,
      branch: 'feature/x',
      headOid: 'aaaa',
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
    }),
    createCommit: async () => ({ state: 'completed', commitId: 'aaaa', blockedReasons: [] }),
    previewArtifacts: async () => [],
    pushBranch: async ({ approvalRef }: { approvalRef: string }) => {
      if (options.throwOnPush) {
        throw new Error('remote unreachable');
      }
      calls.push({ action: 'push_branch', approvalRef });
      return {
        state: options.pushState ?? 'completed',
        reference: 'feature/x',
        pendingOperationId: null,
        blockedReasons: options.pushState && options.pushState !== 'completed'
          ? ['remote_rejected']
          : [],
      };
    },
    openPullRequest: async ({ approvalRef }: { approvalRef: string }) => {
      calls.push({ action: 'open_pull_request', approvalRef });
      return {
        state: options.prState ?? 'completed',
        reference: 'https://example.test/pr/1',
        pendingOperationId: null,
        blockedReasons: [],
      };
    },
    waitForChecks: async ({ approvalRef, resumeOperationId }: {
      approvalRef: string;
      resumeOperationId?: string | null;
    }) => {
      calls.push({ action: 'wait_for_checks', approvalRef, resumeOperationId: resumeOperationId ?? null });
      const outcome = (options.checkOutcomes ?? ['completed'])[waitIndex] ?? 'completed';
      waitIndex += 1;
      if (outcome === 'pending') {
        return {
          state: 'pending',
          reference: null,
          pendingOperationId: 'op-checks-1',
          blockedReasons: [],
        };
      }
      if (outcome === 'failed') {
        return {
          state: 'blocked',
          reference: null,
          pendingOperationId: null,
          blockedReasons: ['check_failed:build:FAILURE'],
        };
      }
      return { state: 'completed', reference: null, pendingOperationId: null, blockedReasons: [] };
    },
    publishPreview: async ({ approvalRef }: { approvalRef: string }) => {
      calls.push({ action: 'publish_preview', approvalRef });
      return {
        state: options.previewState ?? 'completed',
        reference: 'https://preview.example.test/1',
        pendingOperationId: null,
        blockedReasons: [],
      };
    },
  } as unknown as RuntimeDeliveryClient;
  return { client, calls };
}

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
  sends: Array<{ purpose: string; text: string; actions: string[] }>;
  calls: DeliveryCall[];
}

function createHarness(options: Parameters<typeof createFakeDeliveryClient>[0] = {}): Harness {
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
  const { client, calls } = createFakeDeliveryClient(options);
  return {
    coreStore,
    outbox,
    sends,
    calls,
    service: createWorkGoldenPathService({ coreStore, outbox, deliveryClient: client }),
  };
}

async function runToResultReady(
  harness: Harness,
  deliveryMode: 'push_branch' | 'pr_with_checks' | 'deploy_preview' = 'push_branch',
): Promise<string> {
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-publish',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: OWNER_REF,
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Push the release branch',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/publish-workspace',
    acceptanceCriteria: [CRITERION],
    deliveryMode,
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
  });
  const workItemId = received.workItemId!;
  const startWork = received.offers.find((offer) => offer.action === 'start_work')!;
  const authorized = await harness.service.authorize({
    callbackData: startWork.callbackData,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });

  const runner = createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 2,
    executeStep: async () => ({
      status: 'claims_complete',
      summary: 'Prepared the branch.',
      satisfiedCriteria: [CRITERION],
      artifact: { title: 'Branch summary', path: null, mimeType: 'text/plain' },
      commit: null,
      blockedReason: null,
    }),
  });
  const outcome = await runner.drive({ runId: authorized.admission!.runId! });
  assert.equal(outcome.status, 'result_ready', 'a gated mode must stop before delivering');

  // The decision message carries the publish/deny buttons.
  const decisions = harness.sends.filter((send) => send.purpose === 'decision');
  const decision = decisions[decisions.length - 1]!;
  assert.deepEqual(decision.actions, ['publish', 'deny']);
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'result_ready');

  return workItemId;
}

/**
 * Reads the callbacks the service actually offered.
 *
 * Taken from the durable outbox row rather than reconstructed: the token is
 * opaque by design, and a test that could forge one would not be testing the
 * authorization at all.
 */
function readPublishCallbacks(harness: Harness, workItemId: string): {
  publish: string;
  deny: string;
} {
  const decisionRows = harness.outbox
    .list(workItemId)
    .filter((entry) => entry.purpose === 'decision');
  const row = decisionRows[decisionRows.length - 1];
  assert.ok(row, 'a gated result produces a decision row');
  const publish = row.payload.actions.find((action) => action.action === 'publish');
  const deny = row.payload.actions.find((action) => action.action === 'deny');
  assert.ok(publish && deny, 'both publish and deny are offered');
  return { publish: publish.callbackData, deny: deny.callbackData };
}

// --- The gate holds -----------------------------------------------------------

test('a push_branch result stops at result_ready and opens a Core approval (FR-41)', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness);

  const core = await harness.coreStore.readCore();
  const queue = buildApprovalQueue(core);
  assert.equal(queue.length, 1, 'the publish decision appears in the ordinary approval queue');
  assert.match(queue[0].title, /^Publish: /u);

  const binding = core.approvalBindings.find(
    (candidate) => candidate.approvalTaskId === queue[0].taskId,
  );
  assert.equal(binding?.kind, 'release_gate', 'it is a release gate, not an execution decision');
  assert.equal(binding?.subjectKind, 'run');

  assert.equal(harness.calls.length, 0, 'nothing was pushed before the owner decided');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'result_ready');
  assert.equal(
    harness.sends.filter((send) => send.purpose === 'publish_result').length,
    0,
    'no deliverable is sent while the gate is open',
  );
});

test('execution authorization alone never clears a publish gate (FR-40)', async () => {
  const harness = createHarness();
  await runToResultReady(harness);

  const core = await harness.coreStore.readCore();
  const executionTask = core.tasks.find(
    (task) => task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] === undefined,
  )!;
  assert.equal(executionTask.approval.status, 'approved', 'execution was authorized');

  const publishTask = core.tasks.find(
    (task) => task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] !== undefined,
  )!;
  assert.equal(
    publishTask.approval.status,
    'pending',
    'the publish decision is still outstanding',
  );
});

// --- Approving ----------------------------------------------------------------

test('approving publishes once, carries the approval id, and then delivers', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness);
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.status, 'published');
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].action, 'push_branch');

  const core = await harness.coreStore.readCore();
  const publishTask = core.tasks.find(
    (task) => task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] !== undefined,
  )!;
  assert.equal(publishTask.approval.status, 'approved');
  assert.equal(
    harness.calls[0].approvalRef,
    publishTask.id,
    'the runtime records which Core approval authorized the side effect',
  );

  assert.equal(
    harness.sends.filter((send) => send.purpose === 'publish_result').length,
    1,
    'the deliverable is sent only after the push landed',
  );
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');
});

test('approving twice does not push twice (FR-42)', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness);
  const callbacks = readPublishCallbacks(harness, workItemId);

  const first = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish-1',
    readiness: READINESS,
  });
  const second = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish-2',
    readiness: READINESS,
  });

  assert.equal(first.status, 'published');
  assert.ok(second.status === 'published' || second.status === 'rejected');
  assert.equal(harness.calls.length, 1, 'the external side effect happened exactly once');
  assert.equal(
    harness.outbox.list(workItemId).filter((row) => row.purpose === 'publish_result').length,
    1,
    'one publish result row, one message',
  );
});

test('pr_with_checks pushes, opens the pull request, and waits for checks', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness, 'pr_with_checks');
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.status, 'published');
  assert.deepEqual(
    harness.calls.map((call) => call.action),
    ['push_branch', 'open_pull_request', 'wait_for_checks'],
  );
});

test('deploy_preview pushes and then publishes the preview', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness, 'deploy_preview');
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.status, 'published');
  assert.deepEqual(
    harness.calls.map((call) => call.action),
    ['push_branch', 'publish_preview'],
  );
});

test('checks still running leave the approval open and deliver nothing', async () => {
  const harness = createHarness({ checkOutcomes: ['pending'] });
  const workItemId = await runToResultReady(harness, 'pr_with_checks');
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.rejection, 'pending_checks');
  const core = await harness.coreStore.readCore();
  const publishTask = core.tasks.find(
    (task) => task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] !== undefined,
  )!;
  assert.equal(
    publishTask.approval.status,
    'pending',
    'an unfinished wait must not consume the owner decision',
  );
  assert.equal(
    harness.sends.filter((send) => send.purpose === 'publish_result').length,
    0,
    'nothing is delivered while the checks are still running',
  );
  assert.ok(
    harness.sends.some((send) => send.text.includes('Checks are still running')),
    'the owner is told what is happening',
  );
});

test('publishing again after a pending wait does not push or re-open the PR (FR-42)', async () => {
  const harness = createHarness({ checkOutcomes: ['pending', 'completed'] });
  const workItemId = await runToResultReady(harness, 'pr_with_checks');
  const callbacks = readPublishCallbacks(harness, workItemId);

  await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish-1',
    readiness: READINESS,
  });
  const second = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish-2',
    readiness: READINESS,
  });

  assert.equal(second.status, 'published');
  assert.deepEqual(
    harness.calls.map((call) => call.action),
    ['push_branch', 'open_pull_request', 'wait_for_checks', 'wait_for_checks'],
    'the branch is pushed once and the pull request opened once',
  );
  assert.equal(
    harness.calls[3].resumeOperationId,
    'op-checks-1',
    'the second wait resumes the same runtime operation',
  );
  assert.equal(
    harness.sends.filter((send) => send.purpose === 'publish_result').length,
    1,
  );
});

test('a red check blocks the publish instead of reporting success', async () => {
  const harness = createHarness({ checkOutcomes: ['failed'] });
  const workItemId = await runToResultReady(harness, 'pr_with_checks');
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.status, 'publish_blocked');
  assert.match(result.rejection ?? '', /check_failed:build:FAILURE/u);
  assert.equal(
    harness.sends.filter((send) => send.purpose === 'publish_result').length,
    0,
    'a failed build is not a publication',
  );
});

// --- Denying and failing -------------------------------------------------------

test('denying leaves the result unpublished and tells the owner', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness);
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.deny,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-deny',
    readiness: READINESS,
  });

  assert.equal(result.status, 'publish_denied');
  assert.equal(harness.calls.length, 0, 'nothing left the machine');
  const core = await harness.coreStore.readCore();
  const publishTask = core.tasks.find(
    (task) => task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] !== undefined,
  )!;
  assert.equal(publishTask.approval.status, 'rejected');
  assert.ok(harness.sends.some((send) => send.text.includes('declined')));
  assert.notEqual((await harness.service.describeStage(workItemId))?.stage, 'delivered');
});

test('a failed push keeps the approval pending so the owner can retry', async () => {
  const harness = createHarness({ throwOnPush: true });
  const workItemId = await runToResultReady(harness);
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: OWNER_REF,
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.status, 'publish_blocked');
  assert.match(result.rejection ?? '', /remote unreachable/u);

  const core = await harness.coreStore.readCore();
  const publishTask = core.tasks.find(
    (task) => task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] !== undefined,
  )!;
  assert.equal(
    publishTask.approval.status,
    'pending',
    'a transport failure must not consume the owner decision',
  );
  assert.equal(
    harness.sends.filter((send) => send.purpose === 'publish_result').length,
    0,
    'nothing is reported as published',
  );
  assert.notEqual((await harness.service.describeStage(workItemId))?.stage, 'delivered');
});

test('a publish button from another user fails closed', async () => {
  const harness = createHarness();
  const workItemId = await runToResultReady(harness);
  const callbacks = readPublishCallbacks(harness, workItemId);

  const result = await harness.service.authorize({
    callbackData: callbacks.publish,
    bindingId: BINDING_ID,
    externalUserRef: 'tg-someone-else',
    ownerEventRef: 'tg-callback-publish',
    readiness: READINESS,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.rejection, 'unauthorized_owner');
  assert.equal(harness.calls.length, 0);
});
