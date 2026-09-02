import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createTransportWorkActionTokenStore,
  decodeTransportWorkCallbackData,
  encodeTransportWorkCallbackData,
  isTransportWorkCallbackDataWithinLimit,
} from '../src/platform/transports/work-delivery/actionTokens.js';
import {
  buildTransportWorkDeliveryKey,
  createTransportWorkOutbox,
} from '../src/platform/transports/work-delivery/outbox.js';
import {
  createFileTransportWorkStateStore,
} from '../src/platform/transports/work-delivery/stateStore.js';
import {
  buildTransportWorkProposal,
  isTransportWorkProposalMateriallyChanged,
} from '../src/platform/transports/work-delivery/proposal.js';
import {
  evaluateTransportWorkReadiness,
  resolveDefaultDeliveryMode,
  type TransportWorkReadinessInput,
} from '../src/platform/transports/work-delivery/readiness.js';
import { resolveOutstandingDeliveryGates } from '../src/platform/transports/work-delivery/deliveryGates.js';
import { projectTransportWorkStage } from '../src/platform/transports/work-delivery/stageProjection.js';
import type { TransportWorkStageInput } from '../src/platform/transports/work-delivery/stageProjection.js';
import { evaluateWorkCompletionEvidence } from '../src/products/work/state/workCompletionEvidence.js';
import { TELEGRAM_ALLOWED_UPDATE_KINDS } from '../src/platform/transports/telegram/polling.js';
import type {
  CoreArtifactRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
} from '../src/core/types.js';
import type {
  TransportWorkAction,
  TransportWorkProposalV1,
} from '../src/platform/transports/work-delivery/contracts.js';

const BASE_TIME = new Date('2026-09-02T10:00:00.000Z');

const PAYLOAD = {
  text: 'Result: done',
  deepLink: 'cats://work/items/work-item-1',
  actions: [],
};
const CHAT_REF = 'tg-chat-1';

function frozenClock(offsetMs = 0): () => Date {
  return () => new Date(BASE_TIME.getTime() + offsetMs);
}

function buildProposal(overrides: Partial<Parameters<typeof buildTransportWorkProposal>[0]> = {}) {
  return buildTransportWorkProposal({
    revision: 1,
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: 'project-1',
    workspacePath: '/repos/cats-platform',
    acceptanceCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    deliveryMode: 'commit_only',
    deliveryGates: [],
    sideEffects: ['Writes files inside the selected workspace.'],
    openQuestion: null,
    createdAt: BASE_TIME,
    ...overrides,
  });
}

// --- FR-11: callback ingress -------------------------------------------------

test('long polling requests callback_query updates (FR-11)', () => {
  assert.ok(
    TELEGRAM_ALLOWED_UPDATE_KINDS.includes('callback_query'),
    'callback_query must be in allowed_updates or Telegram withholds every inline action',
  );
  assert.ok(TELEGRAM_ALLOWED_UPDATE_KINDS.includes('message'));
  assert.ok(TELEGRAM_ALLOWED_UPDATE_KINDS.includes('edited_message'));
});

// --- FR-13: opaque action tokens --------------------------------------------

test('callback data carries only a bounded opaque token (FR-13)', () => {
  const store = createTransportWorkActionTokenStore({ now: frozenClock() });
  const token = store.issue({
    bindingId: 'binding-1',
    ownerActorId: 'actor-owner',
    externalUserRef: 'tg-user-1',
    workItemId: 'work-item-1',
    proposalRevision: 1,
    proposalDigest: 'digest-1',
    action: 'start_work',
  });
  const callbackData = encodeTransportWorkCallbackData(token.token);

  assert.ok(isTransportWorkCallbackDataWithinLimit(callbackData));
  assert.equal(decodeTransportWorkCallbackData(callbackData), token.token);
  assert.ok(!callbackData.includes('work-item-1'), 'entity ids must not leak into callback data');
  assert.ok(!callbackData.includes('actor-owner'), 'actor ids must not leak into callback data');
});

