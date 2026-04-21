import type {
  AppShellPayload,
  ChatChannelSummary,
  ChatChannelView,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';
import { resolveRoomRoutingState } from '../../../core/roomRoutingState.js';
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
    channels?: ChatChannelSummary[];
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

function resolveSubscribedChannelRoutingStatus(
  selectedChannel: ChatChannelView,
): ChatChannelSummary['routingStatus'] {
  const roomRouting = resolveRoomRoutingState(selectedChannel.roomRouting);
  const workflowStatus = roomRouting.workflow.activeTurn?.status
    ?? roomRouting.workflow.lastOutcomeEvent?.status
    ?? null;
  switch (workflowStatus) {
    case 'pending':
      return 'running';
    case 'failed':
      return 'error';
    case 'idle':
    case 'running':
    case 'completed':
    case 'blocked':
      return workflowStatus;
    default:
      return roomRouting.lastOutcome?.status ?? 'idle';
  }
}

function resolveSubscribedChannelLastRoutingAt(selectedChannel: ChatChannelView): string | null {
  const roomRouting = resolveRoomRoutingState(selectedChannel.roomRouting);
  return roomRouting.workflow.activeTurn?.updatedAt
    ?? roomRouting.workflow.lastOutcomeEvent?.createdAt
    ?? roomRouting.lastOutcome?.completedAt
    ?? roomRouting.lastCheckpoint?.createdAt
    ?? null;
}

function fallbackSubscribedChannelSummary(
  selectedChannel: ChatChannelView,
): ChatChannelSummary {
  const roomRouting = resolveRoomRoutingState(selectedChannel.roomRouting);
  const assignedCats = selectedChannel.assignedCats ?? [];
  const assignedCatCount = assignedCats.length;
  const activeAssignedCatCount = assignedCats.filter((cat) =>
    cat.status === 'active').length;
  const defaultRecipientCat = roomRouting.defaultRecipientId
    ? assignedCats.find((cat) => cat.catId === roomRouting.defaultRecipientId)
    : null;

  return {
    id: selectedChannel.id,
    title: selectedChannel.title,
    topic: selectedChannel.topic,
    originSurface: selectedChannel.originSurface ?? 'chat',
    channelKind: selectedChannel.channelKind,
    status: selectedChannel.status,
    unreadCount: selectedChannel.unreadCount,
    catCount: assignedCatCount,
    activeCatCount: activeAssignedCatCount,
    participantCount: assignedCatCount,
    activeParticipantCount: activeAssignedCatCount,
    repoPath: selectedChannel.repoPath,
    chatCwd: selectedChannel.chatCwd,
    runtimeWorkspaceKind: selectedChannel.runtimeWorkspaceKind ?? null,
    runtimeWorkspaceAccess: selectedChannel.runtimeWorkspaceAccess ?? null,
    runtimePermissionMode: selectedChannel.runtimePermissionMode ?? null,
    lastMessageAt: selectedChannel.lastMessageAt,
    lastActivatedAt: selectedChannel.lastActivatedAt,
    composerMode: selectedChannel.composerMode,
    pendingProvider: selectedChannel.pendingProvider,
    pendingModel: selectedChannel.pendingModel,
    pendingModelSelection: selectedChannel.pendingModelSelection ?? null,
    defaultRecipientCatId: defaultRecipientCat?.catId ?? null,
    defaultRecipientLeaseStatus: defaultRecipientCat?.execution.lease.status ?? null,
    roomMode: roomRouting.mode,
    routingStatus: resolveSubscribedChannelRoutingStatus(selectedChannel),
    lastRoutingAt: resolveSubscribedChannelLastRoutingAt(selectedChannel),
  };
}

export function mergeChannelSummaryWithChannelView(
  currentSummary: ChatChannelSummary | undefined,
  selectedChannel: ChatChannelView,
): ChatChannelSummary {
  const fallbackSummary = fallbackSubscribedChannelSummary(selectedChannel);
  return {
    ...fallbackSummary,
    ...currentSummary,
    id: selectedChannel.id,
    title: selectedChannel.title,
    topic: selectedChannel.topic,
    originSurface: selectedChannel.originSurface ?? currentSummary?.originSurface ?? 'chat',
    channelKind: selectedChannel.channelKind ?? currentSummary?.channelKind,
    status: selectedChannel.status,
    unreadCount: selectedChannel.unreadCount,
    repoPath: selectedChannel.repoPath,
    chatCwd: selectedChannel.chatCwd,
    runtimeWorkspaceKind: selectedChannel.runtimeWorkspaceKind ?? null,
    runtimeWorkspaceAccess: selectedChannel.runtimeWorkspaceAccess ?? null,
    runtimePermissionMode: selectedChannel.runtimePermissionMode ?? null,
    lastMessageAt: selectedChannel.lastMessageAt,
    lastActivatedAt: selectedChannel.lastActivatedAt,
    composerMode: selectedChannel.composerMode,
    pendingProvider: selectedChannel.pendingProvider,
    pendingModel: selectedChannel.pendingModel,
    pendingModelSelection: selectedChannel.pendingModelSelection ?? null,
    roomMode: resolveRoomRoutingState(selectedChannel.roomRouting).mode,
    routingStatus: resolveSubscribedChannelRoutingStatus(selectedChannel),
    lastRoutingAt: resolveSubscribedChannelLastRoutingAt(selectedChannel),
  };
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

export function applyChannelSubscriptionStateToPayload<
  TPayload extends ChannelSubscriptionPayloadLike = AppShellPayload,
>(
  payload: TPayload,
  subscriptionState: ChannelSubscriptionState,
): TPayload {
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
