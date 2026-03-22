import type { AppShellPayload, RoomRoutingState } from '../../../shared/app-shell.js';
import { resolveRoomRoutingState } from '../state/roomRouting.js';
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
    selectedChannel.roomRouting.mode === 'direct_cat_chat'
    && selectedChannel.roomRouting.leadParticipantId
  ) {
    const leadCat = selectedChannel.assignedCats.find(
      (cat) =>
        cat.status === 'active'
        && cat.catId === selectedChannel.roomRouting.leadParticipantId,
    );
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

  return input.entryLifecycleState === 'sleeping';
}
