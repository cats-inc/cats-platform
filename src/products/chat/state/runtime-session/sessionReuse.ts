import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomWakeRequest,
} from '../../../../shared/roomRouting.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  createExplicitProviderModelSelection,
  parseProviderModelSelection,
  providerModelSelectionsEquivalent,
} from '../../../../shared/providerSelection.js';
import {
  requireChannel,
  setChannelParticipantLease,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  classifyRuntimeDispatchRecoveryError,
  describeProviderSessionUnavailableError,
} from '../runtime-dispatch/recovery.js';
import {
  resolvePrimaryParticipantExecutionAssignment,
  resolveParticipantLeaseAttachment,
  resolveExecutionLeaseSnapshot,
} from '../../shared/channelParticipants.js';
import {
  clearTargetSessionLease,
} from './state.js';
import type { RuntimeSessionRoutingOptions } from './shared.js';
import type { ChannelTaskExecutionContext } from './taskExecution.js';
import {
  buildResumedRuntimeSessionLeasePatch,
  resumeRuntimeSession,
} from './sessionResume.js';
import {
  buildDirectMessageRuntimeResumeFailure,
  buildProviderSessionReplacementFailure,
  isUnconfirmedProviderSessionReplacement,
  shouldPreserveDirectMessageRuntimeSession,
} from './sessionContinuity.js';

const MANUALLY_REVIVABLE_SESSION_STATES = new Set([
  'closed',
  'closing',
  'terminated',
  'terminated_with_error',
]);

export type EnsureTargetWakeRecorder = (
  status: RoomWakeRequest['status'],
  error?: string | null,
) => RoomWakeRequest | null;

export interface EnsureTargetSessionResult {
  state: ChatState;
  target: RoutingTarget;
  error: string | null;
  wakeRequest: RoomWakeRequest | null;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  /** This ensure rotated off an unavailable provider session; a send counts it against its budget. */
  rotatedProviderSession?: boolean;
}

/** What a replacement for a session whose provider session is gone must keep. */
export interface ProviderSessionRotation {
  previousSessionId: string;
  /** The old lease's workspace, which the replacement is created in. */
  previousCwd: string | null;
  /** The error that showed the provider session is gone; kept if the replacement cannot start. */
  error: string;
}

export type ExistingTargetSessionOutcome =
  | {
      kind: 'continue';
    }
  | {
      kind: 'retry';
      state: ChatState;
      target: RoutingTarget;
      /** Set when this retry replaces a session whose provider session is gone (ADR-068 §2). */
      providerSessionRotation?: ProviderSessionRotation;
    }
  | {
      kind: 'resolved';
      result: EnsureTargetSessionResult;
    };

function normalizeOptionalExecutionValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasParticipantExecutionTargetDrift(input: {
  participantLease: ReturnType<typeof resolveParticipantLeaseAttachment>;
  assignment: ReturnType<typeof resolvePrimaryParticipantExecutionAssignment>;
}): boolean {
  const { participantLease, assignment } = input;
  if (!participantLease || !assignment) {
    return false;
  }
  if (participantLease.provider === null) {
    return false;
  }

  if (participantLease.provider !== assignment.execution.target.provider) {
    return true;
  }
  const assignmentInstance = normalizeOptionalExecutionValue(assignment.execution.target.instance);
  const assignmentModel = normalizeOptionalExecutionValue(assignment.execution.target.model);
  if (
    assignmentInstance !== null
    && participantLease.instance !== assignmentInstance
  ) {
    return true;
  }
  if (
    assignmentModel !== null
    && participantLease.model !== assignmentModel
  ) {
    return true;
  }

  // Model-only requests become explicit selections at creation. An unselected
  // provider default in an older lease is not itself an operator retarget.
  const observedSelection = participantLease.modelSelection
    ?? (assignmentModel ? createExplicitProviderModelSelection(participantLease.model) : null);
  const requestedSelection = assignment.execution.modelSelection === undefined
    ? observedSelection
    : assignment.execution.modelSelection
      ?? createExplicitProviderModelSelection(assignment.execution.target.model);
  return !providerModelSelectionsEquivalent(observedSelection, requestedSelection);
}

