/**
 * Transport work-delivery golden path (SPEC-114, ADR-112).
 *
 * This is the product-owned coordinator: it owns intent capture, scope
 * versioning, authorization, completion judgment, and delivery policy, and it
 * owns none of the transport mechanics or provider execution. The transport
 * calls in through `TransportWorkGoldenPathPort`; the supervised run reports
 * execution facts in and receives no authority in return.
 *
 * Every method here is idempotent by construction. That is not defensive
 * programming: a Telegram callback can arrive twice, a process can restart
 * mid-flight, and either must converge on the same Task, Run, and single
 * outbound message.
 */

import {
  appendCoreActivity,
  upsertCoreArtifact,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type {
  CatsCoreState,
  CoreArtifactRecord,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreRunStatus,
} from '../../../core/types.js';
import {
  createTransportWorkActionTokenStore,
  encodeTransportWorkCallbackData,
  isTransportWorkCallbackDataWithinLimit,
  type TransportWorkActionTokenStore,
} from '../../../platform/transports/work-delivery/actionTokens.js';
import type {
  TransportWorkAction,
  TransportWorkDeliveryPayload,
  TransportWorkOriginV1,
  TransportWorkPayloadAction,
  TransportWorkProposalV1,
  TransportWorkReadiness,
  TransportWorkStage,
} from '../../../platform/transports/work-delivery/contracts.js';
import { resolveOutstandingDeliveryGates } from '../../../platform/transports/work-delivery/deliveryGates.js';
import {
  buildTransportWorkDeliveryKey,
  type TransportWorkOutbox,
} from '../../../platform/transports/work-delivery/outbox.js';
import { buildTransportWorkProposal } from '../../../platform/transports/work-delivery/proposal.js';
import { projectTransportWorkStage } from '../../../platform/transports/work-delivery/stageProjection.js';
import type { TransportWorkStageProjection } from '../../../platform/transports/work-delivery/stageProjection.js';
import {
  readWorkGoldenPathMetadata,
  writeWorkGoldenPathMetadata,
} from '../shared/workGoldenPathMetadata.js';
import { captureGoldenPathWorkItem } from './workGoldenPathIntake.js';
import {
  evaluateWorkCompletionEvidence,
  type WorkCommitEvidence,
  type WorkCompletionEvidenceResult,
} from './workCompletionEvidence.js';
import {
  admitTransportWorkExecution,
  buildWorkGoldenPathAdmissionKey,
  resolveWorkGoldenPathRunId,
} from './workGoldenPathAdmission.js';
import { applyWorkGoldenPathLifecycleAction } from './workGoldenPathLifecycle.js';
import {
  applyWorkGoldenPathPublishDecision,
  requestWorkGoldenPathPublishApproval,
  WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY,
} from './workGoldenPathPublish.js';
import type { RuntimeDeliveryClient } from '../../../platform/runtime/deliveryClient.js';
import type { WorkGoldenPathAdmissionResult } from './workGoldenPathAdmission.js';
import {
  assertSafeTransportPayload,
  createWorkGoldenPathTranslator,
  describeDeliverySideEffectsLocalized,
  localizeTransportWorkAction,
  renderAcceptedMessage,
  renderDecisionMessage,
  renderNotReadyMessage,
  renderProgressMessage,
  renderProposalMessage,
  renderRefusalMessage,
  renderResultMessage,
  type WorkGoldenPathTranslator,
} from '../shared/workGoldenPathMessages.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';

export interface WorkGoldenPathRequestInput {
  bindingId: string;
  conversationId: string;
  ownerActorId: string;
  externalUserRef: string;
  externalConversationRef: string;
  externalUpdateRef: string;
  externalMessageRef: string | null;
  goal: string;
  targetLabel: string;
  projectId: string | null;
  workspacePath: string | null;
  acceptanceCriteria: readonly string[];
  deliveryMode: CoreDeliveryMode;
  deliveryGates: readonly CoreDeliveryGate[];
  openQuestion: string | null;
  readiness: TransportWorkReadiness;
  /** Owner's transport locale; every later message is rendered in it. */
  locale: string | null;
}

export type WorkGoldenPathActionOffer = TransportWorkPayloadAction;

export interface WorkGoldenPathRequestResult {
  status: 'accepted' | 'not_ready';
  workItemId: string | null;
  proposal: TransportWorkProposalV1 | null;
  offers: WorkGoldenPathActionOffer[];
  readiness: TransportWorkReadiness;
}

export interface WorkGoldenPathAuthorizeInput {
  callbackData: string;
  bindingId: string;
  externalUserRef: string;
  /** Telegram callback query id; distinguishes owner events, not scopes. */
  ownerEventRef: string;
  readiness: TransportWorkReadiness;
}

export interface WorkGoldenPathRefusalInput {
  bindingId: string;
  externalConversationRef: string;
  externalUpdateRef: string;
  reasonKey: MessageKey;
  locale: string | null;
}

export interface WorkGoldenPathAuthorizeResult {
  status:
    | 'admitted'
    | 'already_admitted'
    | 'rejected'
    | 'cancelled'
    | 'published'
    | 'publish_denied'
    | 'publish_blocked'
    | 'retried'
    | 'resumed';
  /** Set when the caller should drive this Run again. */
  redriveRunId?: string | null;
  /** The work item the action landed on, when one was resolved. */
  workItemId?: string | null;
  rejection?: string;
  admission?: WorkGoldenPathAdmissionResult;
  stage: TransportWorkStage | null;
}

export interface WorkGoldenPathRunEvidence {
  workItemId: string;
  runId: string;
  /** Criteria the supervised run reported satisfied, by exact proposal text. */
  satisfiedCriteria: readonly string[];
  summary: string;
  /** Artifact the run produced, for `artifact_only`. */
  artifact: { title: string; path: string | null; mimeType: string | null } | null;
  /** Commit evidence, for `commit_only`. */
  commit: WorkCommitEvidence | null;
}

export interface WorkGoldenPathCompletionResult {
  status: 'result_ready' | 'delivered' | 'insufficient_evidence';
  evidence: WorkCompletionEvidenceResult;
  stage: TransportWorkStage;
  outstandingGates: CoreDeliveryGate[];
  deliveredMessageRef: string | null;
}

/** What the transport is allowed to call. Keeps ADR-112 section 4 honest. */
export interface TransportWorkGoldenPathPort {
  receiveRequest(input: WorkGoldenPathRequestInput): Promise<WorkGoldenPathRequestResult>;
  authorize(input: WorkGoldenPathAuthorizeInput): Promise<WorkGoldenPathAuthorizeResult>;
  describeStage(workItemId: string): Promise<TransportWorkStageProjection | null>;
}

export interface WorkGoldenPathServiceOptions {
  coreStore: CoreStore;
  outbox: TransportWorkOutbox;
  tokenStore?: TransportWorkActionTokenStore;
  actorRef?: string;
  /** Absent means gated publication can be approved but not performed. */
  deliveryClient?: RuntimeDeliveryClient;
  now?: () => Date;
}

export interface WorkGoldenPathService extends TransportWorkGoldenPathPort {
  markRunStatus(input: {
    workItemId: string;
    runId: string;
    status: CoreRunStatus;
    stageKey: MessageKey;
    milestoneKey: MessageKey;
  }): Promise<void>;
  completeRun(input: WorkGoldenPathRunEvidence): Promise<WorkGoldenPathCompletionResult>;
  /** Sends a bounded explanation for an input this slice cannot ingest. */
  sendRefusal(input: WorkGoldenPathRefusalInput): Promise<void>;
  /** Tells the owner the run stopped and needs them, with state-valid actions. */
  notifyDecisionNeeded(input: {
    workItemId: string;
    runId: string;
    reasonKey: MessageKey;
    consequenceKey: MessageKey;
    /** Interpolation for `reasonKey`, when it names something specific. */
    reasonValues?: Record<string, string>;
    discriminator: string;
  }): Promise<void>;
  readonly tokenStore: TransportWorkActionTokenStore;
}

/**
 * Outbox rows are keyed by work item, but a refusal happens before any work
 * item exists. A synthetic key keeps refusals in the same durable, idempotent
 * pipeline instead of becoming an untracked side-channel send.
 */
function pendingWorkItemKey(externalUpdateRef: string): string {
  return `pending:${externalUpdateRef}`;
}

const DEFAULT_ACTOR_REF = 'actor-work-golden-path';

/** Actions offered alongside a fresh proposal. */
const PROPOSAL_ACTIONS: readonly TransportWorkAction[] = ['start_work', 'adjust', 'cancel'];

/** Offered alongside a gated result preview (FR-41). */
const PUBLISH_DECISION_ACTIONS: readonly TransportWorkAction[] = ['publish', 'deny'];

/**
 * Gates cleared by a completed publish approval.
 *
 * Reading the approval Task rather than a flag is deliberate: the authoritative
 * record of "the owner allowed this" is the Core approval, so nothing can clear
 * a gate without leaving one (FR-40).
 */
function readSatisfiedGates(core: CatsCoreState, workItemId: string): CoreDeliveryGate[] {
  const approvalTask = core.tasks.find((task) => {
    const envelope = task.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY];
    return typeof envelope === 'object'
      && envelope !== null
      && !Array.isArray(envelope)
      && (envelope as Record<string, unknown>).workItemId === workItemId;
  });
  if (!approvalTask || approvalTask.approval.status !== 'approved') {
    return [];
  }
  const envelope = approvalTask.metadata[WORK_GOLDEN_PATH_PUBLISH_METADATA_KEY] as
    Record<string, unknown>;
  return Array.isArray(envelope.effectiveGates)
    ? envelope.effectiveGates as CoreDeliveryGate[]
    : [];
}