test('action tokens fail closed on cross-binding, wrong owner, stale revision, and expiry', () => {
  let clockOffset = 0;
  const store = createTransportWorkActionTokenStore({
    now: () => new Date(BASE_TIME.getTime() + clockOffset),
    ttlMs: 60_000,
  });
  const token = store.issue({
    bindingId: 'binding-1',
    ownerActorId: 'actor-owner',
    externalUserRef: 'tg-user-1',
    workItemId: 'work-item-1',
    proposalRevision: 2,
    proposalDigest: 'digest-2',
    action: 'start_work',
  });
  const callbackData = encodeTransportWorkCallbackData(token.token);
  const scope = (overrides: {
    proposalRevision?: number | null;
    proposalDigest?: string | null;
    allowedActions?: readonly TransportWorkAction[];
  } = {}) => () => ({
    proposalRevision: 2,
    proposalDigest: 'digest-2',
    allowedActions: ['start_work'] as readonly TransportWorkAction[],
    ...overrides,
  });
  const valid = {
    callbackData,
    bindingId: 'binding-1',
    externalUserRef: 'tg-user-1',
    resolveScope: scope(),
  };

  assert.equal(store.resolve(valid).status, 'resolved');

  assert.deepEqual(
    store.resolve({ ...valid, bindingId: 'binding-2' }),
    { status: 'rejected', reason: 'cross_binding' },
  );
  assert.deepEqual(
    store.resolve({ ...valid, externalUserRef: 'tg-user-2' }),
    { status: 'rejected', reason: 'unauthorized_owner' },
  );
  assert.deepEqual(
    store.resolve({ ...valid, resolveScope: scope({ proposalRevision: 3 }) }),
    { status: 'rejected', reason: 'stale_revision' },
  );
  assert.deepEqual(
    store.resolve({ ...valid, resolveScope: scope({ proposalDigest: 'digest-3' }) }),
    { status: 'rejected', reason: 'digest_mismatch' },
  );
  assert.deepEqual(
    store.resolve({ ...valid, resolveScope: scope({ allowedActions: ['cancel'] }) }),
    { status: 'rejected', reason: 'action_not_allowed' },
  );
  assert.deepEqual(
    store.resolve({ ...valid, resolveScope: () => null }),
    { status: 'rejected', reason: 'unknown_token' },
  );
  assert.deepEqual(
    store.resolve({ ...valid, callbackData: encodeTransportWorkCallbackData('forged') }),
    { status: 'rejected', reason: 'unknown_token' },
  );

  clockOffset = 61_000;
  assert.deepEqual(store.resolve(valid), { status: 'rejected', reason: 'expired' });
});

test('scope is resolved for the work item the token names, not the first on the binding', () => {
  const store = createTransportWorkActionTokenStore({ now: frozenClock() });
  const older = store.issue({
    bindingId: 'binding-1',
    ownerActorId: 'actor-owner',
    externalUserRef: 'tg-user-1',
    workItemId: 'work-item-older',
    proposalRevision: 4,
    proposalDigest: 'digest-older',
    action: 'start_work',
  });
  const newer = store.issue({
    bindingId: 'binding-1',
    ownerActorId: 'actor-owner',
    externalUserRef: 'tg-user-1',
    workItemId: 'work-item-newer',
    proposalRevision: 1,
    proposalDigest: 'digest-newer',
    action: 'start_work',
  });

  // Two open requests on one binding, each with its own revision.
  const scopes: Record<string, { proposalRevision: number; proposalDigest: string }> = {
    'work-item-older': { proposalRevision: 4, proposalDigest: 'digest-older' },
    'work-item-newer': { proposalRevision: 1, proposalDigest: 'digest-newer' },
  };
  const resolveScope = (workItemId: string) => {
    const found = scopes[workItemId];
    return found
      ? { ...found, allowedActions: ['start_work'] as readonly TransportWorkAction[] }
      : null;
  };

  for (const token of [older, newer]) {
    assert.equal(
      store.resolve({
        callbackData: encodeTransportWorkCallbackData(token.token),
        bindingId: 'binding-1',
        externalUserRef: 'tg-user-1',
        resolveScope,
      }).status,
      'resolved',
      `${token.workItemId} must resolve against its own revision`,
    );
  }
});

