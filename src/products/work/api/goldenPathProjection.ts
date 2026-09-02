/**
 * Desktop projection for the transport work-delivery golden path
 * (SPEC-114 FR-49, FR-50).
 *
 * Desktop must be able to explain every Telegram message from durable records:
 * where the request came in, exactly which scope revision the owner authorized,
 * what executed, what evidence was accepted, and whether the result actually
 * reached the owner.
 *
 * Like the transport stage, this is a derivation — it holds no state and adds
 * no authority. Unlike the transport payloads, it may show local paths: Desktop
 * runs on the owner's own machine, so the FR-44 restriction that applies to a
 * chat message does not apply here. Secrets are still never included, because
 * they are never in these records to begin with.
 */

import type {
  CatsCoreState,
  CoreArtifactRecord,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
} from '../../../core/types.js';
import type {
  TransportWorkDeliveryV1,
  TransportWorkStage,
} from '../../../platform/transports/work-delivery/contracts.js';
import { resolveOutstandingDeliveryGates } from '../../../platform/transports/work-delivery/deliveryGates.js';
import { projectTransportWorkStage } from '../../../platform/transports/work-delivery/stageProjection.js';
import { readWorkGoldenPathMetadata } from '../shared/workGoldenPathMetadata.js';

/** Read-only view of the transport outbox, for the Desktop read model. */
export interface TransportWorkDeliveryReader {
  list(workItemId: string): TransportWorkDeliveryV1[];
}

/**
 * The one write Desktop may perform on the outbox: re-driving a delivery the
 * transport failed to complete (FR-46).
 *
 * It re-sends nothing that already reached `sent`, because the outbox row is
 * still the idempotency record.
 */
export interface TransportWorkDeliveryRecovery extends TransportWorkDeliveryReader {
  retry(idempotencyKey: string): Promise<{ row: TransportWorkDeliveryV1 }>;
}

export interface WorkGoldenPathSourceView {
  transport: 'telegram';
  bindingId: string;
  /**
   * Whether the binding that originated this work still exists.
   *
   * False after the operator removed or replaced it. Delivery deliberately does
   * not fall back to another binding (FR-43), so without this the owner would
   * see repeated delivery failures with no explanation.
   */
  present: boolean;
  /** Opaque transport-store references; never a raw credential. */
  externalConversationRef: string;
  externalUpdateRef: string;
  externalMessageRef: string | null;
  conversationId: string;
  locale: string | null;
}

export interface WorkGoldenPathScopeView {
  revision: number;
  digest: string;
  goal: string;
  targetLabel: string;
  workspacePath: string | null;
  acceptanceCriteria: string[];
  deliveryMode: CoreDeliveryMode;
  deliveryGates: CoreDeliveryGate[];
  sideEffects: string[];
  openQuestion: string | null;
  proposedAt: string;
}

/**
 * Evidence that the owner authorized *this* revision from *that* binding.
 *
 * FR-24: Desktop shows this instead of asking for a second Start Run click.
 */
export interface WorkGoldenPathAuthorizationView {
  authorizedByActorId: string | null;
  authorizedAt: string | null;
  bindingId: string | null;
  proposalRevision: number | null;
  proposalDigest: string | null;
  admissionKey: string | null;
}

export interface WorkGoldenPathDeliveryAttemptView {
  idempotencyKey: string;
  purpose: TransportWorkDeliveryV1['purpose'];
  state: TransportWorkDeliveryV1['state'];
  attemptCount: number;
  externalMessageRef: string | null;
  lastErrorCode: string | null;
  sentAt: string | null;
}

export interface WorkGoldenPathEvidenceView {
  outcomeStatus: string | null;
  commitId: string | null;
  changeSummary: string | null;
  validation: { command: string; passed: boolean } | null;
  artifacts: Array<{ id: string; title: string; status: string; path: string | null }>;
  satisfiedCriteria: string[];
  unmetCriteria: string[];
}

/**
 * A supervision refusal, surfaced so Desktop can name what to grant.
 *
 * Null for every run that was not refused, which is almost all of them.
 */
export interface WorkGoldenPathPermissionDenialView {
  toolName: string;
  code: string;
  deniedAt: string | null;
}

/** Recovery the owner can perform from Desktop for the current stage (FR-46). */
export type WorkGoldenPathRecoveryAction =
  | 'retry_delivery'
  | 'retry_run'
  | 'resume_run'
  | 'cancel'
  | 'none';