export function createWorkGoldenPathService(
  options: WorkGoldenPathServiceOptions,
): WorkGoldenPathService {
  const now = options.now ?? (() => new Date());
  const actorRef = options.actorRef ?? DEFAULT_ACTOR_REF;
  const tokenStore = options.tokenStore ?? createTransportWorkActionTokenStore({ now });
  const { coreStore, outbox } = options;

  async function buildStage(workItemId: string): Promise<TransportWorkStageProjection | null> {
    return projectStageFromCore(await coreStore.readCore(), workItemId);
  }

  /**
   * The stage derivation, synchronous over a snapshot the caller already holds.
   *
   * `authorize` needs it inside a synchronous scope resolver, and deriving the
   * allowed actions from anywhere other than the stage is how `publish` and
   * `deny` silently stopped being accepted.
   */
  function projectStageFromCore(
    core: CatsCoreState,
    workItemId: string,
  ): TransportWorkStageProjection | null {
    const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
    if (workItem === null) {
      return null;
    }
    const metadata = readWorkGoldenPathMetadata(workItem.metadata);
    const proposal = metadata?.proposal ?? null;
    const task = workItem.taskId
      ? core.tasks.find((candidate) => candidate.id === workItem.taskId) ?? null
      : null;
    const run = task
      ? core.runs.find((candidate) => candidate.taskId === task.id) ?? null
      : null;
    const outcome = run
      ? core.outcomes.find((candidate) => candidate.runId === run.id) ?? null
      : null;
    const artifacts = core.artifacts.filter((artifact) => artifact.workItemId === workItem.id);
    const commitId = readCommitId(outcome?.metadata);
    const outstandingGates = proposal === null
      ? []
      : resolveOutstandingDeliveryGates({
        deliveryMode: proposal.deliveryMode,
        effectiveGates: proposal.deliveryGates,
        // A completed publish approval is what clears the gates; nothing else
        // may do it implicitly (FR-40).
        satisfiedGates: readSatisfiedGates(core, workItem.id),
        publishesPublicArtifact: false,
      });

    return projectTransportWorkStage({
      workItem,
      proposal,
      task,
      run,
      outcome,
      artifacts,
      commitId,
      outstandingGates,
      deliveryRows: outbox.list(workItem.id),
      awaitingOwnerDecision: task?.approval.status === 'pending' && run !== null,
    });
  }

  function offerActions(input: {
    t: WorkGoldenPathTranslator;
    bindingId: string;
    ownerActorId: string;
    externalUserRef: string;
    workItemId: string;
    proposal: TransportWorkProposalV1;
    actions: readonly TransportWorkAction[];
  }): WorkGoldenPathActionOffer[] {
    return input.actions.map((action) => {
      const token = tokenStore.issue({
        bindingId: input.bindingId,
        ownerActorId: input.ownerActorId,
        externalUserRef: input.externalUserRef,
        workItemId: input.workItemId,
        proposalRevision: input.proposal.revision,
        proposalDigest: input.proposal.digest,
        action,
      });
      const callbackData = encodeTransportWorkCallbackData(token.token);
      if (!isTransportWorkCallbackDataWithinLimit(callbackData)) {
        // Would be silently dropped by Telegram; fail loudly at build time.
        throw new Error(`Golden-path callback data exceeds the Telegram limit: ${callbackData}`);
      }
      return { action, callbackData, label: localizeTransportWorkAction(input.t, action) };
    });
  }

  async function enqueueAndFlush(input: {
    bindingId: string;
    externalConversationRef: string;
    workItemId: string;
    taskId?: string | null;
    runId?: string | null;
    purpose: 'ack' | 'proposal' | 'progress' | 'decision' | 'result' | 'publish_result';
    discriminator: string;
    payload: TransportWorkDeliveryPayload;
  }): Promise<string | null> {
    // Enforced here rather than in each renderer so a future caller cannot
    // bypass it by assembling a payload of its own.
    assertSafeTransportPayload(input.payload);
    const idempotencyKey = buildTransportWorkDeliveryKey({
      bindingId: input.bindingId,
      workItemId: input.workItemId,
      purpose: input.purpose,
      discriminator: input.discriminator,
    });
    outbox.enqueue({
      idempotencyKey,
      bindingId: input.bindingId,
      externalConversationRef: input.externalConversationRef,
      workItemId: input.workItemId,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      purpose: input.purpose,
      payload: input.payload,
    });
    const flushed = await outbox.flush(idempotencyKey);
    return flushed.row.externalMessageRef;
  }

  /**
   * Offers only the recovery actions the projected stage actually permits.
   *
   * FR-35: a message must never hand the owner a button the product would then
   * refuse, so the offer is derived from the same stage the authorization check
   * will use.
   */
  function offerRecoveryActions(input: {
    t: WorkGoldenPathTranslator;
    core: CatsCoreState;
    workItemId: string;
    proposal: TransportWorkProposalV1;
  }): WorkGoldenPathActionOffer[] {
    const workItem = input.core.workItems.find(
      (candidate) => candidate.id === input.workItemId,
    );
    const metadata = workItem ? readWorkGoldenPathMetadata(workItem.metadata) : null;
    const origin = metadata?.origin ?? null;
    if (origin === null) {
      return [];
    }
    const stage = projectStageFromCore(input.core, input.workItemId);
    const allowed = (stage?.allowedActions ?? []).filter(
      (action): action is 'retry' | 'resume' | 'cancel' =>
        action === 'retry' || action === 'resume' || action === 'cancel',
    );
    return allowed.length === 0 ? [] : offerActions({
      t: input.t,
      bindingId: origin.bindingId,
      ownerActorId: input.core.ownerProfile.actorId,
      externalUserRef: metadata?.externalUserRef ?? origin.externalConversationRef,
      workItemId: input.workItemId,
      proposal: input.proposal,
      actions: allowed,
    });
  }

  /**
   * Owner-initiated cancellation (SPEC-114 FR-35).
   *
   * Cancels the authoritative Task and Run rather than only stopping the
   * transport conversation, so an in-flight supervised step sees a terminal
   * state on its next boundary check and stops.
   */
  async function cancelGoldenPathWork(
    workItemId: string,
    ownerActorId: string,
  ): Promise<WorkGoldenPathAuthorizeResult> {
    const core = await coreStore.readCore();
    const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
    const metadata = workItem ? readWorkGoldenPathMetadata(workItem.metadata) : null;
    const origin = metadata?.origin ?? null;
    if (workItem === null || origin === null) {
      return { status: 'rejected', rejection: 'work_item_not_found', stage: null };
    }

    await coreStore.updateCore((state) => {
      let next = state;
      const task = state.tasks.find((candidate) => candidate.id === workItem.taskId) ?? null;
      const run = task
        ? state.runs.find((candidate) => candidate.taskId === task.id) ?? null
        : null;
      if (run !== null && run.status !== 'completed') {
        next = upsertCoreRun(
          next,
          {
            ...run,
            status: 'cancelled',
            summary: 'Cancelled by the owner from Telegram.',
            completedAt: now().toISOString(),
          },
          now(),
        ).core;
      }
      if (task !== null && task.status !== 'completed') {
        next = upsertCoreTask(
          next,
          { ...task, status: 'cancelled' },
          now(),
        ).core;
      }
      return appendCoreActivity(
        next,
        {
          id: `activity-wgp-cancelled-${workItem.id}`,
          kind: 'status_change',
          actorId: ownerActorId,
          projectId: workItem.projectId,
          workItemId: workItem.id,
          conversationId: workItem.conversationId,
          taskId: workItem.taskId,
          runId: run?.id ?? null,
          message: 'Owner cancelled the work from Telegram.',
          metadata: { workGoldenPath: { schemaVersion: 1, reason: 'owner_cancelled' } },
        },
        now(),
      ).core;
    });

    tokenStore.invalidateWorkItem(workItem.id);
    await enqueueAndFlush({
      bindingId: origin.bindingId,
      externalConversationRef: origin.externalConversationRef,
      workItemId: workItem.id,
      purpose: 'decision',
      discriminator: `cancelled:${origin.proposalRevision}`,
      payload: renderProgressMessage({
        t: createWorkGoldenPathTranslator(metadata?.locale ?? null),
        workItemId: workItem.id,
        stageKey: messageKeys.workDeliveryStageCancelled,
        milestoneKey: messageKeys.workDeliveryMilestoneCancelled,
      }),
    });

    return {
      status: 'cancelled',
      stage: (await buildStage(workItem.id))?.stage ?? null,
    };
  }

  /**
   * Applies an owner publish decision and, when approved, finally delivers.
   *
   * Delivery happens only after the external actions succeeded: telling the
   * owner "published" before the push landed would be the exact dishonesty
   * ADR-112 section 6 is written against.
   */
  async function decidePublication(
    workItemId: string,
    ownerActorId: string,
    action: 'publish' | 'deny',
  ): Promise<WorkGoldenPathAuthorizeResult> {
    const core = await coreStore.readCore();
    const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
    const metadata = workItem ? readWorkGoldenPathMetadata(workItem.metadata) : null;
    const origin = metadata?.origin ?? null;
    const proposal = metadata?.proposal ?? null;
    if (workItem === null || origin === null || proposal === null) {
      return { status: 'rejected', rejection: 'work_item_not_found', stage: null };
    }
    const t = createWorkGoldenPathTranslator(metadata?.locale ?? null);

    const decision = await applyWorkGoldenPathPublishDecision(
      coreStore,
      {
        workItemId,
        decision: action === 'publish' ? 'approve' : 'deny',
        ownerActorId,
        actorRef,
        deliveryClient: options.deliveryClient,
      },
      now,
    );

    if (decision.status === 'denied') {
      tokenStore.invalidateWorkItem(workItemId);
      await enqueueAndFlush({
        bindingId: origin.bindingId,
        externalConversationRef: origin.externalConversationRef,
        workItemId,
        purpose: 'decision',
        discriminator: `publish-denied:${decision.publishKey}`,
        payload: renderRefusalMessage({ t, reasonKey: messageKeys.workDeliveryPublishDenied }),
      });
      return {
        status: 'publish_denied',
        stage: (await buildStage(workItemId))?.stage ?? null,
      };
    }

    if (decision.status === 'pending_checks') {
      // The external work is under way; nothing was refused and nothing is
      // delivered. The approval stays open so the owner can finish it later.
      await enqueueAndFlush({
        bindingId: origin.bindingId,
        externalConversationRef: origin.externalConversationRef,
        workItemId,
        purpose: 'decision',
        discriminator: `publish-pending:${decision.pendingOperationId ?? decision.publishKey}`,
        payload: renderDecisionMessage({
          t,
          workItemId,
          reason: t(messageKeys.workDeliveryPublishPendingChecks, {
            actions: decision.performedActions.join(', ') || 'none',
          }),
          consequence: t(messageKeys.workDeliveryPublishPendingConsequence),
        }),
      });
      return {
        status: 'publish_blocked',
        rejection: 'pending_checks',
        stage: (await buildStage(workItemId))?.stage ?? null,
      };
    }

    if (decision.status === 'blocked' || decision.status === 'not_pending') {
      await enqueueAndFlush({
        bindingId: origin.bindingId,
        externalConversationRef: origin.externalConversationRef,
        workItemId,
        purpose: 'decision',
        discriminator: `publish-blocked:${decision.blockedReasons.join('+')}`,
        payload: renderDecisionMessage({
          t,
          workItemId,
          reason: t(messageKeys.workDeliveryPublishBlocked, {
            reasons: decision.blockedReasons.join(', '),
          }),
          consequence: t(messageKeys.workDeliveryPublishConsequence),
        }),
      });
      return {
        status: 'publish_blocked',
        rejection: decision.blockedReasons.join(','),
        stage: (await buildStage(workItemId))?.stage ?? null,
      };
    }

    // Approved and the external actions landed: now the result may be delivered.
    const evidence = evaluateWorkCompletionEvidence({
      deliveryMode: proposal.deliveryMode,
      acceptanceCriteria: proposal.acceptanceCriteria,
      satisfiedCriteria: proposal.acceptanceCriteria,
      outcomeStatus: 'succeeded',
      artifacts: [],
      commit: null,
    });
    await enqueueAndFlush({
      bindingId: origin.bindingId,
      externalConversationRef: origin.externalConversationRef,
      workItemId,
      purpose: 'publish_result',
      discriminator: `publish:${decision.publishKey}`,
      payload: renderResultMessage({
        t,
        workItemId,
        proposal,
        summary: decision.performedActions.length > 0
          ? t(messageKeys.workDeliveryPublishDone, {
            actions: decision.performedActions.join(', '),
          })
          : t(messageKeys.workDeliveryPublishDone, { actions: 'none' }),
        evidence,
        commitId: decision.reference,
        artifactTitle: null,
        outstandingGates: [],
        actions: [],
      }),
      taskId: workItem.taskId,
      runId: null,
    });

    return {
      status: 'published',
      stage: (await buildStage(workItemId))?.stage ?? null,
    };
  }

  /**
   * Applies an owner retry/resume and hands the Run back to the driver.
   *
   * The service does not drive the run itself: the caller that owns the runner
   * does, which keeps this module free of execution concerns and keeps the
   * ingress non-blocking (FR-14).
   */
  async function applyLifecycle(
    workItemId: string,
    ownerActorId: string,
    action: 'retry' | 'resume',
  ): Promise<WorkGoldenPathAuthorizeResult> {
    const core = await coreStore.readCore();
    const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
    const metadata = workItem ? readWorkGoldenPathMetadata(workItem.metadata) : null;
    const origin = metadata?.origin ?? null;
    if (workItem === null || origin === null) {
      return { status: 'rejected', rejection: 'work_item_not_found', stage: null };
    }
    const t = createWorkGoldenPathTranslator(metadata?.locale ?? null);

    const result = await applyWorkGoldenPathLifecycleAction(
      coreStore,
      { workItemId, action, actorRef, ownerActorId },
      now,
    );

    if (result.status === 'refused') {
      await enqueueAndFlush({
        bindingId: origin.bindingId,
        externalConversationRef: origin.externalConversationRef,
        workItemId,
        purpose: 'decision',
        discriminator: `${action}-refused:${result.reason}`,
        payload: renderRefusalMessage({
          t,
          reasonKey: messageKeys.workDeliveryLifecycleRefused,
          values: { reason: result.reason ?? action },
        }),
      });
      return {
        status: 'rejected',
        rejection: result.reason ?? 'lifecycle_refused',
        stage: (await buildStage(workItemId))?.stage ?? null,
      };
    }

    await enqueueAndFlush({
      bindingId: origin.bindingId,
      externalConversationRef: origin.externalConversationRef,
      workItemId,
      runId: result.runId,
      purpose: 'progress',
      discriminator: `${action}:${result.runId}`,
      payload: renderProgressMessage({
        t,
        workItemId,
        stageKey: messageKeys.workDeliveryStageRunning,
        milestoneKey: action === 'retry'
          ? messageKeys.workDeliveryRetryStarted
          : messageKeys.workDeliveryResumeStarted,
      }),
    });

    return {
      status: action === 'retry' ? 'retried' : 'resumed',
      redriveRunId: result.runId,
      workItemId,
      stage: (await buildStage(workItemId))?.stage ?? null,
    };
  }

  return {
    tokenStore,

    async receiveRequest(input) {
      const t = createWorkGoldenPathTranslator(input.locale);

      // FR-3: never claim work is queued when admission cannot happen, and never
      // leave the owner in silence either — say what is missing.
      if (!input.readiness.ready) {
        await enqueueAndFlush({
          bindingId: input.bindingId,
          externalConversationRef: input.externalConversationRef,
          workItemId: pendingWorkItemKey(input.externalUpdateRef),
          purpose: 'ack',
          discriminator: `not-ready:${input.externalUpdateRef}`,
          payload: renderNotReadyMessage({ t, readiness: input.readiness }),
        });
        return {
          status: 'not_ready',
          workItemId: null,
          proposal: null,
          offers: [],
          readiness: input.readiness,
        };
      }

      const capture = await captureGoldenPathWorkItem(
        coreStore,
        {
          goal: input.goal,
          bindingId: input.bindingId,
          conversationId: input.conversationId,
          externalMessageRef: input.externalMessageRef,
          externalUpdateRef: input.externalUpdateRef,
        },
        { actorRef },
        now,
      );
      if (capture.status !== 'captured') {
        return {
          status: 'not_ready',
          workItemId: null,
          proposal: null,
          offers: [],
          readiness: input.readiness,
        };
      }

      const workItemId = capture.workItemId;
      const existing = readWorkGoldenPathMetadata(capture.workItem.metadata);
      const nextRevision = (existing?.proposal?.revision ?? 0) + 1;
      const proposal = buildTransportWorkProposal({
        revision: nextRevision,
        goal: input.goal,
        targetLabel: input.targetLabel,
        projectId: input.projectId,
        workspacePath: input.workspacePath,
        acceptanceCriteria: input.acceptanceCriteria,
        deliveryMode: input.deliveryMode,
        deliveryGates: input.deliveryGates,
        sideEffects: [describeDeliverySideEffectsLocalized(t, input.deliveryMode)],
        openQuestion: input.openQuestion,
        createdAt: now(),
      });

      // An unchanged digest must not bump the revision, or every duplicate
      // update would invalidate the owner's outstanding buttons.
      const effectiveProposal = existing?.proposal && existing.proposal.digest === proposal.digest
        ? existing.proposal
        : proposal;

      const origin: TransportWorkOriginV1 = {
        version: 1,
        transport: 'telegram',
        bindingId: input.bindingId,
        externalConversationRef: input.externalConversationRef,
        externalUpdateRef: input.externalUpdateRef,
        externalMessageRef: input.externalMessageRef,
        conversationId: input.conversationId,
        workItemId,
        proposalRevision: effectiveProposal.revision,
        proposalDigest: effectiveProposal.digest,
      };

      if (existing?.proposal?.digest !== effectiveProposal.digest) {
        // Scope changed: outstanding tokens for the old revision must die.
        tokenStore.invalidateWorkItem(workItemId);
      }

      const requestLocale = input.locale;
      const requestUserRef = input.externalUserRef;
      await coreStore.updateCore((core) => {
        const workItem = core.workItems.find((candidate) => candidate.id === workItemId);
        if (!workItem) {
          return core;
        }
        const write = upsertCoreWorkItem(
          core,
          {
            id: workItem.id,
            title: workItem.title,
            // Triage the scope to `ready` so execution admission has a legal
            // starting status. This is still pre-authorization (FR-19).
            status: 'ready',
            ownerActorId: workItem.ownerActorId,
            projectId: input.projectId,
            conversationId: workItem.conversationId,
            taskId: workItem.taskId,
            parentWorkItemId: workItem.parentWorkItemId,
            summary: workItem.summary,
            assignedActorIds: workItem.assignedActorIds,
            metadata: writeWorkGoldenPathMetadata(workItem.metadata, {
              origin,
              proposal: effectiveProposal,
              locale: requestLocale,
              externalUserRef: requestUserRef,
            }),
          },
          now(),
        );
        return write.core;
      });

      await enqueueAndFlush({
        bindingId: input.bindingId,
        externalConversationRef: input.externalConversationRef,
        workItemId,
        purpose: 'ack',
        discriminator: input.externalUpdateRef,
        payload: renderAcceptedMessage({ t, workItemId, goal: input.goal }),
      });
      const offers = offerActions({
        t,
        bindingId: input.bindingId,
        ownerActorId: input.ownerActorId,
        externalUserRef: input.externalUserRef,
        workItemId,
        proposal: effectiveProposal,
        actions: PROPOSAL_ACTIONS,
      });
      await enqueueAndFlush({
        bindingId: input.bindingId,
        externalConversationRef: input.externalConversationRef,
        workItemId,
        purpose: 'proposal',
        discriminator: `r${effectiveProposal.revision}:${effectiveProposal.digest}`,
        payload: renderProposalMessage({
          t,
          workItemId,
          proposal: effectiveProposal,
          actions: offers,
        }),
      });

      return {
        status: 'accepted',
        workItemId,
        proposal: effectiveProposal,
        offers,
        readiness: input.readiness,
      };
    },

    async authorize(input) {
      // The token is resolved before anything else so a forged or replayed
      // button never reaches product state. Scope is looked up for the work item
      // the token names, so one binding can carry several open requests.
      const core = await coreStore.readCore();
      const resolution = tokenStore.resolve({
        callbackData: input.callbackData,
        bindingId: input.bindingId,
        externalUserRef: input.externalUserRef,
        resolveScope: (workItemId) => {
          const workItem = core.workItems.find((candidate) => candidate.id === workItemId)
            ?? null;
          if (workItem === null) {
            return null;
          }
          const metadata = readWorkGoldenPathMetadata(workItem.metadata);
          const proposal = metadata?.proposal ?? null;
          if (proposal === null || metadata?.origin?.bindingId !== input.bindingId) {
            return null;
          }

          const stage = projectStageFromCore(core, workItemId);
          const allowedActions: TransportWorkAction[] = [
            ...(stage?.allowedActions ?? PROPOSAL_ACTIONS),
          ];
          // A replayed `Start work` must converge on the existing Task and Run
          // (FR-26) rather than be refused because the stage has moved past
          // `scope_proposed`. Allowing it back in is safe only when this exact
          // revision is already admitted, checked against the deterministic
          // admission Run id rather than a stage label.
          const admittedRunId = resolveWorkGoldenPathRunId(buildWorkGoldenPathAdmissionKey({
            bindingId: input.bindingId,
            workItemId,
            proposalRevision: proposal.revision,
            proposalDigest: proposal.digest,
          }));
          if (core.runs.some((run) => run.id === admittedRunId)) {
            allowedActions.push('start_work');
          }

          return {
            proposalRevision: proposal.revision,
            proposalDigest: proposal.digest,
            allowedActions,
          };
        },
      });

      if (resolution.status === 'rejected') {
        return { status: 'rejected', rejection: resolution.reason, stage: null };
      }
      const token = resolution.token;

      if (token.action === 'cancel') {
        return cancelGoldenPathWork(token.workItemId, token.ownerActorId);
      }
      if (token.action === 'publish' || token.action === 'deny') {
        return decidePublication(token.workItemId, token.ownerActorId, token.action);
      }
      if (token.action === 'retry' || token.action === 'resume') {
        return applyLifecycle(token.workItemId, token.ownerActorId, token.action);
      }
      if (token.action !== 'start_work') {
        return {
          status: 'rejected',
          rejection: 'action_not_allowed',
          stage: (await buildStage(token.workItemId))?.stage ?? null,
        };
      }

      const admission = await admitTransportWorkExecution(
        coreStore,
        {
          workItemId: token.workItemId,
          bindingId: token.bindingId,
          ownerActorId: token.ownerActorId,
          proposalRevision: token.proposalRevision,
          proposalDigest: token.proposalDigest,
          readiness: input.readiness,
          ownerEventRef: input.ownerEventRef,
          actorRef,
        },
        now,
      );
      if (admission.status === 'blocked') {
        return {
          status: 'rejected',
          rejection: admission.reason,
          admission,
          stage: (await buildStage(token.workItemId))?.stage ?? null,
        };
      }

      const admittedWorkItem = core.workItems.find(
        (candidate) => candidate.id === token.workItemId,
      );
      const admittedMetadata = readWorkGoldenPathMetadata(admittedWorkItem?.metadata);
      const admittedOrigin = admittedMetadata?.origin;
      if (admittedOrigin) {
        await enqueueAndFlush({
          bindingId: token.bindingId,
          externalConversationRef: admittedOrigin.externalConversationRef,
          workItemId: token.workItemId,
          taskId: admission.taskId,
          runId: admission.runId,
          purpose: 'progress',
          discriminator: `admitted:${admission.admissionKey}`,
          payload: renderProgressMessage({
            t: createWorkGoldenPathTranslator(admittedMetadata?.locale ?? null),
            workItemId: token.workItemId,
            stageKey: messageKeys.workDeliveryStageAdmitted,
            milestoneKey: messageKeys.workDeliveryMilestoneAdmitted,
          }),
        });
      }

      return {
        status: admission.status,
        admission,
        stage: (await buildStage(token.workItemId))?.stage ?? null,
      };
    },

    async describeStage(workItemId) {
      return buildStage(workItemId);
    },

    async markRunStatus(input) {
      const core = await coreStore.readCore();
      const run = core.runs.find((candidate) => candidate.id === input.runId) ?? null;
      if (run === null) {
        return;
      }
      const workItem = core.workItems.find((candidate) => candidate.id === input.workItemId);
      const metadata = workItem ? readWorkGoldenPathMetadata(workItem.metadata) : null;
      const origin = metadata?.origin ?? null;
      await coreStore.updateCore((state) => upsertCoreRun(
        state,
        {
          id: run.id,
          title: run.title,
          status: input.status,
          conversationId: run.conversationId,
          taskId: run.taskId,
          orchestratorActorId: run.orchestratorActorId,
          summary: run.summary,
          startedAt: input.status === 'running' ? now().toISOString() : run.startedAt,
          metadata: run.metadata,
        },
        now(),
      ).core);

      if (origin !== null) {
        await enqueueAndFlush({
          bindingId: origin.bindingId,
          externalConversationRef: origin.externalConversationRef,
          workItemId: input.workItemId,
          runId: input.runId,
          purpose: 'progress',
          discriminator: `${input.status}:${String(input.milestoneKey)}`,
          payload: renderProgressMessage({
            t: createWorkGoldenPathTranslator(metadata?.locale ?? null),
            workItemId: input.workItemId,
            stageKey: input.stageKey,
            milestoneKey: input.milestoneKey,
          }),
        });
      }
    },

    async notifyDecisionNeeded(input) {
      const core = await coreStore.readCore();
      const workItem = core.workItems.find((candidate) => candidate.id === input.workItemId);
      const metadata = workItem ? readWorkGoldenPathMetadata(workItem.metadata) : null;
      const origin = metadata?.origin ?? null;
      const proposal = metadata?.proposal ?? null;
      if (origin === null || proposal === null) {
        return;
      }
      const t = createWorkGoldenPathTranslator(metadata?.locale ?? null);
      const offered = offerRecoveryActions({ t, core, workItemId: input.workItemId, proposal });
      await enqueueAndFlush({
        bindingId: origin.bindingId,
        externalConversationRef: origin.externalConversationRef,
        workItemId: input.workItemId,
        runId: input.runId,
        purpose: 'decision',
        discriminator: input.discriminator,
        payload: {
          ...renderDecisionMessage({
            t,
            workItemId: input.workItemId,
            reason: t(input.reasonKey, input.reasonValues),
            consequence: t(input.consequenceKey),
          }),
          actions: offered,
        },
      });
    },

    async sendRefusal(input) {
      await enqueueAndFlush({
        bindingId: input.bindingId,
        externalConversationRef: input.externalConversationRef,
        workItemId: pendingWorkItemKey(input.externalUpdateRef),
        purpose: 'ack',
        discriminator: `refusal:${String(input.reasonKey)}`,
        payload: renderRefusalMessage({
          t: createWorkGoldenPathTranslator(input.locale),
          reasonKey: input.reasonKey,
        }),
      });
    },

    async completeRun(input) {
      const core = await coreStore.readCore();
      const workItem = core.workItems.find((candidate) => candidate.id === input.workItemId)
        ?? null;
      if (workItem === null) {
        throw new Error(`Unknown golden-path work item: ${input.workItemId}`);
      }
      const metadata = readWorkGoldenPathMetadata(workItem.metadata);
      const proposal = metadata?.proposal ?? null;
      const origin = metadata?.origin ?? null;
      if (proposal === null || origin === null) {
        throw new Error(`Work item ${input.workItemId} has no authorized golden-path scope.`);
      }
      const t = createWorkGoldenPathTranslator(metadata?.locale ?? null);

      const artifacts: CoreArtifactRecord[] = core.artifacts.filter(
        (artifact) => artifact.workItemId === workItem.id,
      );
      const projectedArtifacts = input.artifact === null
        ? artifacts
        : [
          ...artifacts,
          {
            id: goldenPathArtifactId(input.runId),
            title: input.artifact.title,
            kind: 'document',
            status: 'ready',
            projectId: workItem.projectId,
            workItemId: workItem.id,
            conversationId: workItem.conversationId,
            taskId: workItem.taskId,
            runId: input.runId,
            path: input.artifact.path,
            mimeType: input.artifact.mimeType,
            sizeBytes: null,
            summary: input.summary,
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            metadata: {},
          } satisfies CoreArtifactRecord,
        ];

      const evidence = evaluateWorkCompletionEvidence({
        deliveryMode: proposal.deliveryMode,
        acceptanceCriteria: proposal.acceptanceCriteria,
        satisfiedCriteria: input.satisfiedCriteria,
        // The outcome is not written until evidence passes, so evaluate against
        // the *claim* first; writing `succeeded` before checking would make the
        // check circular.
        outcomeStatus: 'succeeded',
        artifacts: projectedArtifacts,
        commit: input.commit,
      });

      if (!evidence.accepted) {
        // FR-30: a returned provider step that fails the evidence bar leaves the
        // run blocked for an owner decision rather than completing.
        await coreStore.updateCore((state) => {
          const run = state.runs.find((candidate) => candidate.id === input.runId);
          if (!run) {
            return state;
          }
          return upsertCoreRun(
            state,
            { ...run, status: 'blocked', metadata: run.metadata },
            now(),
          ).core;
        });
        await enqueueAndFlush({
          bindingId: origin.bindingId,
          externalConversationRef: origin.externalConversationRef,
          workItemId: workItem.id,
          runId: input.runId,
          purpose: 'decision',
          discriminator: `evidence:${evidence.gaps.join('+')}`,
          payload: {
            ...renderDecisionMessage({
              t,
              workItemId: workItem.id,
              reason: t(messageKeys.workDeliveryDecisionEvidenceReason, {
                gaps: evidence.gaps.join(', '),
              }),
              consequence: t(messageKeys.workDeliveryDecisionEvidenceConsequence),
            }),
            actions: offerRecoveryActions({
              t,
              core: await coreStore.readCore(),
              workItemId: workItem.id,
              proposal,
            }),
          },
        });
        const blockedStage = await buildStage(workItem.id);
        return {
          status: 'insufficient_evidence',
          evidence,
          stage: blockedStage?.stage ?? 'decision_needed',
          outstandingGates: blockedStage?.outstandingGates ?? [],
          deliveredMessageRef: null,
        };
      }

      // Evidence accepted: materialize Outcome + Artifact, then complete the Run.
      await coreStore.updateCore((state) => {
        let next = state;
        if (input.artifact !== null) {
          next = upsertCoreArtifact(
            next,
            {
              id: goldenPathArtifactId(input.runId),
              title: input.artifact.title,
              kind: 'document',
              // SPEC-092 / FR-38: a declaration may reach `ready`, never
              // `published`. Publication is a separate authorized action.
              status: 'ready',
              projectId: workItem.projectId,
              workItemId: workItem.id,
              conversationId: workItem.conversationId,
              taskId: workItem.taskId,
              runId: input.runId,
              path: input.artifact.path,
              mimeType: input.artifact.mimeType,
              summary: input.summary,
            },
            now(),
          ).core;
        }
        next = upsertCoreOutcome(
          next,
          {
            id: goldenPathOutcomeId(input.runId),
            title: proposal.goal,
            status: 'succeeded',
            conversationId: workItem.conversationId,
            runId: input.runId,
            taskId: workItem.taskId,
            summary: input.summary,
            metadata: {
              acceptanceCriteria: [...proposal.acceptanceCriteria],
              satisfiedCriteria: [...input.satisfiedCriteria],
              deliveryMode: proposal.deliveryMode,
              ...(input.commit === null ? {} : {
                commitId: input.commit.commitId,
                changeSummary: input.commit.changeSummary,
                validation: input.commit.validation,
              }),
            },
          },
          now(),
        ).core;
        const run = next.runs.find((candidate) => candidate.id === input.runId);
        if (run) {
          next = upsertCoreRun(
            next,
            { ...run, status: 'completed', completedAt: now().toISOString() },
            now(),
          ).core;
        }
        return appendCoreActivity(
          next,
          {
            id: `activity-wgp-result-${input.runId}`,
            kind: 'artifact_recorded',
            actorId: actorRef,
            projectId: workItem.projectId,
            workItemId: workItem.id,
            conversationId: workItem.conversationId,
            taskId: workItem.taskId,
            runId: input.runId,
            message: `Result evidence accepted for "${proposal.goal}".`,
            metadata: { deliveryMode: proposal.deliveryMode },
          },
          now(),
        ).core;
      });

      const outstandingGates = resolveOutstandingDeliveryGates({
        deliveryMode: proposal.deliveryMode,
        effectiveGates: proposal.deliveryGates,
        satisfiedGates: [],
        publishesPublicArtifact: false,
      });

      if (outstandingGates.length > 0) {
        // FR-40/FR-41: a gate still needs an owner decision. The result preview
        // goes out; the deliverable does not. The decision itself is a Core
        // approval so it is auditable and visible in Desktop.
        await requestWorkGoldenPathPublishApproval(
          coreStore,
          {
            workItemId: workItem.id,
            runId: input.runId,
            taskId: workItem.taskId,
            bindingId: origin.bindingId,
            proposal,
            outstandingGates,
            ownerActorId: (await coreStore.readCore()).ownerProfile.actorId,
            actorRef,
          },
          now,
        );
        const publishOffers = offerActions({
          t,
          bindingId: origin.bindingId,
          ownerActorId: (await coreStore.readCore()).ownerProfile.actorId,
          // Bound to the same external user that authorized execution, so a
          // different chat member cannot publish someone else's result.
          externalUserRef: metadata?.externalUserRef ?? origin.externalConversationRef,
          workItemId: workItem.id,
          proposal,
          actions: PUBLISH_DECISION_ACTIONS,
        });
        await enqueueAndFlush({
          bindingId: origin.bindingId,
          externalConversationRef: origin.externalConversationRef,
          workItemId: workItem.id,
          runId: input.runId,
          purpose: 'decision',
          discriminator: `gates:${outstandingGates.join('+')}`,
          payload: renderResultMessage({
            t,
            actions: publishOffers,
            workItemId: workItem.id,
            proposal,
            summary: input.summary,
            evidence,
            commitId: input.commit?.commitId ?? null,
            artifactTitle: input.artifact?.title ?? null,
            outstandingGates,
          }),
        });
        return {
          status: 'result_ready',
          evidence,
          stage: 'result_ready',
          outstandingGates,
          deliveredMessageRef: null,
        };
      }

      // FR-43: deliver to the *recorded* binding, not a currently-selected one.
      const messageRef = await enqueueAndFlush({
        bindingId: origin.bindingId,
        externalConversationRef: origin.externalConversationRef,
        workItemId: workItem.id,
        runId: input.runId,
        purpose: 'result',
        discriminator: `run:${input.runId}`,
        payload: renderResultMessage({
          t,
          workItemId: workItem.id,
          proposal,
          summary: input.summary,
          evidence,
          commitId: input.commit?.commitId ?? null,
          artifactTitle: input.artifact?.title ?? null,
          outstandingGates: [],
        }),
      });

      const finalStage = await buildStage(workItem.id);
      return {
        status: finalStage?.stage === 'delivered' ? 'delivered' : 'result_ready',
        evidence,
        stage: finalStage?.stage ?? 'result_ready',
        outstandingGates: [],
        deliveredMessageRef: messageRef,
      };
    },
  };
}

function goldenPathArtifactId(runId: string): string {
  return `artifact-wgp-${runId}`;
}

function goldenPathOutcomeId(runId: string): string {
  return `outcome-wgp-${runId}`;
}

function readCommitId(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).commitId;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
