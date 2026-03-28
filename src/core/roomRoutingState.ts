import type {
  RoomRoutingMode,
  RoomRoutingState,
  RoomWorkflowState,
} from '../shared/roomRouting.js';

export const DEFAULT_MAX_ROUTING_CONTINUATIONS = 6;
export const DEFAULT_MAX_ROUTING_DISPATCHES = 12;
export const DEFAULT_MAX_ROUTING_TARGET_VISITS = 2;
export const DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT = 12;
export const DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT = 64;
export const DEFAULT_WAKE_HISTORY_LIMIT = 24;

export function createDefaultRoomWorkflowState(): RoomWorkflowState {
  return {
    activeTurn: null,
    turnHistory: [],
    eventHistory: [],
    lastCheckpointEvent: null,
    lastOutcomeEvent: null,
  };
}

export function createDefaultRoomRoutingState(
  overrides: {
    mode?: RoomRoutingMode;
    leadParticipantId?: string | null;
  } = {},
): RoomRoutingState {
  return {
    mode: overrides.mode ?? 'boss_chat',
    leadParticipantId: overrides.leadParticipantId ?? null,
    maxContinuations: DEFAULT_MAX_ROUTING_CONTINUATIONS,
    maxDispatchesPerTurn: DEFAULT_MAX_ROUTING_DISPATCHES,
    maxTargetVisitsPerTurn: DEFAULT_MAX_ROUTING_TARGET_VISITS,
    lastOutcome: null,
    lastCheckpoint: null,
    lastWakeRequest: null,
    wakeHistory: [],
    workflow: createDefaultRoomWorkflowState(),
  };
}

export function resolveRoomRoutingState(
  roomRouting: RoomRoutingState | null | undefined,
): RoomRoutingState {
  return roomRouting ? structuredClone(roomRouting) : createDefaultRoomRoutingState();
}

export function resolveRoomWorkflowState(
  workflow: RoomWorkflowState | null | undefined,
): RoomWorkflowState {
  return workflow ? structuredClone(workflow) : createDefaultRoomWorkflowState();
}
