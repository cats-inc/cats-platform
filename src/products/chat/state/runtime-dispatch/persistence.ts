import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingState,
  RoomWorkflowState,
} from '../../../../shared/roomRouting.js';
import type {
  ChatStore,
} from '../store.js';
import {
  applyRoomRoutingSnapshot,
} from '../runtime-session/state.js';

export function materializeInFlightDispatchState(
  state: ChatState,
  channelId: string,
  baseRoomRouting: RoomRoutingState,
  workflow: RoomWorkflowState,
  outcome: RoomRoutingOutcome,
  checkpoint: RoomRoutingCheckpoint | null,
  now: Date,
): ChatState {
  return applyRoomRoutingSnapshot(
    state,
    channelId,
    baseRoomRouting,
    workflow,
    outcome,
    checkpoint,
    now,
  );
}

export async function persistInFlightDispatchState(
  chatStore: Pick<ChatStore, 'write'> | undefined,
  state: ChatState,
): Promise<ChatState> {
  if (!chatStore) {
    return state;
  }

  return chatStore.write(state);
}
