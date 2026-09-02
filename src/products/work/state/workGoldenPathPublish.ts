/**
 * Gated publication for the golden path (SPEC-114 FR-40..FR-42).
 *
 * Execution authorization and publication authorization are different risk
 * boundaries. Confirming "Start work" said the owner accepted a *scope*; it
 * never said they accepted a side effect that only became visible once the work
 * ran. So a gated mode stops at `result_ready` and asks again.
 *
 * The publish decision is an ordinary Cats Core approval — a Task in
 * `pending_approval` bound to the Run by a `release_gate` binding — which means
 * it appears in the existing approval queue and Desktop surfaces for free, and
 * no transport ever infers it.
 */

import { createHash } from 'node:crypto';

import {
  appendCoreActivity,
  upsertCoreApprovalBinding,
  upsertCoreTask,
  writeApprovalDecision,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type {
  CatsCoreState,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreRecordMetadata,
  CoreRuntimeDeliveryAction,
} from '../../../core/types.js';
import type {
  RuntimeDeliveryClient,
  RuntimePublishOutcome,
} from '../../../platform/runtime/deliveryClient.js';
import type { TransportWorkProposalV1 } from '../../../platform/transports/work-delivery/contracts.js';

export const WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY = 'workGoldenPathPublish';

/**
 * External actions each mode performs at publish time, in order.
 *
 * This mirrors `deliveryActionsForMode` in `core/governance.ts`; that function
 * declares what a mode *means*, this one is what actually runs.
 */
const PUBLISH_ACTIONS: Partial<Record<CoreDeliveryMode, CoreRuntimeDeliveryAction[]>> = {
  artifact_only: [],
  commit_only: [],
  push_branch: ['push_branch'],
  pr_with_checks: ['push_branch', 'open_pull_request', 'wait_for_checks'],
  deploy_preview: ['push_branch', 'publish_preview'],
};

export interface WorkGoldenPathPublishRequest {
  workItemId: string;
  runId: string;
  taskId: string | null;
  bindingId: string;
  proposal: TransportWorkProposalV1;
  outstandingGates: readonly CoreDeliveryGate[];
  ownerActorId: string;
  actorRef: string;
  /** Runtime-owned cwd/session captured with the accepted evidence. */
  deliveryWorkspacePath: string | null;
  deliverySessionId: string | null;
}

export interface WorkGoldenPathPublishApprovalRef {
  approvalTaskId: string;
  publishKey: string;
  created: boolean;
}

export type WorkGoldenPathPublishStatus =
  | 'published'
  | 'already_published'
  | 'denied'
  | 'pending_checks'
  | 'blocked'
  | 'not_pending';

export interface WorkGoldenPathPublishResult {
  status: WorkGoldenPathPublishStatus;
  publishKey: string;
  approvalTaskId: string;
  performedActions: CoreRuntimeDeliveryAction[];
  reference: string | null;
  /** Set when `status` is `pending_checks`; resumes the same runtime wait. */
  pendingOperationId: string | null;
  blockedReasons: string[];
}

/**
 * Stable over the scope the owner is being asked to publish.
 *
 * Excludes the owner event, so a double tap converges on the same publish
 * rather than performing the side effect twice (FR-42).
 */
export function buildWorkGoldenPathPublishKey(input: {
  bindingId: string;
  workItemId: string;
  proposalRevision: number;
  proposalDigest: string;
  deliveryMode: CoreDeliveryMode;
}): string {
  return [
    'wgp-publish',
    input.bindingId,
    input.workItemId,
    String(input.proposalRevision),
    input.proposalDigest,
    input.deliveryMode,
  ].join(':');
}

function publishApprovalTaskId(publishKey: string): string {
  return `task-wgp-publish-${createHash('sha256').update(publishKey).digest('hex').slice(0, 20)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPublishEnvelope(metadata: CoreRecordMetadata | undefined): {
  publishKey: string | null;
  performedActions: CoreRuntimeDeliveryAction[];
  reference: string | null;
  completedAt: string | null;
  pendingOperationId: string | null;
} | null {
  const envelope = isRecord(metadata)
    ? metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]
    : null;
  if (!isRecord(envelope)) {
    return null;
  }
  return {
    publishKey: typeof envelope.publishKey === 'string' ? envelope.publishKey : null,
    performedActions: Array.isArray(envelope.performedActions)
      ? envelope.performedActions as CoreRuntimeDeliveryAction[]
      : [],
    reference: typeof envelope.reference === 'string' ? envelope.reference : null,
    completedAt: typeof envelope.completedAt === 'string' ? envelope.completedAt : null,
    pendingOperationId: typeof envelope.pendingOperationId === 'string'
      ? envelope.pendingOperationId
      : null,
  };
}

/**
 * Creates (or resolves) the pending publish approval.
 *
 * The approval Task carries the effective policy, the exact proposal revision,
 * and the publish key, so an owner deciding it later is deciding the same thing
 * they were shown (FR-42).
 */
export async function requestWorkGoldenPathPublishApproval(
  coreStore: CoreStore,
  input: WorkGoldenPathPublishRequest,
  now: () => Date = () => new Date(),
): Promise<WorkGoldenPathPublishApprovalRef> {
  const publishKey = buildWorkGoldenPathPublishKey({
    bindingId: input.bindingId,
    workItemId: input.workItemId,
    proposalRevision: input.proposal.revision,
    proposalDigest: input.proposal.digest,
    deliveryMode: input.proposal.deliveryMode,
  });
  const approvalTaskId = publishApprovalTaskId(publishKey);
  let created = false;

  await coreStore.updateCore((core) => {
    if (core.tasks.some((task) => task.id === approvalTaskId)) {
      return core;
    }
    const taskWrite = upsertCoreTask(
      core,
      {
        id: approvalTaskId,
        title: `Publish: ${input.proposal.goal}`,
        status: 'pending_approval',
        conversationId: input.proposal.projectId === null ? null : null,
        ownerActorId: input.ownerActorId,
        orchestratorActorId: input.actorRef,
        assignedActorIds: [],
        summary: `Authorize ${input.proposal.deliveryMode} publication for `
          + `"${input.proposal.goal}".`,
        metadata: {
          [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: {
            schemaVersion: 1,
            publishKey,
            bindingId: input.bindingId,
            workItemId: input.workItemId,
            runId: input.runId,
            executionTaskId: input.taskId,
            proposalRevision: input.proposal.revision,
            proposalDigest: input.proposal.digest,
            deliveryMode: input.proposal.deliveryMode,
            effectiveGates: [...input.outstandingGates],
            requestedActions: PUBLISH_ACTIONS[input.proposal.deliveryMode] ?? null,
            workspacePath: input.deliveryWorkspacePath,
            sessionId: input.deliverySessionId,
          },
        },
      },
      now(),
    );
    const approvalWrite = writeApprovalDecision(
      taskWrite.core,
      {
        taskId: approvalTaskId,
        status: 'pending',
        requestedByActorId: input.actorRef,
        notes: `Publication requires an owner decision: `
          + `${input.outstandingGates.join(', ')}.`,
      },
      now(),
    );
    const bindingWrite = upsertCoreApprovalBinding(
      approvalWrite.core,
      {
        id: `approval-binding-${approvalTaskId}`,
        // The gate is about releasing a result, not about starting work.
        kind: 'release_gate',
        approvalTaskId,
        subjectKind: 'run',
        subjectId: input.runId,
        projectId: input.proposal.projectId,
        workItemId: input.workItemId,
        conversationId: null,
        requestedByActorId: input.actorRef,
        requestedForActorId: input.ownerActorId,
        metadata: {
          [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: { schemaVersion: 1, publishKey },
        },
      },
      now(),
    );
    created = true;
    return appendCoreActivity(
      bindingWrite.core,
      {
        id: `activity-wgp-publish-requested-${approvalTaskId}`,
        kind: 'approval_requested',
        actorId: input.actorRef,
        projectId: input.proposal.projectId,
        workItemId: input.workItemId,
        conversationId: null,
        taskId: approvalTaskId,
        runId: input.runId,
        message: `Publication approval requested for "${input.proposal.goal}".`,
        metadata: {
          [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: {
            schemaVersion: 1,
            publishKey,
            gates: [...input.outstandingGates],
          },
        },
      },
      now(),
    ).core;
  });

  return { approvalTaskId, publishKey, created };
}

export interface ApplyWorkGoldenPathPublishInput {
  workItemId: string;
  decision: 'approve' | 'deny';
  ownerActorId: string;
  actorRef: string;
  /** Absent means no external action can be performed. */
  deliveryClient?: RuntimeDeliveryClient;
}

function findPendingPublishTask(core: CatsCoreState, workItemId: string) {
  return core.tasks.find((task) => {
    const envelope = readPublishEnvelope(task.metadata);
    if (envelope === null) {
      return false;
    }
    const raw = task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY];
    return isRecord(raw) && raw.workItemId === workItemId;
  }) ?? null;
}

/**
 * Performs the mode's external actions.
 *
 * Any blocked action stops the sequence: a half-published result (pushed but no
 * pull request) is worse than one the owner can retry deliberately.
 */
async function performPublishActions(input: {
  actions: readonly CoreRuntimeDeliveryAction[];
  /** Actions a previous attempt already landed; never repeated. */
  alreadyPerformed: readonly CoreRuntimeDeliveryAction[];
  deliveryClient: RuntimeDeliveryClient;
  workspacePath: string | null;
  sessionId: string | null;
  approvalRef: string;
  goal: string;
  resumeOperationId: string | null;
}): Promise<{
  performed: CoreRuntimeDeliveryAction[];
  reference: string | null;
  pendingOperationId: string | null;
  blockedReasons: string[];
}> {
  const performed: CoreRuntimeDeliveryAction[] = [...input.alreadyPerformed];
  let reference: string | null = null;

  for (const action of input.actions) {
    // Per-action idempotency. A wait that timed out must not re-push and
    // re-open the pull request when the owner comes back to it.
    if (performed.includes(action)) {
      continue;
    }

    let outcome: RuntimePublishOutcome;
    if (action === 'push_branch') {
      outcome = await input.deliveryClient.pushBranch({
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
        approvalRef: input.approvalRef,
      });
    } else if (action === 'open_pull_request') {
      outcome = await input.deliveryClient.openPullRequest({
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
        approvalRef: input.approvalRef,
        title: input.goal,
        body: `Opened by Cats for "${input.goal}".`,
      });
    } else if (action === 'wait_for_checks') {
      outcome = await input.deliveryClient.waitForChecks({
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
        approvalRef: input.approvalRef,
        resumeOperationId: input.resumeOperationId,
      });
    } else if (action === 'publish_preview') {
      outcome = await input.deliveryClient.publishPreview({
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
        approvalRef: input.approvalRef,
      });
    } else {
      return {
        performed,
        reference,
        pendingOperationId: null,
        blockedReasons: [`unsupported_publish_action:${action}`],
      };
    }

    if (outcome.state === 'pending') {
      // Nothing was refused and nothing more can be done yet. The actions that
      // already landed stay landed.
      return {
        performed,
        reference,
        pendingOperationId: outcome.pendingOperationId,
        blockedReasons: [],
      };
    }
    if (outcome.state !== 'completed') {
      return {
        performed,
        reference,
        pendingOperationId: null,
        blockedReasons: outcome.blockedReasons.length > 0
          ? outcome.blockedReasons
          : [`${action}_not_completed`],
      };
    }
    performed.push(action);
    reference = outcome.reference ?? reference;
  }

  return { performed, reference, pendingOperationId: null, blockedReasons: [] };
}

/**
 * Applies the owner's publish decision.
 *
 * Approving twice returns the recorded result instead of pushing again: the
 * approval Task's metadata is the idempotency record (FR-42).
 */
export async function applyWorkGoldenPathPublishDecision(
  coreStore: CoreStore,
  input: ApplyWorkGoldenPathPublishInput,
  now: () => Date = () => new Date(),
): Promise<WorkGoldenPathPublishResult> {
  const core = await coreStore.readCore();
  const approvalTask = findPendingPublishTask(core, input.workItemId);
  if (approvalTask === null) {
    return {
      status: 'not_pending',
      publishKey: '',
      approvalTaskId: '',
      performedActions: [],
      reference: null,
      pendingOperationId: null,
      blockedReasons: ['no_publish_approval_pending'],
    };
  }

  const raw = approvalTask.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY];
  const envelope = isRecord(raw) ? raw : {};
  const publishKey = typeof envelope.publishKey === 'string' ? envelope.publishKey : '';
  const recorded = readPublishEnvelope(approvalTask.metadata);

  if (recorded?.completedAt) {
    return {
      status: 'already_published',
      publishKey,
      approvalTaskId: approvalTask.id,
      performedActions: recorded.performedActions,
      reference: recorded.reference,
      pendingOperationId: null,
      blockedReasons: [],
    };
  }

  if (input.decision === 'deny') {
    await coreStore.updateCore((state) => {
      const denied = writeApprovalDecision(
        state,
        {
          taskId: approvalTask.id,
          status: 'rejected',
          action: 'reject',
          decidedByActorId: input.ownerActorId,
          notes: 'Owner declined publication.',
          taskStatus: 'cancelled',
        },
        now(),
      );
      return appendCoreActivity(
        denied.core,
        {
          id: `activity-wgp-publish-denied-${approvalTask.id}`,
          kind: 'approval_decided',
          actorId: input.ownerActorId,
          workItemId: input.workItemId,
          taskId: approvalTask.id,
          runId: typeof envelope.runId === 'string' ? envelope.runId : null,
          message: 'Owner declined publication; the result stays unpublished.',
          metadata: {
            [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: { schemaVersion: 1, publishKey },
          },
        },
        now(),
      ).core;
    });
    return {
      status: 'denied',
      publishKey,
      approvalTaskId: approvalTask.id,
      performedActions: [],
      reference: null,
      pendingOperationId: null,
      blockedReasons: [],
    };
  }

  const deliveryMode = envelope.deliveryMode as CoreDeliveryMode | undefined;
  const actions = deliveryMode ? PUBLISH_ACTIONS[deliveryMode] : undefined;
  const workspacePath = typeof envelope.workspacePath === 'string'
    ? envelope.workspacePath
    : null;
  const sessionId = typeof envelope.sessionId === 'string' ? envelope.sessionId : null;

  if (actions === undefined) {
    return {
      status: 'blocked',
      publishKey,
      approvalTaskId: approvalTask.id,
      performedActions: [],
      reference: null,
      pendingOperationId: null,
      blockedReasons: [`unsupported_delivery_mode:${deliveryMode ?? 'unknown'}`],
    };
  }

  // Actions a previous attempt already landed. A wait that timed out leaves the
  // push and the pull request behind, and neither may happen twice.
  let performed: CoreRuntimeDeliveryAction[] = recorded?.performedActions ?? [];
  let reference: string | null = recorded?.reference ?? null;
  let pendingOperationId: string | null = null;
  let blockedReasons: string[] = [];

  if (actions.length > 0) {
    if (input.deliveryClient === undefined || (workspacePath === null && sessionId === null)) {
      blockedReasons = ['publish_transport_unavailable'];
    } else {
      try {
        const outcome = await performPublishActions({
          actions,
          alreadyPerformed: performed,
          deliveryClient: input.deliveryClient,
          workspacePath,
          sessionId,
          // The Core approval id is the authorization the runtime records.
          approvalRef: approvalTask.id,
          goal: approvalTask.title.replace(/^Publish:\s*/u, ''),
          resumeOperationId: recorded?.pendingOperationId ?? null,
        });
        performed = outcome.performed;
        reference = outcome.reference ?? reference;
        pendingOperationId = outcome.pendingOperationId;
        blockedReasons = outcome.blockedReasons;
      } catch (error) {
        blockedReasons = [error instanceof Error ? error.message : 'publish_failed'];
      }
    }
  }

  // Whatever landed is persisted before returning, blocked or not, so a later
  // attempt resumes rather than restarts.
  if (blockedReasons.length > 0 || pendingOperationId !== null) {
    await stampPublishProgress(coreStore, {
      approvalTask,
      envelope,
      performed,
      reference,
      pendingOperationId,
    }, now);
  }

  if (pendingOperationId !== null) {
    // The external work is under way and nothing was refused. The approval stays
    // pending so the owner can come back to it, and nothing is delivered yet.
    return {
      status: 'pending_checks',
      publishKey,
      approvalTaskId: approvalTask.id,
      performedActions: performed,
      reference,
      pendingOperationId,
      blockedReasons: [],
    };
  }

  if (blockedReasons.length > 0) {
    // The approval stays pending so the owner can retry deliberately rather
    // than having their decision consumed by a transport failure.
    return {
      status: 'blocked',
      publishKey,
      approvalTaskId: approvalTask.id,
      performedActions: performed,
      reference,
      pendingOperationId: null,
      blockedReasons,
    };
  }

  const completedAt = now().toISOString();
  await coreStore.updateCore((state) => {
    const approved = writeApprovalDecision(
      state,
      {
        taskId: approvalTask.id,
        status: 'approved',
        action: 'approve',
        decidedByActorId: input.ownerActorId,
        notes: 'Owner authorized publication.',
        taskStatus: 'completed',
      },
      now(),
    );
    const stamped = upsertCoreTask(
      approved.core,
      {
        id: approvalTask.id,
        title: approvalTask.title,
        status: 'completed',
        ownerActorId: approvalTask.ownerActorId,
        metadata: {
          ...approvalTask.metadata,
          [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: {
            ...envelope,
            performedActions: performed,
            reference,
            completedAt,
            decidedByActorId: input.ownerActorId,
          },
        },
      },
      now(),
    );
    return appendCoreActivity(
      stamped.core,
      {
        id: `activity-wgp-publish-approved-${approvalTask.id}`,
        kind: 'approval_decided',
        actorId: input.ownerActorId,
        workItemId: input.workItemId,
        taskId: approvalTask.id,
        runId: typeof envelope.runId === 'string' ? envelope.runId : null,
        message: performed.length > 0
          ? `Owner authorized publication; performed ${performed.join(', ')}.`
          : 'Owner authorized publication; no external action was required.',
        metadata: {
          [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: {
            schemaVersion: 1,
            publishKey,
            performedActions: performed,
            reference,
          },
        },
      },
      now(),
    ).core;
  });

  return {
    status: 'published',
    publishKey,
    approvalTaskId: approvalTask.id,
    performedActions: performed,
    reference,
    pendingOperationId: null,
    blockedReasons: [],
  };
}

/**
 * Persists partial publish progress without deciding the approval.
 *
 * The approval stays `pending`: the owner has not been answered yet, and their
 * decision must not be consumed by an unfinished wait.
 */
async function stampPublishProgress(
  coreStore: CoreStore,
  input: {
    approvalTask: { id: string; title: string; ownerActorId: string; metadata: CoreRecordMetadata };
    envelope: Record<string, unknown>;
    performed: CoreRuntimeDeliveryAction[];
    reference: string | null;
    pendingOperationId: string | null;
  },
  now: () => Date,
): Promise<void> {
  await coreStore.updateCore((state) => upsertCoreTask(
    state,
    {
      id: input.approvalTask.id,
      title: input.approvalTask.title,
      ownerActorId: input.approvalTask.ownerActorId,
      metadata: {
        ...input.approvalTask.metadata,
        [WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY]: {
          ...input.envelope,
          performedActions: input.performed,
          reference: input.reference,
          pendingOperationId: input.pendingOperationId,
        },
      },
    },
    now(),
  ).core);
}