function readObservedSessionState(
  observed: Awaited<ReturnType<RuntimeClient['observeSession']>>,
): string | null {
  const session = observed.session;
  if (!session || typeof session !== 'object') {
    return null;
  }

  const directStatus = (session as Record<string, unknown>).status;
  if (typeof directStatus === 'string' && directStatus.trim()) {
    return directStatus.trim().toLowerCase();
  }

  const inspection = (session as Record<string, unknown>).inspection;
  if (!inspection || typeof inspection !== 'object') {
    return null;
  }

  const inspectionState = (inspection as Record<string, unknown>).state;
  return typeof inspectionState === 'string' && inspectionState.trim()
    ? inspectionState.trim().toLowerCase()
    : null;
}

/**
 * One runtime probe for callers that keep a session warm (SPEC-124 FR-10).
 * `unknown` means the runtime could not answer, which is not the same as asleep.
 */
export async function observeRuntimeSessionLiveness(
  runtimeClient: Pick<RuntimeClient, 'observeSession'>,
  sessionId: string,
): Promise<'live' | 'closed' | 'unknown'> {
  try {
    const observedState = readObservedSessionState(await runtimeClient.observeSession(sessionId));
    return observedState && MANUALLY_REVIVABLE_SESSION_STATES.has(observedState) ? 'closed' : 'live';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return classifyRuntimeDispatchRecoveryError(message)?.reason === 'stale_session'
      ? 'closed'
      : 'unknown';
  }
}

async function shouldReviveExistingTargetSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  sessionId: string | null;
  runtimeClient: RuntimeClient;
  observeRuntimeForRevive: boolean;
}): Promise<boolean> {
  if (!input.sessionId) {
    return false;
  }

  const channel = requireChannel(input.state, input.channelId);
  const lease = resolveParticipantLeaseAttachment(channel, input.target.participantId);

  if (!lease) {
    return false;
  }

  if (lease.status === 'closed') {
    return true;
  }

  if (
    input.observeRuntimeForRevive
    && lease.status === 'error'
    && typeof lease.lastError === 'string'
    && classifyRuntimeDispatchRecoveryError(lease.lastError)?.reason === 'stale_session'
  ) {
    return true;
  }

  if (!input.observeRuntimeForRevive) {
    return false;
  }

  try {
    const observed = await input.runtimeClient.observeSession(input.sessionId);
    const observedState = readObservedSessionState(observed);
    return observedState ? MANUALLY_REVIVABLE_SESSION_STATES.has(observedState) : false;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return classifyRuntimeDispatchRecoveryError(message)?.reason === 'stale_session';
  }
}

function applyLeaseLaneAttachmentToTarget(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  laneId: string | null,
  now: Date,
): ChatState {
  if (!laneId) {
    return state;
  }

  return setChannelParticipantLease(
    state,
    channelId,
    target.participantId,
    { laneId },
    now,
  );
}

function readUnavailableProviderSessionLeaseError(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
): string | null {
  const lease = resolveParticipantLeaseAttachment(
    requireChannel(state, channelId),
    target.participantId,
  );
  return lease?.status === 'error'
    && typeof lease.lastError === 'string'
    && classifyRuntimeDispatchRecoveryError(lease.lastError)?.reason === 'provider_session_unavailable'
    ? lease.lastError
    : null;
}

/**
 * ADR-068 §2 (amended 2026-11-11): the provider-native session behind this
 * Runtime session is gone, so resuming cannot restore it. DM lanes and rooms
 * alike close it and retry with a replacement in the same cwd; the
 * replacement's first turn receives the continuity transplant.
 * `ensureTargetSession` commits the rotation (notice, budget) only once the
 * replacement exists, and restores the error and cwd if it cannot be created.
 */