test('changing scope invalidates outstanding tokens for that work item (FR-17)', () => {
  const store = createTransportWorkActionTokenStore({ now: frozenClock() });
  for (const action of ['start_work', 'cancel', 'view'] as const) {
    store.issue({
      bindingId: 'binding-1',
      ownerActorId: 'actor-owner',
      externalUserRef: 'tg-user-1',
      workItemId: 'work-item-1',
      proposalRevision: 1,
      proposalDigest: 'digest-1',
      action,
    });
  }
  store.issue({
    bindingId: 'binding-1',
    ownerActorId: 'actor-owner',
    externalUserRef: 'tg-user-1',
    workItemId: 'work-item-2',
    proposalRevision: 1,
    proposalDigest: 'other',
    action: 'start_work',
  });

  assert.equal(store.size(), 4);
  assert.equal(store.invalidateWorkItem('work-item-1'), 3);
  assert.equal(store.size(), 1, 'other work items keep their tokens');
});

// --- FR-17: proposal digest --------------------------------------------------

test('proposal digest covers execution-relevant fields only (FR-17)', () => {
  const base = buildProposal();

  const rerendered = buildProposal({ createdAt: new Date('2026-09-03T00:00:00.000Z') });
  assert.equal(rerendered.digest, base.digest, 'timestamp alone must not invalidate a confirmation');

  const questionResolved = buildProposal({ openQuestion: 'Which branch?' });
  assert.equal(questionResolved.digest, base.digest, 'an open question is not execution-relevant');

  const modeChanged = buildProposal({ deliveryMode: 'artifact_only' });
  assert.notEqual(modeChanged.digest, base.digest);
  assert.ok(isTransportWorkProposalMateriallyChanged(base, modeChanged));

  const criteriaChanged = buildProposal({ acceptanceCriteria: ['Something else entirely'] });
  assert.notEqual(criteriaChanged.digest, base.digest);

  const workspaceChanged = buildProposal({ workspacePath: '/repos/other' });
  assert.notEqual(workspaceChanged.digest, base.digest);
});

// --- FR-1..FR-5: readiness ---------------------------------------------------

const READY_INPUT = {
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude-opus-5',
  capabilityProfileResolved: true,
  workspacePath: '/repos/cats-platform',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only' as const,
  deliveryGates: [] as const,
  backgroundServiceAvailable: true,
} satisfies TransportWorkReadinessInput;

test('readiness reports every blocker with a remediation target (FR-3)', () => {
  assert.deepEqual(evaluateTransportWorkReadiness(READY_INPUT), { ready: true, blockers: [] });

  const missing = evaluateTransportWorkReadiness({
    ...READY_INPUT,
    executionTargetId: null,
    capabilityProfileResolved: false,
    backgroundServiceAvailable: false,
  });
  assert.equal(missing.ready, false);
  assert.deepEqual(
    missing.blockers.map((blocker) => blocker.reason).sort(),
    ['background_service_unavailable', 'capability_profile_missing', 'execution_target_missing'],
    'all blockers are reported at once, not one per round trip',
  );
  for (const blocker of missing.blockers) {
    assert.ok(blocker.remediationKey.startsWith('workDelivery.readiness.'));
    assert.ok(blocker.remediationPath !== null);
  }
});

test('a disabled binding is not also reported as unhealthy', () => {
  const result = evaluateTransportWorkReadiness({ ...READY_INPUT, bindingEnabled: false });
  const reasons = result.blockers.map((blocker) => blocker.reason);
  assert.ok(reasons.includes('binding_disabled'));
  assert.ok(!reasons.includes('binding_unhealthy'));
});

test('default delivery mode follows workspace type', () => {
  assert.equal(
    resolveDefaultDeliveryMode({ workspacePath: '/repos/cats-platform', isRepo: true }),
    'commit_only',
  );
  assert.equal(
    resolveDefaultDeliveryMode({ workspacePath: '/notes', isRepo: false }),
    'artifact_only',
  );
  assert.equal(resolveDefaultDeliveryMode({ workspacePath: null, isRepo: true }), 'artifact_only');
});

// --- FR-40/FR-41: publish gates ---------------------------------------------

