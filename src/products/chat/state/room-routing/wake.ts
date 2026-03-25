import { randomUUID } from 'node:crypto';

import type {
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomWorkflowState,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeTrigger,
} from '../../../../shared/roomRouting.js';
import { DEFAULT_WAKE_HISTORY_LIMIT } from './index.js';

export function createRoomRoutingSnapshot(
  baseRoomRouting: RoomRoutingState,
  workflow: RoomWorkflowState,
  outcome: RoomRoutingOutcome | null,
  checkpoint: RoomRoutingCheckpoint | null,
): RoomRoutingState {
  return {
    ...baseRoomRouting,
    lastOutcome: outcome ? structuredClone(outcome) : null,
    lastCheckpoint: checkpoint ? structuredClone(checkpoint) : null,
    workflow: structuredClone(workflow),
  };
}

export function resolveWakeReasonFromRoutingTrigger(
  trigger: RoomRoutingTrigger,
): RoomWakeReason {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_mention';
    case 'continuation_mention':
      return 'workflow_continuation';
    case 'room_default':
    default:
      return 'room_default';
  }
}

function pruneWakeHistory(roomRouting: RoomRoutingState): void {
  roomRouting.wakeHistory = roomRouting.wakeHistory.slice(0, DEFAULT_WAKE_HISTORY_LIMIT);
}

function recordWakeRequest(
  roomRouting: RoomRoutingState,
  wakeRequest: RoomWakeRequest,
): void {
  roomRouting.lastWakeRequest = structuredClone(wakeRequest);
  roomRouting.wakeHistory.unshift(structuredClone(wakeRequest));
  pruneWakeHistory(roomRouting);
}

function createWakeRequest(
  participant: RoomRoutingParticipantRef,
  trigger: RoomWakeTrigger,
  reason: RoomWakeReason,
  sourceMessageId: string | null,
  nowIso: string,
  status: RoomWakeRequest['status'],
  error: string | null = null,
): RoomWakeRequest {
  return {
    id: randomUUID(),
    participant,
    trigger,
    reason,
    sourceMessageId,
    status,
    createdAt: nowIso,
    completedAt: status === 'skipped' ? null : nowIso,
    error,
  };
}

export function createRecordedWakeRequest(
  roomRouting: RoomRoutingState | null | undefined,
  participant: RoomRoutingParticipantRef,
  trigger: RoomWakeTrigger,
  reason: RoomWakeReason,
  sourceMessageId: string | null,
  nowIso: string,
  status: RoomWakeRequest['status'],
  error: string | null = null,
): RoomWakeRequest | null {
  if (!roomRouting) {
    return null;
  }

  const wakeRequest = createWakeRequest(
    participant,
    trigger,
    reason,
    sourceMessageId,
    nowIso,
    status,
    error,
  );
  recordWakeRequest(roomRouting, wakeRequest);
  return wakeRequest;
}