async function rotateUnavailableProviderSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  sessionId: string;
  error: string;
  runtimeClient: RuntimeClient;
  now: Date;
}): Promise<ExistingTargetSessionOutcome> {
  const lease = resolveExecutionLeaseSnapshot(requireChannel(input.state, input.channelId), input.target);
  // Closing first also frees the capacity slot the replacement needs.
  await input.runtimeClient.closeSession(input.sessionId).catch(() => {});
  return {
    kind: 'retry',
    state: setChannelParticipantLease(
      input.state,
      input.channelId,
      input.target.participantId,
      { sessionId: null, status: 'not_started', lastError: null, startedAt: null },
      input.now,
    ),
    target: { ...input.target, sessionId: null },
    providerSessionRotation: {
      previousSessionId: input.sessionId,
      previousCwd: lease?.cwd?.trim() || null,
      error: input.error,
    },
  };
}

/**
 * A rotation replacement that hits the same failure before completing a turn
 * is not rotated again: it pauses with the error, as other DM errors do.
 */
function pauseUnconfirmedProviderSessionReplacement(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  sessionId: string;
  detail: string;
  laneId: string | null;
  now: Date;
  recordTargetWake: EnsureTargetWakeRecorder;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
}): ExistingTargetSessionOutcome {
  const error = buildProviderSessionReplacementFailure({ sessionId: input.sessionId, detail: input.detail });
  const errorState = setChannelParticipantLease(
    input.state,
    input.channelId,
    input.target.participantId,
    { status: 'error', lastError: error, lastUsedAt: input.now.toISOString() },
    input.now,
  );
  return {
    kind: 'resolved',
    result: {
      state: applyLeaseLaneAttachmentToTarget(errorState, input.channelId, input.target, input.laneId, input.now),
      target: input.target,
      error,
      wakeRequest: input.recordTargetWake('failed', error),
      taskExecutionContext: input.taskExecutionContext,
    },
  };
}

async function resumeExistingTargetSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  sessionId: string;
  runtimeClient: RuntimeClient;
  now: Date;
}): Promise<{
  kind: 'resumed';
  state: ChatState;
  target: RoutingTarget;
} | {
  kind: 'failed';
  error: string | null;
  errorCode: string | null;
}> {
  const resumeOutcome = await resumeRuntimeSession({
    runtimeClient: input.runtimeClient,
    sessionId: input.sessionId,
    scope: 'target_session_revive',
    executionPolicy: input.state.channels.find(c => c.id === input.channelId)?.runtimeExecutionPolicy ?? undefined,
  });
  const resumed = resumeOutcome.session;
  if (!resumed) {
    return {
      kind: 'failed',
      error: resumeOutcome.error,
      errorCode: resumeOutcome.errorCode ?? null,
    };
  }

  const leasePatch = buildResumedRuntimeSessionLeasePatch(resumed, input.now);
  const nextState = setChannelParticipantLease(
    input.state,
    input.channelId,
    input.target.participantId,
    leasePatch,
    input.now,
  );

  return {
    kind: 'resumed',
    state: nextState,
    target: {
      ...input.target,
      sessionId: resumed.id,
    },
  };
}