test('high-side-effect modes always keep an owner gate in the first slice (FR-41)', () => {
  assert.deepEqual(
    resolveOutstandingDeliveryGates({
      deliveryMode: 'commit_only',
      effectiveGates: [],
      satisfiedGates: [],
      publishesPublicArtifact: false,
    }),
    [],
  );
  assert.deepEqual(
    resolveOutstandingDeliveryGates({
      deliveryMode: 'push_branch',
      effectiveGates: [],
      satisfiedGates: [],
      publishesPublicArtifact: false,
    }),
    ['owner_approval_required'],
  );
  assert.deepEqual(
    resolveOutstandingDeliveryGates({
      deliveryMode: 'artifact_only',
      effectiveGates: [],
      satisfiedGates: [],
      publishesPublicArtifact: true,
    }),
    ['publish_artifact_required'],
  );
  assert.deepEqual(
    resolveOutstandingDeliveryGates({
      deliveryMode: 'pr_with_checks',
      effectiveGates: ['manual_review_required'],
      satisfiedGates: ['manual_review_required'],
      publishesPublicArtifact: false,
    }),
    ['owner_approval_required'],
    'satisfying one gate does not clear an unrelated one',
  );
});

// --- FR-30/FR-31: completion evidence ---------------------------------------

function readyArtifact(): CoreArtifactRecord {
  return {
    id: 'artifact-1',
    title: 'Result',
    kind: 'document',
    status: 'ready',
    projectId: null,
    workItemId: 'work-item-1',
    conversationId: null,
    taskId: null,
    runId: 'run-1',
    path: '/tmp/result.md',
    mimeType: 'text/markdown',
    sizeBytes: null,
    summary: null,
    createdAt: BASE_TIME.toISOString(),
    updatedAt: BASE_TIME.toISOString(),
    metadata: {},
  };
}

test('a provider response alone does not satisfy completion (FR-30)', () => {
  const result = evaluateWorkCompletionEvidence({
    deliveryMode: 'artifact_only',
    acceptanceCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
    satisfiedCriteria: [],
    outcomeStatus: 'succeeded',
    artifacts: [],
    commit: null,
  });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.gaps.sort(), ['acceptance_criteria_unmet', 'no_ready_artifact']);
  assert.deepEqual(result.unmetCriteria, ['CHANGELOG.md contains a 0.1.21 section']);
});

test('artifact_only accepts a ready artifact plus met criteria (FR-31)', () => {
  const result = evaluateWorkCompletionEvidence({
    deliveryMode: 'artifact_only',
    acceptanceCriteria: ['Ship the note'],
    satisfiedCriteria: ['ship the note'],
    outcomeStatus: 'succeeded',
    artifacts: [readyArtifact()],
    commit: null,
  });
  assert.deepEqual(result, { accepted: true, gaps: [], unmetCriteria: [] });
});

test('commit_only requires an immutable commit id and validation evidence (FR-31)', () => {
  const criteria = { acceptanceCriteria: ['Done'], satisfiedCriteria: ['Done'] };

  const branchName = evaluateWorkCompletionEvidence({
    deliveryMode: 'commit_only',
    ...criteria,
    outcomeStatus: 'succeeded',
    artifacts: [],
    commit: { commitId: 'main', changeSummary: 'x', validation: { command: 'npm test', passed: true } },
  });
  assert.deepEqual(branchName.gaps, ['no_commit_evidence'], 'a branch name is not a commit id');

  const noValidation = evaluateWorkCompletionEvidence({
    deliveryMode: 'commit_only',
    ...criteria,
    outcomeStatus: 'succeeded',
    artifacts: [],
    commit: { commitId: 'a1b2c3d4e5', changeSummary: 'x', validation: null },
  });
  assert.deepEqual(noValidation.gaps, ['no_validation_evidence']);

  const failing = evaluateWorkCompletionEvidence({
    deliveryMode: 'commit_only',
    ...criteria,
    outcomeStatus: 'succeeded',
    artifacts: [],
    commit: {
      commitId: 'a1b2c3d4e5',
      changeSummary: 'x',
      validation: { command: 'npm test', passed: false },
    },
  });
  assert.deepEqual(failing.gaps, ['no_validation_evidence']);

  const accepted = evaluateWorkCompletionEvidence({
    deliveryMode: 'commit_only',
    ...criteria,
    outcomeStatus: 'succeeded',
    artifacts: [],
    commit: {
      commitId: 'a1b2c3d4e5',
      changeSummary: 'Added changelog entry',
      validation: { command: 'npm test', passed: true },
    },
  });
  assert.equal(accepted.accepted, true);
});

