import type { ChatState } from '../../api/contracts.js';
import type {
  RoomRoutingState,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeTrigger,
} from '../../../../shared/roomRouting.js';
import {
  createRecordedWakeRequest,
} from '../room-routing/wake.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { toParticipantRef } from './state.js';
import { resolveTargetLeaseAttachment } from './shared.js';
import {
  resolveChannelTaskExecutionRequest,
  type ChannelTaskExecutionContext,
} from './taskExecution.js';

type EnsureTargetWakeRecorder = (
  status: RoomWakeRequest['status'],
  error?: string | null,
) => RoomWakeRequest | null;

export interface PreparedTargetSessionWake {
  attachedTarget: RoutingTarget;
  targetStateId: string | null;
  laneId: string | null;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  recordTargetWake: EnsureTargetWakeRecorder;
}

function readDispatchContextMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function prepareTargetSessionWake(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  nowIso: string;
  roomRouting?: RoomRoutingState | null;
  wakeTrigger: RoomWakeTrigger;
  wakeReason: RoomWakeReason;
  sourceMessageId: string | null;
  dispatchContextMetadata?: Record<string, unknown>;
  ignoreLeaseSessionAttachment?: boolean;
  resolvedTaskExecutionContext?: ChannelTaskExecutionContext | null;
  chatStore: Parameters<typeof resolveChannelTaskExecutionRequest>[0];
}): Promise<PreparedTargetSessionWake> {
  const targetStateId = readDispatchContextMetadataString(
    input.dispatchContextMetadata,
    'targetStateId',
  );
  const laneId = readDispatchContextMetadataString(
    input.dispatchContextMetadata,
    'laneId',
  ) ?? (input.target.laneId?.trim() || null);
  const targetAttachment = resolveTargetLeaseAttachment(
    input.state,
    input.channelId,
    input.target,
    {
      preferredLaneId: laneId,
      allowLeaseSessionReuse: input.ignoreLeaseSessionAttachment !== true,
    },
  );
  const attachedTarget: RoutingTarget = {
    ...input.target,
    ...targetAttachment,
    laneId: targetAttachment.laneId,
  };
  const participant = toParticipantRef(attachedTarget);
  const taskExecutionContext = input.resolvedTaskExecutionContext !== undefined
    ? input.resolvedTaskExecutionContext
    : await resolveChannelTaskExecutionRequest(
      input.chatStore,
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
      input.roomRouting,
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
