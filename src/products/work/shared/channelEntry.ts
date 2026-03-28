import type { AppShellPayload } from '../api/contracts.js';
import type { RoomRoutingState } from '../../../shared/roomRouting.js';
import { isDirectLaneChannel } from './channelTopology.js';
import { resolveRoomRoutingState } from '../../chat/state/room-routing/index.js';
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
    && selectedChannel.roomRouting.leadParticipantId
  ) {
    const leadCat = selectedChannel.assignedCats.find(
      (cat) =>
        cat.status === 'active'
        && cat.catId === selectedChannel.roomRouting.leadParticipantId,
    );
    if (!leadCat) {
      return null;
    }
    return resolveChatLifecycleState(leadCat?.execution.lease.status);
  }

  return resolveChatLifecycleState(selectedChannel.orchestratorLease.status);
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

  return input.entryLifecycleState === 'sleeping'
    || input.entryLifecycleState === 'error';
}