export async function resolveExistingTargetSessionOutcome(input: {
  state: ChatState;
  channelId: string;
  attachedTarget: RoutingTarget;
  runtimeClient: RuntimeClient;
  now: Date;
  laneId: string | null;
  recordTargetWake: EnsureTargetWakeRecorder;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  observeRuntimeForRevive: boolean;
  routingOptions: Pick<
    RuntimeSessionRoutingOptions,
    'memoryService' | 'companionStore' | 'chatStore'
  >;
}): Promise<ExistingTargetSessionOutcome> {
  const {
    state: initialState,
    channelId,
    attachedTarget,
    runtimeClient,
    now,
    laneId,
    recordTargetWake,
    taskExecutionContext,
    observeRuntimeForRevive,
    routingOptions,
  } = input;

  if (!attachedTarget.sessionId) {
    return { kind: 'continue' };
  }

  // Older snapshots discarded this existing lease field. Recover only Runtime's
  // observed choice; copying the requested choice would conceal a real change.
  let state = initialState;
  const channel = requireChannel(state, channelId);
  const lease = resolveExecutionLeaseSnapshot(channel, attachedTarget);
  if (lease && lease.modelSelection === undefined
    && (lease.status === 'ready' || lease.status === 'error' || lease.status === 'initializing' || lease.status === 'closed')) {
    try {
      const { session } = await runtimeClient.observeSession(attachedTarget.sessionId);
      if (session && typeof session === 'object') {
        const observed = session as Record<string, unknown>;
        const observedSelection = parseProviderModelSelection(observed.modelSelection);
        if (observed.id === attachedTarget.sessionId
          && (observed.modelSelection === null || observedSelection)) {
          const patch = { modelSelection: observedSelection };
          state = setChannelParticipantLease(state, channelId, attachedTarget.participantId, patch, now);
        }
      }
    } catch {
      // Unknown Runtime state is not evidence that the requested choice ran.
    }
  }

  const channelState = requireChannel(state, channelId);
  const assignment = resolvePrimaryParticipantExecutionAssignment(channelState, attachedTarget.participantId);
  const configuredTarget = assignment
    && { ...assignment.execution.target, modelSelection: assignment.execution.modelSelection };
  const currentLease = resolveExecutionLeaseSnapshot(channelState, attachedTarget);
  if (currentLease && currentLease.modelSelection === undefined && configuredTarget?.modelSelection
    && (currentLease.status === 'ready' || currentLease.status === 'error' || currentLease.status === 'initializing' || currentLease.status === 'closed')
    && currentLease.provider === configuredTarget.provider
    && (!configuredTarget.instance
      || normalizeOptionalExecutionValue(currentLease.instance) === normalizeOptionalExecutionValue(configuredTarget.instance))
    && (!configuredTarget.model
      || normalizeOptionalExecutionValue(currentLease.model) === normalizeOptionalExecutionValue(configuredTarget.model))) {
    const error = 'Cannot verify the existing session model options. Retry when Runtime can report them; the session and workspace have been preserved.';
    const patch = { status: 'error' as const, lastError: error, lastUsedAt: now.toISOString() };
    const errorState = setChannelParticipantLease(state, channelId, attachedTarget.participantId, patch, now);
    return { kind: 'resolved', result: {
      state: applyLeaseLaneAttachmentToTarget(errorState, channelId, attachedTarget, laneId, now),
      target: attachedTarget, error, wakeRequest: recordTargetWake('failed', error), taskExecutionContext,
    } };
  }
  const hasDirectCatExecutionTargetDrift = hasParticipantExecutionTargetDrift({
      participantLease: resolveParticipantLeaseAttachment(
        channelState,
        attachedTarget.participantId,
      ),
      assignment: resolvePrimaryParticipantExecutionAssignment(
        channelState,
        attachedTarget.participantId,
      ),
    });

  const unavailableLeaseError = hasDirectCatExecutionTargetDrift
    ? null
    : readUnavailableProviderSessionLeaseError(state, channelId, attachedTarget);
  if (unavailableLeaseError) {
    return isUnconfirmedProviderSessionReplacement(state, channelId, attachedTarget.sessionId)
      ? pauseUnconfirmedProviderSessionReplacement({
          state,
          channelId,
          target: attachedTarget,
          sessionId: attachedTarget.sessionId,
          detail: unavailableLeaseError,
          laneId,
          now,
          recordTargetWake,
          taskExecutionContext,
        })
      : rotateUnavailableProviderSession({
          state,
          channelId,
          target: attachedTarget,
          sessionId: attachedTarget.sessionId,
          error: unavailableLeaseError,
          runtimeClient,
          now,
        });
  }

  if (!hasDirectCatExecutionTargetDrift && await shouldReviveExistingTargetSession({
    state,
    channelId,
    target: attachedTarget,
    sessionId: attachedTarget.sessionId,
    runtimeClient,
    observeRuntimeForRevive,
  })) {
    const resumed = await resumeExistingTargetSession({
      state,
      channelId,
      target: attachedTarget,
      sessionId: attachedTarget.sessionId,
      runtimeClient,
      now,
    });
    if (resumed.kind === 'resumed') {
      return {
        kind: 'resolved',
        result: {
          state: applyLeaseLaneAttachmentToTarget(
            resumed.state,
            channelId,
            resumed.target,
            laneId,
            now,
          ),
          target: resumed.target,
          error: null,
          wakeRequest: recordTargetWake('completed'),
          taskExecutionContext,
        },
      };
    }

    if (classifyRuntimeDispatchRecoveryError(resumed.error ?? '', {
      code: resumed.errorCode,
    })?.reason === 'provider_session_unavailable') {
      const detail = describeProviderSessionUnavailableError(resumed.error ?? '');
      return isUnconfirmedProviderSessionReplacement(state, channelId, attachedTarget.sessionId)
        ? pauseUnconfirmedProviderSessionReplacement({
            state,
            channelId,
            target: attachedTarget,
            sessionId: attachedTarget.sessionId,
            detail,
            laneId,
            now,
            recordTargetWake,
            taskExecutionContext,
          })
        : rotateUnavailableProviderSession({
            state,
            channelId,
            target: attachedTarget,
            sessionId: attachedTarget.sessionId,
            error: detail,
            runtimeClient,
            now,
          });
    }

    const shouldPreserveDirectSession = shouldPreserveDirectMessageRuntimeSession({
      state,
      channelId,
      target: attachedTarget,
    }) && !hasDirectCatExecutionTargetDrift;
    if (shouldPreserveDirectSession) {
      const error = buildDirectMessageRuntimeResumeFailure({
        sessionId: attachedTarget.sessionId,
        resumeError: resumed.error,
      });
      const errorState = setChannelParticipantLease(
        state,
        channelId,
        attachedTarget.participantId,
        {
          status: 'error',
          lastError: error,
          lastUsedAt: now.toISOString(),
        },
        now,
      );
      return {
        kind: 'resolved',
        result: {
          state: applyLeaseLaneAttachmentToTarget(
            errorState,
            channelId,
            attachedTarget,
            laneId,
            now,
          ),
          target: attachedTarget,
          error,
          wakeRequest: recordTargetWake('failed', error),
          taskExecutionContext,
        },
      };
    }

    const resetState = clearTargetSessionLease(
      state,
      channelId,
      { participantId: attachedTarget.participantId },
      now,
    );
    return {
      kind: 'retry',
      state: resetState,
      target: { ...attachedTarget, sessionId: null },
    };
  }

  if (attachedTarget.participantKind === 'cat') {
    const participantLease = resolveParticipantLeaseAttachment(channelState, attachedTarget.participantId);
    const assignment = resolvePrimaryParticipantExecutionAssignment(
      channelState,
      attachedTarget.participantId,
    );
    const assignmentProvider = assignment?.execution.target.provider ?? null;
    const assignmentInstance = assignment?.execution.target.instance ?? null;
    const assignmentModel = assignment?.execution.target.model ?? null;
    const shouldRestartParticipantSession = hasParticipantExecutionTargetDrift({
      participantLease,
      assignment,
    });

    if (shouldRestartParticipantSession) {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient,
        sessionId: attachedTarget.sessionId,
        requestedPhase: 'pre_reset',
        memoryService: routingOptions.memoryService,
        companionStore: routingOptions.companionStore,
        coreStore: routingOptions.chatStore,
        now,
      });
      await runtimeClient.closeSession(attachedTarget.sessionId);
      const resetState = setChannelParticipantLease(
        state,
        channelId,
        attachedTarget.participantId,
        {
          sessionId: null,
          status: 'not_started',
          lastError: null,
          provider: assignmentProvider,
          instance: assignmentInstance,
          model: assignmentModel,
          modelSelection: assignment?.execution.modelSelection ?? null,
          startedAt: null,
          lastUsedAt: participantLease?.lastUsedAt ?? null,
        },
        now,
      );
      return {
        kind: 'retry',
        state: resetState,
        target: { ...attachedTarget, sessionId: null },
      };
    }
  }

  return {
    kind: 'resolved',
    result: {
      state: applyLeaseLaneAttachmentToTarget(state, channelId, attachedTarget, laneId, now),
      target: attachedTarget,
      error: null,
      wakeRequest: recordTargetWake('skipped'),
      taskExecutionContext,
    },
  };
}