test('push and publication modes require commit evidence before their external action', () => {
  for (const deliveryMode of ['push_branch', 'pr_with_checks', 'deploy_preview'] as const) {
    const withoutCommit = evaluateWorkCompletionEvidence({
      deliveryMode,
      acceptanceCriteria: ['Branch contains the requested change'],
      satisfiedCriteria: ['Branch contains the requested change'],
      outcomeStatus: 'succeeded',
      artifacts: [readyArtifact()],
      commit: null,
    });
    assert.equal(withoutCommit.accepted, false, `${deliveryMode} cannot publish uncommitted edits`);
    assert.ok(withoutCommit.gaps.includes('no_commit_evidence'));
  }
});

// --- FR-32/FR-33/FR-45..FR-47: outbox ---------------------------------------

function deliveryKey(purpose: 'ack' | 'progress' | 'decision' | 'result', discriminator: string) {
  return buildTransportWorkDeliveryKey({
    bindingId: 'binding-1',
    workItemId: 'work-item-1',
    purpose,
    discriminator,
  });
}

test('one idempotency key sends at most one external message (FR-42)', async () => {
  let sends = 0;
  const outbox = createTransportWorkOutbox({
    now: frozenClock(),
    send: async () => {
      sends += 1;
      return { ok: true, externalMessageRef: `msg-${sends}` };
    },
  });
  const key = deliveryKey('result', 'run-1');
  const input = {
    idempotencyKey: key,
    bindingId: 'binding-1',
    externalConversationRef: CHAT_REF,
    workItemId: 'work-item-1',
    purpose: 'result' as const,
    payload: PAYLOAD,
  };

  outbox.enqueue(input);
  outbox.enqueue(input);
  const first = await outbox.flush(key);
  const second = await outbox.flush(key);

  assert.equal(sends, 1);
  assert.equal(first.outcome, 'sent');
  assert.equal(second.outcome, 'already_sent');
  assert.equal(second.row.externalMessageRef, 'msg-1');
  assert.equal(outbox.list('work-item-1').length, 1);
  assert.equal(outbox.hasDeliveredResult('work-item-1'), true);
});

test('a stale routine progress message is suppressed, never delivered late (FR-33)', async () => {
  const sent: string[] = [];
  const outbox = createTransportWorkOutbox({
    now: frozenClock(),
    send: async (row) => {
      sent.push(`${row.purpose}:${row.sequence}`);
      return { ok: true, externalMessageRef: `msg-${row.sequence}` };
    },
  });

  outbox.enqueue({
    idempotencyKey: deliveryKey('progress', 'running'),
    bindingId: 'binding-1',
    externalConversationRef: CHAT_REF,
    workItemId: 'work-item-1',
    purpose: 'progress',
    payload: PAYLOAD,
  });
  outbox.enqueue({
    idempotencyKey: deliveryKey('decision', 'blocked'),
    bindingId: 'binding-1',
    externalConversationRef: CHAT_REF,
    workItemId: 'work-item-1',
    purpose: 'decision',
    payload: PAYLOAD,
  });

  const results = await outbox.flushWorkItem('work-item-1');

  assert.deepEqual(results.map((entry) => entry.outcome), ['suppressed_stale', 'sent']);
  assert.deepEqual(sent, ['decision:2'], 'only the newer decision reaches the transport');
});

test('an ambiguous send requires an explicit owner retry (FR-47)', async () => {
  let attempt = 0;
  const outbox = createTransportWorkOutbox({
    now: frozenClock(),
    send: async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('socket hang up');
      }
      return { ok: true, externalMessageRef: 'msg-late' };
    },
  });
  const key = deliveryKey('result', 'run-1');
  outbox.enqueue({
    idempotencyKey: key,
    bindingId: 'binding-1',
    externalConversationRef: CHAT_REF,
    workItemId: 'work-item-1',
    purpose: 'result',
    payload: PAYLOAD,
  });

  const first = await outbox.flush(key);
  assert.equal(first.outcome, 'ambiguous');
  assert.equal(first.row.state, 'ambiguous', 'an unproven send must not be auto-redriven');
  assert.equal(outbox.hasDeliveredResult('work-item-1'), false);

  const second = await outbox.flush(key);
  assert.equal(second.outcome, 'ambiguous');
  assert.equal(second.row.attemptCount, 1);
  assert.equal(attempt, 1, 'automatic flush must not duplicate an ambiguous message');

  const retried = await outbox.retry(key);
  assert.equal(retried.outcome, 'sent');
  assert.equal(retried.row.attemptCount, 2);
});

