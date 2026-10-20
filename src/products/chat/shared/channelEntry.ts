import type { AppShellPayload } from '../api/contracts.js';
import type { RoomRoutingState } from '../../../shared/roomRouting.js';
import { isDirectLaneChannel } from './channelTopology.js';
import {
  activeAssignedParticipants,
  findAssignedParticipant,
  resolveResolvedParticipantExecutionStatus,
} from './channelParticipants.js';
import { resolveRoomRoutingState } from '../../../core/roomRoutingState.js';
import {
  resolveChatLifecycleState,
  type ChatLifecycleState,
} from './lifecycle.js';

export type SelectedChannelView = Omit<
  NonNullable<AppShellPayload['chat']['selectedChannel']>,
  'roomRouting'
> & {
  roomRouting: RoomRoutingState;
};

export function normalizeSelectedChannelView(
  selectedChannel: AppShellPayload['chat']['selectedChannel'],
): SelectedChannelView | null {
  if (!selectedChannel) {
    return null;
  }

  return {
    ...selectedChannel,
    roomRouting: resolveRoomRoutingState(selectedChannel.roomRouting),
  };
}

export function resolveSelectedChannelEntryLifecycle(
  selectedChannel: SelectedChannelView | null,
): ChatLifecycleState | null {
  if (!selectedChannel) {
    return null;
  }

  if (
    isDirectLaneChannel(selectedChannel)
    && selectedChannel.roomRouting.defaultRecipientId
  ) {
    const leadCat = findAssignedParticipant(
      selectedChannel,
      selectedChannel.roomRouting.defaultRecipientId,
    );
    if (!leadCat) {
      return null;
    }
    return resolveChatLifecycleState(resolveResolvedParticipantExecutionStatus(leadCat));
  }

  // A room's lifecycle follows its coordinator, or its first participant without one.
  const coordinator = (selectedChannel.coordinatorParticipantId
    ? findAssignedParticipant(selectedChannel, selectedChannel.coordinatorParticipantId)
    : null) ?? activeAssignedParticipants(selectedChannel)[0] ?? null;
  return resolveChatLifecycleState(
    coordinator ? resolveResolvedParticipantExecutionStatus(coordinator) : 'not_started',
  );
}

export function shouldWakeRouteChannelOnEntry(input: {
  routeChannelId: string | null;
  routeChannelExists: boolean;
  selectedChannelId: string | null;
  selectedChannelViewId: string | null;
  entryLifecycleState: ChatLifecycleState | null;
}): boolean {
  if (!input.routeChannelId || !input.routeChannelExists) {
    return false;
  }

  if (
    input.selectedChannelId !== input.routeChannelId
    || input.selectedChannelViewId !== input.routeChannelId
  ) {
    return true;
  }

  return false;
}
