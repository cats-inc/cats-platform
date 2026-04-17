import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomWakeRequest,
} from '../../../../shared/roomRouting.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
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
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import { clearTargetSessionLease } from './state.js';
import type { RuntimeSessionRoutingOptions } from './shared.js';
import type { ChannelTaskExecutionContext } from './taskExecution.js';

const MANUALLY_REVIVABLE_SESSION_STATES = new Set([
  'closed',
  'closing',
  'terminated',
  'terminated_with_error',
  'error',
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
  forceReviveClosedSessions: boolean;
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
    input.forceReviveClosedSessions
    && lease.status === 'error'
    && typeof lease.lastError === 'string'
    && classifyRuntimeDispatchRecoveryError(lease.lastError)?.reason === 'stale_session'
  ) {
    return true;
  }

  if (!input.forceReviveClosedSessions) {
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

export async function resolveExistingTargetSessionOutcome(input: {
  state: ChatState;
  channelId: string;
  attachedTarget: RoutingTarget;
  runtimeClient: RuntimeClient;
  now: Date;
  laneId: string | null;
  recordTargetWake: EnsureTargetWakeRecorder;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  forceReviveClosedSessions: boolean;
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
    forceReviveClosedSessions,
    routingOptions,
  } = input;

  if (!attachedTarget.sessionId) {
    return { kind: 'continue' };
  }

  if (await shouldReviveExistingTargetSession({
    state,
    channelId,
    target: attachedTarget,
    sessionId: attachedTarget.sessionId,
    runtimeClient,
    forceReviveClosedSessions,
  })) {
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
    const channelState = requireChannel(state, channelId);
    const executionTarget = resolveOrchestratorExecutionTarget(state, channelState);
    const orchestratorLease = resolveOrchestratorLeaseAttachment(channelState);
    const shouldRestartSoloSession = channelState.composerMode === 'solo'
      && (
        orchestratorLease?.provider !== executionTarget.provider
        || (channelState.orchestratorLease.instance ?? null) !== executionTarget.instance
        || orchestratorLease?.model !== executionTarget.model
      );

    if (shouldRestartSoloSession) {
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