export interface WorkGoldenPathDetailProjection {
  workItemId: string;
  source: WorkGoldenPathSourceView;
  scope: WorkGoldenPathScopeView;
  authorization: WorkGoldenPathAuthorizationView;
  taskId: string | null;
  taskStatus: CoreTaskRecord['status'] | null;
  runId: string | null;
  runStatus: CoreRunRecord['status'] | null;
  stage: TransportWorkStage;
  stageRationale: string;
  blockers: string[];
  permissionDenial: WorkGoldenPathPermissionDenialView | null;
  evidence: WorkGoldenPathEvidenceView;
  outstandingGates: CoreDeliveryGate[];
  delivery: {
    attempts: WorkGoldenPathDeliveryAttemptView[];
    /** The receipt that made the work `delivered`, when one exists. */
    receipt: WorkGoldenPathDeliveryAttemptView | null;
  };
  recoveryActions: WorkGoldenPathRecoveryAction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function toAttemptView(row: TransportWorkDeliveryV1): WorkGoldenPathDeliveryAttemptView {
  return {
    idempotencyKey: row.idempotencyKey,
    purpose: row.purpose,
    state: row.state,
    attemptCount: row.attemptCount,
    externalMessageRef: row.externalMessageRef,
    lastErrorCode: row.lastErrorCode,
    sentAt: row.sentAt,
  };
}

/**
 * Reads the authorization stamp the admission command wrote onto the Run.
 *
 * Absent means the scope was never authorized, which Desktop shows as an empty
 * authorization block rather than inventing an actor.
 */
function readAuthorization(run: CoreRunRecord | null): WorkGoldenPathAuthorizationView {
  const envelope = run && isRecord(run.metadata.workGoldenPath)
    ? run.metadata.workGoldenPath
    : null;
  return {
    authorizedByActorId: readString(envelope?.authorizedByActorId),
    authorizedAt: readString(envelope?.authorizedAt),
    bindingId: readString(envelope?.bindingId),
    proposalRevision: typeof envelope?.proposalRevision === 'number'
      ? envelope.proposalRevision
      : null,
    proposalDigest: readString(envelope?.proposalDigest),
    admissionKey: readString(envelope?.admissionKey),
  };
}

function readEvidence(input: {
  core: CatsCoreState;
  workItem: CoreWorkItemRecord;
  run: CoreRunRecord | null;
  acceptanceCriteria: readonly string[];
}): WorkGoldenPathEvidenceView {
  const outcome = input.run
    ? input.core.outcomes.find((candidate) => candidate.runId === input.run!.id) ?? null
    : null;
  const metadata = outcome?.metadata ?? {};
  const validation = isRecord(metadata.validation)
    && typeof metadata.validation.command === 'string'
    && typeof metadata.validation.passed === 'boolean'
    ? { command: metadata.validation.command, passed: metadata.validation.passed }
    : null;
  const satisfiedCriteria = readStringArray(metadata.satisfiedCriteria);
  const normalized = new Set(satisfiedCriteria.map((entry) => entry.trim().toLowerCase()));
  const artifacts: CoreArtifactRecord[] = input.core.artifacts.filter(
    (artifact) => artifact.workItemId === input.workItem.id,
  );

  return {
    outcomeStatus: outcome?.status ?? null,
    commitId: readString(metadata.commitId),
    changeSummary: readString(metadata.changeSummary),
    validation,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      status: artifact.status,
      path: artifact.path,
    })),
    satisfiedCriteria,
    unmetCriteria: input.acceptanceCriteria.filter(
      (criterion) => !normalized.has(criterion.trim().toLowerCase()),
    ),
  };
}

function readPermissionDenial(
  run: CoreRunRecord | null,
): WorkGoldenPathPermissionDenialView | null {
  const envelope = run && isRecord(run.metadata.workGoldenPathDenial)
    ? run.metadata.workGoldenPathDenial
    : null;
  const toolName = readString(envelope?.toolName);
  const code = readString(envelope?.code);
  if (toolName === null || code === null) {
    return null;
  }
  return { toolName, code, deniedAt: readString(envelope?.deniedAt) };
}

function readBlockers(input: {
  run: CoreRunRecord | null;
  stage: TransportWorkStage;
  bindingPresent: boolean;
  bindingId: string;
}): string[] {
  const blockers: string[] = [];
  if (!input.bindingPresent) {
    blockers.push(
      `The originating Telegram binding ${input.bindingId} no longer exists, so results `
      + 'cannot be delivered to it.',
    );
  }
  if (
    input.run !== null
    && (input.stage === 'decision_needed' || input.stage === 'failed')
  ) {
    blockers.push(input.run.summary ?? `Run is ${input.run.status}.`);
  }
  return blockers;
}

function resolveRecoveryActions(input: {
  stage: TransportWorkStage;
  attempts: WorkGoldenPathDeliveryAttemptView[];
}): WorkGoldenPathRecoveryAction[] {
  const failedResult = input.attempts.some(
    (attempt) =>
      (attempt.purpose === 'result' || attempt.purpose === 'publish_result')
      && attempt.state !== 'sent',
  );
  // A failed final send is the one case where Desktop can finish the job the
  // transport could not (FR-46).
  if (failedResult && (input.stage === 'result_ready' || input.stage === 'publish_authorized')) {
    return ['retry_delivery', 'cancel'];
  }
  if (input.stage === 'delivered' || input.stage === 'cancelled') {
    return ['none'];
  }
  // A stuck run is the case Desktop most needs to unstick.
  if (input.stage === 'failed' || input.stage === 'decision_needed') {
    return ['retry_run', 'cancel'];
  }
  // A `running` Run may have lost its driver to a host restart.
  if (input.stage === 'running') {
    return ['resume_run', 'cancel'];
  }
  return ['cancel'];
}

