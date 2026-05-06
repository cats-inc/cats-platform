import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomWakeRequest,
} from '../../../../shared/roomRouting.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { providerModelSelectionsEqual } from '../../../../shared/providerSelection.js';
import {
  requireChannel,
  setChannelParticipantLease,
  setChannelOrchestratorLease,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { resolveOrchestratorExecutionTarget } from '../runtimeTargeting.js';
import { classifyRuntimeDispatchRecoveryError } from '../runtime-dispatch/recovery.js';
import {
  resolveOrchestratorLeaseAttachment,
  resolvePrimaryParticipantExecutionAssignment,
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import { isProviderDefaultChatChannel } from '../../shared/channelTopology.js';
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
  shouldPreserveDirectMessageRuntimeSession,
} from './sessionContinuity.js';

const MANUALLY_REVIVABLE_SESSION_STATES = new Set([
  'closed',
  'closing',
  'terminated',
  'terminated_with_error',
]);

type EnsureTargetWakeRecorder = (
  status: RoomWakeRequest['status'],
  error?: string | null,
) => RoomWakeRequest | null;

export interface EnsureTargetSessionResult {
  state: ChatState;
  target: RoutingTarget;
  error: string | null;
  wakeRequest: RoomWakeRequest | null;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
}

export type ExistingTargetSessionOutcome =
  | {
      kind: 'continue';
    }
  | {
      kind: 'retry';
      state: ChatState;
      target: RoutingTarget;
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

  return !providerModelSelectionsEqual(
    participantLease.modelSelection ?? null,
    assignment.execution.modelSelection === undefined
      ? participantLease.modelSelection ?? null
      : assignment.execution.modelSelection ?? null,
  );
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
  const lease = input.target.participantKind === 'cat'
    ? resolveParticipantLeaseAttachment(channel, input.target.participantId)
    : resolveOrchestratorLeaseAttachment(channel);

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

  return target.participantKind === 'cat'
    ? setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      { laneId },
      now,
    )
    : setChannelOrchestratorLease(
      state,
      channelId,
      { laneId },
      now,
    );
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
}> {
  const resumeOutcome = await resumeRuntimeSession({
    runtimeClient: input.runtimeClient,
    sessionId: input.sessionId,
    scope: 'target_session_revive',
  });
  const resumed = resumeOutcome.session;
  if (!resumed) {
    return {
      kind: 'failed',
      error: resumeOutcome.error,
    };
  }

  const leasePatch = buildResumedRuntimeSessionLeasePatch(resumed, input.now);
  const nextState = input.target.participantKind === 'cat'
    ? setChannelParticipantLease(
      input.state,
      input.channelId,
      input.target.participantId,
      leasePatch,
      input.now,
    )
    : setChannelOrchestratorLease(
      input.state,
      input.channelId,
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
    state,
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

  const channelState = requireChannel(state, channelId);
  const hasDirectCatExecutionTargetDrift = attachedTarget.participantKind === 'cat'
    && hasParticipantExecutionTargetDrift({
      participantLease: resolveParticipantLeaseAttachment(
        channelState,
        attachedTarget.participantId,
      ),
      assignment: resolvePrimaryParticipantExecutionAssignment(
        channelState,
        attachedTarget.participantId,
      ),
    });

  if (await shouldReviveExistingTargetSession({
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
      attachedTarget.participantKind === 'cat'
        ? { participantId: attachedTarget.participantId }
        : 'orchestrator',
      now,
    );
    return {
      kind: 'retry',
      state: resetState,
      target: { ...attachedTarget, sessionId: null },
    };
  }

  if (attachedTarget.participantKind === 'orchestrator') {
    const executionTarget = resolveOrchestratorExecutionTarget(state, channelState);
    const orchestratorLease = resolveOrchestratorLeaseAttachment(channelState);
    const shouldRestartDefaultChatSession = isProviderDefaultChatChannel(channelState)
      && (
        orchestratorLease?.provider !== executionTarget.provider
        || orchestratorLease?.instance !== executionTarget.instance
        || orchestratorLease?.model !== executionTarget.model
        || !providerModelSelectionsEqual(
          orchestratorLease?.modelSelection ?? null,
          executionTarget.modelSelection ?? null,
        )
      );

    if (shouldRestartDefaultChatSession) {
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
      const resetState = setChannelOrchestratorLease(
        state,
        channelId,
        {
          sessionId: null,
          status: 'not_started',
          lastError: null,
          provider: executionTarget.provider,
          instance: executionTarget.instance,
          model: executionTarget.model,
          modelSelection: executionTarget.modelSelection ?? null,
          startedAt: null,
          lastUsedAt: orchestratorLease?.lastUsedAt ?? null,
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
