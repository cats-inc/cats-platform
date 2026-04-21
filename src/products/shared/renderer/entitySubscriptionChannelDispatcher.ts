import type {
  AppShellPayload,
  ChatChannelSummary,
  ChatChannelView,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';
import type {
  EntitySubscriptionPatch,
  EntitySubscriptionSnapshot,
} from './entitySubscriptionHub.js';
import {
  mergeChannelSummaryWithChannelView,
  mergeParallelChatGroupsPreservingSubscribedMembership,
} from './activeEntityMerge.js';

export interface ChannelSubscriptionState {
  selectedChannelId: string;
  selectedChannel: ChatChannelView;
  parallelChatGroups: ParallelChatGroupSummary[];
}

export interface ChannelSubscriptionPatch {
  kind: string;
  state?: ChannelSubscriptionState;
}

export interface ChannelSubscriptionPayloadLike {
  chat: {
    selectedChannelId: string;
    selectedChannel: unknown;
    channels?: ChatChannelSummary[];
    parallelChatGroups: ParallelChatGroupSummary[];
  };
}

export type ChannelSubscriptionLoadState<TPayload extends ChannelSubscriptionPayloadLike> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

function removeSubscribedChannelFromGroup(
  group: ParallelChatGroupSummary,
  channelId: string,
): ParallelChatGroupSummary {
  const memberChannelIds = group.memberChannelIds.filter((memberChannelId) =>
    memberChannelId !== channelId);
  return {
    ...group,
    memberChannelIds,
    members: group.members.filter((member) => member.channelId !== channelId),
    memberCount: memberChannelIds.length,
  };
}

function mergeSubscribedParallelGroups(
  currentGroups: ParallelChatGroupSummary[],
  subscriptionState: ChannelSubscriptionState,
): ParallelChatGroupSummary[] {
  const channelId = subscriptionState.selectedChannel.id;
  const subscriptionGroupsById = new Map(
    subscriptionState.parallelChatGroups.map((group) => [group.id, group]),
  );
  const emittedSubscriptionGroups = new Set<string>();
  const subscriptionOwnedGroups: ParallelChatGroupSummary[] = currentGroups
    .flatMap((group) => {
      const subscriptionGroup = subscriptionGroupsById.get(group.id);
      if (subscriptionGroup) {
        emittedSubscriptionGroups.add(group.id);
        return [subscriptionGroup];
      }

      return group.memberChannelIds.includes(channelId)
        ? [removeSubscribedChannelFromGroup(group, channelId)]
        : [];
    });

  for (const subscriptionGroup of subscriptionState.parallelChatGroups) {
    if (!emittedSubscriptionGroups.has(subscriptionGroup.id)) {
      subscriptionOwnedGroups.push(subscriptionGroup);
    }
  }

  return mergeParallelChatGroupsPreservingSubscribedMembership(
    subscriptionOwnedGroups,
    currentGroups,
    [channelId],
  );
}

function mergeSubscribedChannelSummaries(
  currentChannels: ChatChannelSummary[] | undefined,
  subscriptionState: ChannelSubscriptionState,
): ChatChannelSummary[] | undefined {
  if (!currentChannels) {
    return currentChannels;
  }

  const channelId = subscriptionState.selectedChannel.id;
  let replaced = false;
  const result = currentChannels.map((channel) => {
    if (channel.id !== channelId) {
      return channel;
    }
    replaced = true;
    return mergeChannelSummaryWithChannelView(channel, subscriptionState.selectedChannel);
  });

  return replaced
    ? result
    : [
        mergeChannelSummaryWithChannelView(undefined, subscriptionState.selectedChannel),
        ...result,
      ];
}

function isCurrentSubscriptionState(
  payload: ChannelSubscriptionPayloadLike,
  subscriptionState: ChannelSubscriptionState,
): boolean {
  return payload.chat.selectedChannelId === subscriptionState.selectedChannelId
    && subscriptionState.selectedChannel.id === subscriptionState.selectedChannelId;
}

export function applyChannelSubscriptionStateToPayload<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  payload: TPayload,
  subscriptionState: ChannelSubscriptionState,
): TPayload {
  if (!isCurrentSubscriptionState(payload, subscriptionState)) {
    return payload;
  }

  const channels = mergeSubscribedChannelSummaries(
    payload.chat.channels,
    subscriptionState,
  );

  return {
    ...payload,
    chat: {
      ...payload.chat,
      selectedChannelId: subscriptionState.selectedChannelId,
      selectedChannel: subscriptionState.selectedChannel,
      ...(channels ? { channels } : {}),
      parallelChatGroups: mergeSubscribedParallelGroups(
        payload.chat.parallelChatGroups,
        subscriptionState,
      ),
    },
  } as TPayload;
}

export function applyChannelSubscriptionPatchToPayload<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  payload: TPayload,
  patch: ChannelSubscriptionPatch,
): TPayload {
  return patch.state
    ? applyChannelSubscriptionStateToPayload(payload, patch.state)
    : payload;
}

export function applyChannelSubscriptionStateToLoadState<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  current: ChannelSubscriptionLoadState<TPayload>,
  subscriptionState: ChannelSubscriptionState,
): ChannelSubscriptionLoadState<TPayload> {
  if (current.status !== 'ready') {
    return current;
  }

  return {
    status: 'ready',
    payload: applyChannelSubscriptionStateToPayload(
      current.payload,
      subscriptionState,
    ),
  };
}

export function applyChannelSubscriptionSnapshotToLoadState<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  current: ChannelSubscriptionLoadState<TPayload>,
  snapshot: EntitySubscriptionSnapshot<ChannelSubscriptionState>,
): ChannelSubscriptionLoadState<TPayload> {
  return applyChannelSubscriptionStateToLoadState(current, snapshot.state);
}

export function applyChannelSubscriptionPatchToLoadState<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  current: ChannelSubscriptionLoadState<TPayload>,
  patch: EntitySubscriptionPatch<ChannelSubscriptionPatch>,
): ChannelSubscriptionLoadState<TPayload> {
  if (current.status !== 'ready') {
    return current;
  }

  return {
    status: 'ready',
    payload: applyChannelSubscriptionPatchToPayload(current.payload, patch.patch),
  };
}