/**
 * Builds the golden-path view for one Work Item, or `null` when the item did not
 * come in through a transport.
 */
export function buildWorkGoldenPathDetailProjection(input: {
  core: CatsCoreState;
  workItemId: string;
  deliveryReader?: TransportWorkDeliveryReader;
}): WorkGoldenPathDetailProjection | null {
  const workItem = input.core.workItems.find((candidate) => candidate.id === input.workItemId)
    ?? null;
  if (workItem === null) {
    return null;
  }
  const metadata = readWorkGoldenPathMetadata(workItem.metadata);
  const origin = metadata?.origin ?? null;
  const proposal = metadata?.proposal ?? null;
  if (origin === null || proposal === null) {
    return null;
  }

  const task = workItem.taskId
    ? input.core.tasks.find((candidate) => candidate.id === workItem.taskId) ?? null
    : null;
  const run = task
    ? input.core.runs.find((candidate) => candidate.taskId === task.id) ?? null
    : null;
  const outcome = run
    ? input.core.outcomes.find((candidate) => candidate.runId === run.id) ?? null
    : null;
  const artifacts = input.core.artifacts.filter(
    (artifact) => artifact.workItemId === workItem.id,
  );
  const deliveryRows = input.deliveryReader?.list(workItem.id) ?? [];
  const bindingPresent = input.core.botBindings.some(
    (binding) => binding.id === origin.bindingId && binding.status === 'active',
  );
  const evidence = readEvidence({
    core: input.core,
    workItem,
    run,
    acceptanceCriteria: proposal.acceptanceCriteria,
  });
  const outstandingGates = resolveOutstandingDeliveryGates({
    deliveryMode: proposal.deliveryMode,
    effectiveGates: proposal.deliveryGates,
    satisfiedGates: [],
    publishesPublicArtifact: false,
  });
  const stageProjection = projectTransportWorkStage({
    workItem,
    proposal,
    task,
    run,
    outcome,
    artifacts,
    commitId: evidence.commitId,
    outstandingGates,
    deliveryRows,
    awaitingOwnerDecision: task?.approval.status === 'pending' && run !== null,
  });
  const attempts = deliveryRows.map(toAttemptView);

  return {
    workItemId: workItem.id,
    source: {
      transport: origin.transport,
      bindingId: origin.bindingId,
      present: bindingPresent,
      externalConversationRef: origin.externalConversationRef,
      externalUpdateRef: origin.externalUpdateRef,
      externalMessageRef: origin.externalMessageRef,
      conversationId: origin.conversationId,
      locale: metadata?.locale ?? null,
    },
    scope: {
      revision: proposal.revision,
      digest: proposal.digest,
      goal: proposal.goal,
      targetLabel: proposal.targetLabel,
      workspacePath: proposal.workspacePath,
      acceptanceCriteria: [...proposal.acceptanceCriteria],
      deliveryMode: proposal.deliveryMode,
      deliveryGates: [...proposal.deliveryGates],
      sideEffects: [...proposal.sideEffects],
      openQuestion: proposal.openQuestion,
      proposedAt: proposal.createdAt,
    },
    authorization: readAuthorization(run),
    taskId: task?.id ?? null,
    taskStatus: task?.status ?? null,
    runId: run?.id ?? null,
    runStatus: run?.status ?? null,
    stage: stageProjection.stage,
    stageRationale: stageProjection.rationale,
    blockers: readBlockers({
      run,
      stage: stageProjection.stage,
      bindingPresent,
      bindingId: origin.bindingId,
    }),
    permissionDenial: readPermissionDenial(run),
    evidence,
    outstandingGates,
    delivery: {
      attempts,
      receipt: attempts.find(
        (attempt) =>
          attempt.state === 'sent'
          && (attempt.purpose === 'result' || attempt.purpose === 'publish_result'),
      ) ?? null,
    },
    recoveryActions: resolveRecoveryActions({ stage: stageProjection.stage, attempts }),
  };
}

/**
 * Convenience for the Task detail surface, which knows a Task rather than a
 * Work Item.
 */
export function buildWorkGoldenPathDetailProjectionForTask(input: {
  core: CatsCoreState;
  taskId: string;
  deliveryReader?: TransportWorkDeliveryReader;
}): WorkGoldenPathDetailProjection | null {
  const workItem = input.core.workItems.find((candidate) => candidate.taskId === input.taskId)
    ?? null;
  if (workItem === null) {
    return null;
  }
  return buildWorkGoldenPathDetailProjection({
    core: input.core,
    workItemId: workItem.id,
    deliveryReader: input.deliveryReader,
  });
}
