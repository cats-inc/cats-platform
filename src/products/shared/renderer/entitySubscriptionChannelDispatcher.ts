import type {
  AppShellPayload,
  ChatChannelView,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';
import type {
  EntitySubscriptionPatch,
  EntitySubscriptionSnapshot,
} from './entitySubscriptionHub.js';

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
    parallelChatGroups: ParallelChatGroupSummary[];
  };
}

export type ChannelSubscriptionLoadState<TPayload extends ChannelSubscriptionPayloadLike> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

function mergeSubscribedParallelGroups(
  currentGroups: ParallelChatGroupSummary[],
  subscriptionState: ChannelSubscriptionState,
): ParallelChatGroupSummary[] {
  const channelId = subscriptionState.selectedChannel.id;
  const subscriptionGroupsById = new Map(
    subscriptionState.parallelChatGroups.map((group) => [group.id, group]),
  );
  const result: ParallelChatGroupSummary[] = [];
  const emittedGroupIds = new Set<string>();

  for (const group of currentGroups) {
    if (!group.memberChannelIds.includes(channelId)) {
      result.push(group);
      continue;
    }

    const replacement = subscriptionGroupsById.get(group.id);
    if (replacement) {
      result.push(replacement);
      emittedGroupIds.add(replacement.id);
    }
  }

  for (const group of subscriptionState.parallelChatGroups) {
    if (!emittedGroupIds.has(group.id)) {
      result.push(group);
    }
  }

  return result;
}

export function applyChannelSubscriptionStateToPayload<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  payload: TPayload,
  subscriptionState: ChannelSubscriptionState,
): TPayload {
  return {
    ...payload,
    chat: {
      ...payload.chat,
      selectedChannelId: subscriptionState.selectedChannelId,
      selectedChannel: subscriptionState.selectedChannel,
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
