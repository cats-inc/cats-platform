import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingState,
  RoomWakeReason,
  RoomWakeTrigger,
} from '../../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  requireChannel,
  setChannelParticipantLease,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { describeProviderSessionUnavailableError } from '../runtime-dispatch/recovery.js';
import { appendProviderSessionRotationMessage } from './sessionContinuity.js';
import {
  ensureChannelMarkedActive,
} from './state.js';
import {
  readInvocationContextMetadataString,
  type RuntimeSessionRoutingOptions,
} from './shared.js';
import type { ChannelTaskExecutionContext } from './taskExecution.js';
import {
  resolveExistingTargetSessionOutcome,
  type EnsureTargetSessionResult,
  type ExistingTargetSessionOutcome,
  type ProviderSessionRotation,
} from './sessionReuse.js';
import { startAttachedTargetSession } from './sessionLaunch.js';
import {
  prepareTargetSessionWake,
} from './sessionWakePreparation.js';

type EnsureTargetSessionTaskExecutionContext =
  ChannelTaskExecutionContext | undefined;

type EnsureTargetSessionOptions = RuntimeSessionRoutingOptions & {
  roomRouting?: RoomRoutingState | null;
  wakeTrigger?: RoomWakeTrigger;
  wakeReason?: RoomWakeReason;
  sourceMessageId?: string | null;
  ignoreLeaseSessionAttachment?: boolean;
  resolvedTaskExecutionContext?: EnsureTargetSessionTaskExecutionContext | null;
  /**
   * The workspace a replacement session must keep: the previous session's cwd
   * when its provider session is gone (ADR-068 §2). Overrides the channel's
   * spawn cwd for a newly created session only.
   */
  replacementSpawnCwd?: string | null;
};

const REPLACEMENT_START_FAILURE = ' A replacement session could not be started:';

/**
 * ADR-068 §2: a rotation counts only once its replacement exists. Then the
 * notice names the replacement and the result reports the rotation. If the
 * replacement could not be created, the lease goes back to the old session
 * with the unavailable-provider error and its cwd, so the next attempt rotates
 * into the same workspace instead of a default one.
 */
function commitProviderSessionRotation(
  retried: EnsureTargetSessionResult,
  input: {
    channelId: string;
    target: RoutingTarget;
    rotation: ProviderSessionRotation;
    now: Date;
  },
): EnsureTargetSessionResult {
  const { rotation } = input;
  const replacementSessionId = retried.target.sessionId?.trim() || null;
  if (retried.error || !replacementSessionId) {
    // A lease that already failed a replacement carries that suffix; keep one.
    const cause = rotation.error.split(REPLACEMENT_START_FAILURE)[0]!.trim();
    const error = describeProviderSessionUnavailableError(
      `${cause}${REPLACEMENT_START_FAILURE} ${retried.error ?? 'no session was created.'}`,
    );
    return {
      ...retried,
      state: setChannelParticipantLease(
        retried.state,
        input.channelId,
        input.target.participantId,
        {
          sessionId: rotation.previousSessionId,
          cwd: rotation.previousCwd,
          status: 'error',
          lastError: error,
          lastUsedAt: input.now.toISOString(),
        },
        input.now,
      ),
      target: { ...retried.target, sessionId: rotation.previousSessionId },
      error,
    };
  }
  return {
    ...retried,
    state: appendProviderSessionRotationMessage(retried.state, input.channelId, {
      target: retried.target,
      previousSessionId: rotation.previousSessionId,
      replacementSessionId,
      laneId: retried.target.laneId ?? null,
      now: input.now,
    }),
    rotatedProviderSession: true,
  };
}

export async function ensureTargetSession(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
  options: EnsureTargetSessionOptions = {},
): Promise<EnsureTargetSessionResult> {
  const nowIso = now.toISOString();
  const wakeTrigger = options.wakeTrigger ?? 'route_target';
  const wakeReason = options.wakeReason ?? 'room_default';
  const sourceMessageId = options.sourceMessageId ?? null;
  const preparedWake = await prepareTargetSessionWake({
    state,
    channelId,
    target,
    nowIso,
    roomRouting: options.roomRouting,
    wakeTrigger,
    wakeReason,
    sourceMessageId,
    dispatchContextMetadata: options.dispatchContextMetadata,
    ignoreLeaseSessionAttachment: options.ignoreLeaseSessionAttachment,
    resolvedTaskExecutionContext: options.resolvedTaskExecutionContext,
    chatStore: options.chatStore,
  });
  const existingSessionOutcome = await resolveExistingTargetSessionOutcome({
    state,
    channelId,
    attachedTarget: preparedWake.attachedTarget,
    runtimeClient,
    now,
    laneId: preparedWake.laneId,
    recordTargetWake: preparedWake.recordTargetWake,
    taskExecutionContext: preparedWake.taskExecutionContext,
    observeRuntimeForRevive: options.observeRuntimeForRevive ?? false,
    routingOptions: {
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      chatStore: options.chatStore,
    },
  });
  if (existingSessionOutcome.kind === 'retry') {
    const rotation = existingSessionOutcome.providerSessionRotation;
    const retried = await ensureTargetSession(
      existingSessionOutcome.state,
      channelId,
      existingSessionOutcome.target,
      runtimeClient,
      now,
      {
        ...options,
        resolvedTaskExecutionContext: preparedWake.taskExecutionContext ?? null,
        ...(rotation?.previousCwd ? { replacementSpawnCwd: rotation.previousCwd } : {}),
      },
    );
    return rotation
      ? commitProviderSessionRotation(retried, {
          channelId,
          target: existingSessionOutcome.target,
          rotation,
          now,
        })
      : retried;
  }
  if (existingSessionOutcome.kind === 'resolved') {
    return existingSessionOutcome.result;
  }

  return startAttachedTargetSession(
    {
      state,
      channelId,
      attachedTarget: preparedWake.attachedTarget,
      sourceMessageId,
      runtimeClient,
      now,
      targetStateId: preparedWake.targetStateId,
      laneId: preparedWake.laneId,
      recordTargetWake: preparedWake.recordTargetWake,
      taskExecutionContext: preparedWake.taskExecutionContext,
      replacementSpawnCwd: options.replacementSpawnCwd ?? null,
      routingOptions: {
        transport: options.transport,
        transportBindingId: options.transportBindingId,
        companionStore: options.companionStore,
        runtimeDataDir: options.runtimeDataDir,
        dispatchContextMetadata: options.dispatchContextMetadata,
      },
    },
  );
}
