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
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
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
};

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
      sourceMessageId,
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