test('concurrent flushes for one key join the same transport send', async () => {
  let sends = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const outbox = createTransportWorkOutbox({
    now: frozenClock(),
    send: async () => {
      sends += 1;
      await blocked;
      return { ok: true, externalMessageRef: 'msg-one' };
    },
  });
  const key = deliveryKey('result', 'concurrent');
  outbox.enqueue({
    idempotencyKey: key,
    bindingId: 'binding-1',
    externalConversationRef: CHAT_REF,
    workItemId: 'work-item-1',
    purpose: 'result',
    payload: PAYLOAD,
  });

  const first = outbox.flush(key);
  const second = outbox.flush(key);
  await Promise.resolve();
  assert.equal(sends, 1);
  release();
  assert.equal((await first).outcome, 'sent');
  assert.equal((await second).outcome, 'sent');
  assert.equal(sends, 1);
});

test('durable outbox rows and callback grants survive reconstruction', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cats-work-state-'));
  const statePath = path.join(directory, 'state.json');
  try {
    const state = createFileTransportWorkStateStore(statePath);
    const tokenStore = createTransportWorkActionTokenStore({
      now: frozenClock(),
      store: state,
      randomToken: () => 'restart-token',
    });
    const token = tokenStore.issue({
      bindingId: 'binding-1',
      ownerActorId: 'actor-owner',
      externalUserRef: 'tg-user-1',
      workItemId: 'work-item-1',
      proposalRevision: 1,
      proposalDigest: 'digest-1',
      action: 'start_work',
    });
    const beforeRestart = createTransportWorkOutbox({
      now: frozenClock(),
      store: state,
      send: async () => ({ ok: true, externalMessageRef: 'unused' }),
    });
    const key = deliveryKey('result', 'restart-pending');
    beforeRestart.enqueue({
      idempotencyKey: key,
      bindingId: 'binding-1',
      externalConversationRef: CHAT_REF,
      workItemId: 'work-item-1',
      purpose: 'result',
      payload: PAYLOAD,
    });

    const recoveredState = createFileTransportWorkStateStore(statePath);
    const recoveredTokens = createTransportWorkActionTokenStore({
      now: frozenClock(),
      store: recoveredState,
    });
    assert.equal(recoveredTokens.resolve({
      callbackData: encodeTransportWorkCallbackData(token.token),
      bindingId: 'binding-1',
      externalUserRef: 'tg-user-1',
      resolveScope: () => ({
        proposalRevision: 1,
        proposalDigest: 'digest-1',
        allowedActions: ['start_work'],
      }),
    }).status, 'resolved');

    let sends = 0;
    const recoveredOutbox = createTransportWorkOutbox({
      now: frozenClock(),
      store: recoveredState,
      send: async () => {
        sends += 1;
        return { ok: true, externalMessageRef: 'msg-after-restart' };
      },
    });
    const results = await recoveredOutbox.recoverPending();
    assert.equal(results[0]?.outcome, 'sent');
    assert.equal(sends, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a row interrupted while sending becomes ambiguous after restart', async () => {
  let sends = 0;
  const key = deliveryKey('result', 'interrupted');
  const outbox = createTransportWorkOutbox({
    now: frozenClock(),
    send: async () => {
      sends += 1;
      return { ok: true, externalMessageRef: 'duplicate' };
    },
    initialRows: [{
      version: 1,
      idempotencyKey: key,
      bindingId: 'binding-1',
      externalConversationRef: CHAT_REF,
      workItemId: 'work-item-1',
      taskId: null,
      runId: 'run-1',
      purpose: 'result',
      payload: PAYLOAD,
      state: 'sending',
      externalMessageRef: null,
      attemptCount: 1,
      lastErrorCode: null,
      sequence: 1,
      createdAt: BASE_TIME.toISOString(),
      updatedAt: BASE_TIME.toISOString(),
      sentAt: null,
    }],
  });

  const recovered = await outbox.flush(key);
  assert.equal(recovered.outcome, 'ambiguous');
  assert.equal(recovered.row.lastErrorCode, 'interrupted_send');
  assert.equal(sends, 0);
});

test('outbox rows recovered after a restart are not resent (FR-45)', async () => {
  let sends = 0;
  const key = deliveryKey('result', 'run-1');
  const outbox = createTransportWorkOutbox({
    now: frozenClock(),
    send: async () => {
      sends += 1;
      return { ok: true, externalMessageRef: 'msg-restart' };
    },
    initialRows: [{
      version: 1,
      idempotencyKey: key,
      bindingId: 'binding-1',
      externalConversationRef: CHAT_REF,
      workItemId: 'work-item-1',
      taskId: null,
      runId: 'run-1',
      purpose: 'result',
      payload: PAYLOAD,
      state: 'sent',
      externalMessageRef: 'msg-before-restart',
      attemptCount: 1,
      lastErrorCode: null,
      sequence: 1,
      createdAt: BASE_TIME.toISOString(),
      updatedAt: BASE_TIME.toISOString(),
      sentAt: BASE_TIME.toISOString(),
    }],
  });

  outbox.enqueue({
    idempotencyKey: key,
    bindingId: 'binding-1',
    externalConversationRef: CHAT_REF,
    workItemId: 'work-item-1',
    purpose: 'result',
    payload: PAYLOAD,
  });
  const flushed = await outbox.flush(key);

  assert.equal(sends, 0, 'a row that already reached sent must never send again');
  assert.equal(flushed.outcome, 'already_sent');
  assert.equal(flushed.row.externalMessageRef, 'msg-before-restart');
});

// --- ADR-112 section 2: stage projection ------------------------------------

function stageInput(overrides: Partial<TransportWorkStageInput> = {}): TransportWorkStageInput {
  const workItem: CoreWorkItemRecord = {
    id: 'work-item-1',
    title: 'Add a changelog entry',
    status: 'ready',
    projectId: null,
    conversationId: 'conversation-1',
    taskId: null,
    parentWorkItemId: null,
    ownerActorId: 'actor-owner',
    assignedActorIds: [],
    summary: null,
    createdAt: BASE_TIME.toISOString(),
    updatedAt: BASE_TIME.toISOString(),
    metadata: {},
  };
  return {
    workItem,
    proposal: null,
    task: null,
    run: null,
    outcome: null,
    artifacts: [],
    commitId: null,
    outstandingGates: [],
    deliveryRows: [],
    awaitingOwnerDecision: false,
    ...overrides,
  };
}

function approvedTask(): CoreTaskRecord {
  return {
    id: 'task-1',
    title: 'Add a changelog entry',
    status: 'approved',
    conversationId: 'conversation-1',
    ownerActorId: 'actor-owner',
    orchestratorActorId: 'actor-work-golden-path',
    assignedActorIds: [],
    summary: null,
    approval: {
      status: 'approved',
      requestedAt: BASE_TIME.toISOString(),
      decidedAt: BASE_TIME.toISOString(),
      decidedByActorId: 'actor-owner',
      decisionAction: 'approve',
      notes: null,
    },
    createdAt: BASE_TIME.toISOString(),
    updatedAt: BASE_TIME.toISOString(),
    metadata: {},
  };
}

function run(status: CoreRunRecord['status']): CoreRunRecord {
  return {
    id: 'run-1',
    title: 'Add a changelog entry',
    status,
    conversationId: 'conversation-1',
    taskId: 'task-1',
    parentRunId: null,
    orchestratorActorId: 'actor-work-golden-path',
    traceId: null,
    summary: null,
    createdAt: BASE_TIME.toISOString(),
    startedAt: null,
    completedAt: null,
    updatedAt: BASE_TIME.toISOString(),
    metadata: {},
  };
}

const PROPOSAL: TransportWorkProposalV1 = buildProposal();

test('stage projection walks the golden path in order (ADR-112 section 2)', () => {
  assert.equal(projectTransportWorkStage(stageInput()).stage, 'received');

  assert.equal(
    projectTransportWorkStage(stageInput({ proposal: PROPOSAL })).stage,
    'scope_proposed',
  );

  assert.equal(
    projectTransportWorkStage(stageInput({ proposal: PROPOSAL, task: approvedTask() })).stage,
    'execution_authorized',
  );

  assert.equal(
    projectTransportWorkStage(stageInput({
      proposal: PROPOSAL,
      task: approvedTask(),
      run: run('queued'),
    })).stage,
    'admitted',
  );

  assert.equal(
    projectTransportWorkStage(stageInput({
      proposal: PROPOSAL,
      task: approvedTask(),
      run: run('running'),
    })).stage,
    'running',
  );

  assert.equal(
    projectTransportWorkStage(stageInput({
      proposal: PROPOSAL,
      task: approvedTask(),
      run: run('blocked'),
    })).stage,
    'decision_needed',
  );
});

test('result evidence without a satisfied gate stays result_ready (FR-40)', () => {
  const projection = projectTransportWorkStage(stageInput({
    proposal: PROPOSAL,
    task: approvedTask(),
    run: run('completed'),
    outcome: {
      id: 'outcome-1',
      title: 'Add a changelog entry',
      status: 'succeeded',
      conversationId: 'conversation-1',
      runId: 'run-1',
      taskId: 'task-1',
      summary: null,
      recordedAt: BASE_TIME.toISOString(),
      updatedAt: BASE_TIME.toISOString(),
      metadata: {},
    },
    commitId: 'a1b2c3d4',
    outstandingGates: ['owner_approval_required'],
  }));

  assert.equal(projection.stage, 'result_ready');
  assert.ok(projection.allowedActions.includes('publish'));
});

test('delivered is defined by a persisted receipt, not by the Run (ADR-112 section 6)', () => {
  const projection = projectTransportWorkStage(stageInput({
    proposal: PROPOSAL,
    task: approvedTask(),
    run: run('completed'),
    deliveryRows: [{
      version: 1,
      idempotencyKey: 'twd:binding-1:work-item-1:result:run-1',
      bindingId: 'binding-1',
      externalConversationRef: CHAT_REF,
      workItemId: 'work-item-1',
      taskId: 'task-1',
      runId: 'run-1',
      purpose: 'result',
      payload: PAYLOAD,
      state: 'sent',
      externalMessageRef: 'msg-1',
      attemptCount: 1,
      lastErrorCode: null,
      sequence: 1,
      createdAt: BASE_TIME.toISOString(),
      updatedAt: BASE_TIME.toISOString(),
      sentAt: BASE_TIME.toISOString(),
    }],
  }));

  assert.equal(projection.stage, 'delivered');
});

test('a failed delivery leaves the work at result_ready, not delivered (FR-46)', () => {
  const projection = projectTransportWorkStage(stageInput({
    proposal: PROPOSAL,
    task: approvedTask(),
    run: run('completed'),
    outcome: {
      id: 'outcome-1',
      title: 'Add a changelog entry',
      status: 'succeeded',
      conversationId: 'conversation-1',
      runId: 'run-1',
      taskId: 'task-1',
      summary: null,
      recordedAt: BASE_TIME.toISOString(),
      updatedAt: BASE_TIME.toISOString(),
      metadata: {},
    },
    commitId: 'a1b2c3d4',
    outstandingGates: ['owner_approval_required'],
    deliveryRows: [{
      version: 1,
      idempotencyKey: 'twd:binding-1:work-item-1:result:run-1',
      bindingId: 'binding-1',
      externalConversationRef: CHAT_REF,
      workItemId: 'work-item-1',
      taskId: 'task-1',
      runId: 'run-1',
      purpose: 'result',
      payload: PAYLOAD,
      state: 'failed',
      externalMessageRef: null,
      attemptCount: 3,
      lastErrorCode: 'telegram_api_error',
      sequence: 1,
      createdAt: BASE_TIME.toISOString(),
      updatedAt: BASE_TIME.toISOString(),
      sentAt: null,
    }],
  }));

  assert.equal(projection.stage, 'result_ready');
});
