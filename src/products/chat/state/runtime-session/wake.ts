import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingState,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeTrigger,
} from '../../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  requireChannel,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { createRecordedWakeRequest } from '../room-routing/wake.js';
import {
  ensureChannelMarkedActive,
  toParticipantRef,
} from './state.js';
import {
  readInvocationContextMetadataString,
  resolveTargetLeaseAttachment,
  type RuntimeSessionRoutingOptions,
} from './shared.js';
import {
  resolveChannelTaskExecutionRequest,
  type ChannelTaskExecutionContext,
} from './taskExecution.js';
import {
  resolveExistingTargetSessionOutcome,
  type EnsureTargetSessionResult,
  type ExistingTargetSessionOutcome,
} from './sessionReuse.js';
import { startAttachedTargetSession } from './sessionLaunch.js';

function readDispatchContextMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

type EnsureTargetSessionTaskExecutionContext =
  ChannelTaskExecutionContext | undefined;

type EnsureTargetSessionOptions = RuntimeSessionRoutingOptions & {
  roomRouting?: RoomRoutingState | null;
  wakeTrigger?: RoomWakeTrigger;
  wakeReason?: RoomWakeReason;
  sourceMessageId?: string | null;
  ignoreLeaseSessionAttachment?: boolean;
  resolvedTaskExecutionContext?: EnsureTargetSessionTaskExecutionContext | null;
};

type EnsureTargetWakeRecorder = (
  status: RoomWakeRequest['status'],
  error?: string | null,
) => RoomWakeRequest | null;

interface PreparedTargetSessionWake {
  attachedTarget: RoutingTarget;
  targetStateId: string | null;
  laneId: string | null;
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext;
  recordTargetWake: EnsureTargetWakeRecorder;
}

async function prepareTargetSessionWake(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  nowIso: string;
  options: EnsureTargetSessionOptions;
  wakeTrigger: RoomWakeTrigger;
  wakeReason: RoomWakeReason;
  sourceMessageId: string | null;
}): Promise<PreparedTargetSessionWake> {
  const targetStateId = readDispatchContextMetadataString(
    input.options.dispatchContextMetadata,
    'targetStateId',
  );
  const laneId = readDispatchContextMetadataString(
    input.options.dispatchContextMetadata,
    'laneId',
  ) ?? (input.target.laneId?.trim() || null);
  const targetAttachment = resolveTargetLeaseAttachment(
    input.state,
    input.channelId,
    input.target,
    {
      preferredLaneId: laneId,
      allowLeaseSessionReuse: input.options.ignoreLeaseSessionAttachment !== true,
    },
  );
  const attachedTarget: RoutingTarget = {
    ...input.target,
    ...targetAttachment,
    laneId: targetAttachment.laneId,
  };
  const participant = toParticipantRef(attachedTarget);
  const taskExecutionContext = input.options.resolvedTaskExecutionContext !== undefined
    ? input.options.resolvedTaskExecutionContext
    : await resolveChannelTaskExecutionRequest(
      input.options.chatStore,
      input.channelId,
      attachedTarget,
    );

  return {
    attachedTarget,
    targetStateId,
    laneId,
    taskExecutionContext: taskExecutionContext ?? undefined,
    recordTargetWake: (
      status: RoomWakeRequest['status'],
      error: string | null = null,
    ) => createRecordedWakeRequest(
      input.options.roomRouting,
      participant,
      input.wakeTrigger,
      input.wakeReason,
      input.sourceMessageId,
      input.nowIso,
      status,
      error,
    ),
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
    options,
    wakeTrigger,
    wakeReason,
    sourceMessageId,
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
    forceReviveClosedSessions: options.forceReviveClosedSessions ?? false,
    routingOptions: {
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      chatStore: options.chatStore,
    },
  });
  if (existingSessionOutcome.kind === 'retry') {
    return ensureTargetSession(
      existingSessionOutcome.state,
      channelId,
      existingSessionOutcome.target,
      runtimeClient,
      now,
      {
        ...options,
        resolvedTaskExecutionContext: preparedWake.taskExecutionContext ?? null,
      },
    );
  }
  if (existingSessionOutcome.kind === 'resolved') {
    return existingSessionOutcome.result;
  }

  return startAttachedTargetSession(
    {
      state,
      channelId,
      attachedTarget: preparedWake.attachedTarget,
      runtimeClient,
      now,
      targetStateId: preparedWake.targetStateId,
      laneId: preparedWake.laneId,
      recordTargetWake: preparedWake.recordTargetWake,
      taskExecutionContext: preparedWake.taskExecutionContext,
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
