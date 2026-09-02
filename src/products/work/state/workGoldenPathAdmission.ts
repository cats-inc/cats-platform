/**
 * Transport golden-path authorization/admission (SPEC-114 FR-20..FR-27).
 *
 * One product-owned command turns a *later* explicit owner event over an
 * already-visible scope revision into exactly one approved Task and one queued
 * supervised Run. ADR-112 section 4 forbids the transport from editing Core
 * records itself, so Telegram calls this and nothing else.
 *
 * Atomicity is the reason this is a single `updateCore` mutator rather than a
 * sequence of delegate calls: a crash between "Task approved" and "Run queued"
 * would otherwise leave a half-admitted scope that a retry turns into a second
 * Run.
 */

import { createHash } from 'node:crypto';

import {
  appendCoreActivity,
  upsertCoreRun,
  writeApprovalDecision,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type {
  CatsCoreState,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
  ExecutionTargetSummary,
} from '../../../core/types.js';
import type { SupervisionToolScope } from '../../../platform/supervision/contracts.js';
import type {
  TransportWorkOriginV1,
  TransportWorkProposalV1,
  TransportWorkReadiness,
} from '../../../platform/transports/work-delivery/contracts.js';
import { applyWorkExecutionTaskCreation } from './workExecutionTaskDelegate.js';
import {
  readWorkGoldenPathMetadata,
  WORK_GOLDEN_PATH_METADATA_KEY,
} from '../shared/workGoldenPathMetadata.js';

export type WorkGoldenPathAdmissionStatus =
  | 'admitted'
  | 'already_admitted'
  | 'blocked';

export type WorkGoldenPathAdmissionBlockReason =
  | 'work_item_not_found'
  | 'proposal_missing'
  | 'stale_revision'
  | 'digest_mismatch'
  | 'origin_mismatch'
  | 'not_ready'
  | 'intake_boundary'
  | 'task_precheck_failed';

export interface WorkGoldenPathAdmissionInput {
  workItemId: string;
  /** The binding the owner authorized from; must match recorded provenance. */
  bindingId: string;
  ownerActorId: string;
  /** Revision the owner actually saw and confirmed. */
  proposalRevision: number;
  /** Digest of that exact revision. */
  proposalDigest: string;
  readiness: TransportWorkReadiness;
  /**
   * Correlates the owner event. Two taps of the same button share this, which
   * is what makes the admission key stable across duplicates (FR-26).
   */
  ownerEventRef: string;
  actorRef: string;
  /** Execution facts captured atomically with the Run, never process globals. */
  executionTarget?: ExecutionTargetSummary | null;
  toolScope?: SupervisionToolScope;
  workspaceHeadOid?: string | null;
}

export interface WorkGoldenPathExecutionSnapshot {
  executionTarget: ExecutionTargetSummary | null;
  toolScope: SupervisionToolScope;
  workspaceHeadOid: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the run-scoped execution envelope defensively during restart recovery. */
export function readWorkGoldenPathExecutionSnapshot(
  metadata: unknown,
): WorkGoldenPathExecutionSnapshot {
  if (!isRecord(metadata)) {
    return { executionTarget: null, toolScope: 'none', workspaceHeadOid: null };
  }
  const goldenPath = metadata[WORK_GOLDEN_PATH_METADATA_KEY];
  if (!isRecord(goldenPath) || !isRecord(goldenPath.execution)) {
    return { executionTarget: null, toolScope: 'none', workspaceHeadOid: null };
  }
  const execution = goldenPath.execution;
  const rawTarget = isRecord(execution.target) ? execution.target : null;
  const provider = rawTarget && typeof rawTarget.provider === 'string'
    ? rawTarget.provider.trim()
    : '';
  const rawScope = execution.toolScope;
  const toolScope: SupervisionToolScope = rawScope === 'read_only'
    || rawScope === 'narrow_write'
    || rawScope === 'broad_write'
    ? rawScope
    : 'none';
  return {
    executionTarget: provider === '' ? null : {
      provider,
      instance: rawTarget && typeof rawTarget.instance === 'string'
        ? rawTarget.instance
        : null,
      model: rawTarget && typeof rawTarget.model === 'string' ? rawTarget.model : null,
    },
    toolScope,
    workspaceHeadOid: typeof execution.workspaceHeadOid === 'string'
      ? execution.workspaceHeadOid
      : null,
  };
}

export interface WorkGoldenPathAdmissionResult {
  status: WorkGoldenPathAdmissionStatus;
  reason?: WorkGoldenPathAdmissionBlockReason;
  message?: string;
  admissionKey: string;
  workItemId: string;
  taskId: string | null;
  runId: string | null;
}

/**
 * Stable admission key over binding, work item, revision, and action.
 *
 * Deliberately excludes `ownerEventRef`: a replayed callback carries a *new*
 * Telegram callback id but authorizes the same scope, and must land on the same
 * Task and Run.
 */
export function buildWorkGoldenPathAdmissionKey(input: {
  bindingId: string;
  workItemId: string;
  proposalRevision: number;
  proposalDigest: string;
}): string {
  return [
    'wgp-admit',
    input.bindingId,
    input.workItemId,
    String(input.proposalRevision),
    input.proposalDigest,
  ].join(':');
}

/**
 * Deterministic Run id for an admission key.
 *
 * Exported so a caller can tell "this scope is already admitted" apart from
 * "this action is not allowed here" before it rejects a replayed button.
 */
export function resolveWorkGoldenPathRunId(admissionKey: string): string {
  return `run-wgp-${createHash('sha256').update(admissionKey).digest('hex').slice(0, 20)}`;
}

function admissionActivityId(admissionKey: string): string {
  return `activity-wgp-${createHash('sha256').update(admissionKey).digest('hex').slice(0, 20)}`;
}

function blocked(
  admissionKey: string,
  workItemId: string,
  reason: WorkGoldenPathAdmissionBlockReason,
  message: string,
): WorkGoldenPathAdmissionResult {
  return {
    status: 'blocked',
    reason,
    message,
    admissionKey,
    workItemId,
    taskId: null,
    runId: null,
  };
}

class AdmissionBlockedError extends Error {
  constructor(
    readonly reason: WorkGoldenPathAdmissionBlockReason,
    message: string,
  ) {
    super(message);
    this.name = 'AdmissionBlockedError';
  }
}

function verifyScope(
  workItem: CoreWorkItemRecord,
  input: WorkGoldenPathAdmissionInput,
): { proposal: TransportWorkProposalV1; origin: TransportWorkOriginV1 } {
  const metadata = readWorkGoldenPathMetadata(workItem.metadata);
  if (metadata === null || metadata.proposal === null || metadata.origin === null) {
    throw new AdmissionBlockedError(
      'proposal_missing',
      `Work Item ${workItem.id} has no versioned golden-path proposal to authorize.`,
    );
  }
  if (metadata.origin.bindingId !== input.bindingId) {
    throw new AdmissionBlockedError(
      'origin_mismatch',
      'Authorization arrived on a different binding than the one that captured this work.',
    );
  }
  if (metadata.proposal.revision !== input.proposalRevision) {
    throw new AdmissionBlockedError(
      'stale_revision',
      `Proposal revision ${input.proposalRevision} is stale; current revision is `
      + `${metadata.proposal.revision}.`,
    );
  }
  if (metadata.proposal.digest !== input.proposalDigest) {
    throw new AdmissionBlockedError(
      'digest_mismatch',
      'The proposal changed after this action was offered; confirm the refreshed scope.',
    );
  }
  return { proposal: metadata.proposal, origin: metadata.origin };
}

/**
 * Finds an already-queued Run for this admission key.
 *
 * Both the deterministic id and the metadata key are checked so recovery works
 * whether the previous attempt got as far as writing the Run or not.
 */
function findAdmittedRun(core: CatsCoreState, admissionKey: string): CoreRunRecord | null {
  const runId = resolveWorkGoldenPathRunId(admissionKey);
  return core.runs.find((run) => run.id === runId) ?? null;
}

export async function admitTransportWorkExecution(
  coreStore: CoreStore,
  input: WorkGoldenPathAdmissionInput,
  now: () => Date = () => new Date(),
): Promise<WorkGoldenPathAdmissionResult> {
  const admissionKey = buildWorkGoldenPathAdmissionKey(input);

  if (!input.readiness.ready) {
    return blocked(
      admissionKey,
      input.workItemId,
      'not_ready',
      `Delegation readiness is incomplete: ${input.readiness.blockers
        .map((entry) => entry.reason)
        .join(', ')}.`,
    );
  }

  const createdAt = now();
  let resolvedTask: CoreTaskRecord | null = null;
  let resolvedRun: CoreRunRecord | null = null;
  let alreadyAdmitted = false;

  try {
    await coreStore.updateCore((core) => {
      const workItem = core.workItems.find((candidate) => candidate.id === input.workItemId)
        ?? null;
      if (workItem === null) {
        throw new AdmissionBlockedError(
          'work_item_not_found',
          `No Work Item found for id ${input.workItemId}.`,
        );
      }

      const { proposal } = verifyScope(workItem, input);

      const existingRun = findAdmittedRun(core, admissionKey);
      if (existingRun !== null) {
        // Replay: the same owner event already produced this Run.
        alreadyAdmitted = true;
        resolvedRun = existingRun;
        resolvedTask = core.tasks.find((task) => task.id === existingRun.taskId) ?? null;
        return core;
      }

      // 1. Task. Reuses the phase-scoped Work tool mutation so the intake
      //    boundary invariant (FR-25) is enforced by the same code path that
      //    enforces it for the agent-facing tool.
      const taskWrite = applyWorkExecutionTaskCreation(
        core,
        {
          workItemId: workItem.id,
          title: proposal.goal,
          summary: workItem.summary ?? undefined,
          approvalNote: `Telegram owner authorization for revision ${proposal.revision}.`,
        },
        { actorRef: input.actorRef, actionId: input.ownerEventRef },
        createdAt,
      );

      // 2. Owner approval. This is the later explicit owner event, recorded
      //    with its transport provenance so Desktop can show FR-24 evidence.
      const approvalWrite = writeApprovalDecision(
        taskWrite.core,
        {
          taskId: taskWrite.task.id,
          status: 'approved',
          action: 'approve',
          decidedByActorId: input.ownerActorId,
          notes: `Authorized from Telegram binding ${input.bindingId}, revision `
            + `${proposal.revision}.`,
          taskStatus: 'approved',
        },
        createdAt,
      );

      // 3. Supervised Run, queued. Deterministic id keyed by the admission key
      //    is what makes a concurrent double-tap converge instead of forking.
      const runWrite = upsertCoreRun(
        approvalWrite.core,
        {
          id: resolveWorkGoldenPathRunId(admissionKey),
          title: proposal.goal,
          status: 'queued',
          conversationId: workItem.conversationId,
          taskId: approvalWrite.task.id,
          orchestratorActorId: input.actorRef,
          summary: workItem.summary,
          metadata: {
            [WORK_GOLDEN_PATH_METADATA_KEY]: {
              schemaVersion: 1,
              admissionKey,
              bindingId: input.bindingId,
              workItemId: workItem.id,
              proposalRevision: proposal.revision,
              proposalDigest: proposal.digest,
              deliveryMode: proposal.deliveryMode,
              acceptanceCriteria: proposal.acceptanceCriteria,
              ownerEventRef: input.ownerEventRef,
              authorizedByActorId: input.ownerActorId,
              authorizedAt: createdAt.toISOString(),
              execution: {
                target: input.executionTarget ?? null,
                toolScope: input.toolScope ?? 'none',
                workspaceHeadOid: input.workspaceHeadOid ?? null,
              },
            },
          },
        },
        createdAt,
      );

      const activityWrite = appendCoreActivity(
        runWrite.core,
        {
          id: admissionActivityId(admissionKey),
          kind: 'approval_decided',
          actorId: input.ownerActorId,
          projectId: workItem.projectId,
          workItemId: workItem.id,
          conversationId: workItem.conversationId,
          taskId: approvalWrite.task.id,
          runId: runWrite.run.id,
          message: `Owner authorized execution from Telegram for "${proposal.goal}".`,
          metadata: {
            [WORK_GOLDEN_PATH_METADATA_KEY]: {
              schemaVersion: 1,
              phase: 'execution_authorization',
              admissionKey,
              bindingId: input.bindingId,
              proposalRevision: proposal.revision,
              proposalDigest: proposal.digest,
            },
          },
        },
        createdAt,
      );

      resolvedTask = approvalWrite.task;
      resolvedRun = runWrite.run;
      return activityWrite.core;
    });
  } catch (error) {
    if (error instanceof AdmissionBlockedError) {
      return blocked(admissionKey, input.workItemId, error.reason, error.message);
    }
    return blocked(
      admissionKey,
      input.workItemId,
      'task_precheck_failed',
      error instanceof Error ? error.message : 'Golden-path admission failed.',
    );
  }

  const task = resolvedTask as CoreTaskRecord | null;
  const run = resolvedRun as CoreRunRecord | null;

  return {
    status: alreadyAdmitted ? 'already_admitted' : 'admitted',
    admissionKey,
    workItemId: input.workItemId,
    taskId: task?.id ?? null,
    runId: run?.id ?? null,
  };
}
