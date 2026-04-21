import type {
  ChatChannelParticipant,
  ChatChannelSummary,
  ChatChannelView,
  ParallelChatGroupMemberSummary,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';
import { resolveRoomRoutingState } from '../../../core/roomRoutingState.js';

function normalizeActiveSubscribedIds(activeSubscribedIds: Iterable<string>): Set<string> {
  return new Set(
    [...activeSubscribedIds]
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

function insertAt<T>(values: T[], index: number, value: T): T[] {
  const next = [...values];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

function reconcileSubscribedGroupMembership(
  currentGroup: ParallelChatGroupSummary,
  nextGroup: ParallelChatGroupSummary,
  activeIds: Set<string>,
): ParallelChatGroupSummary {
  let memberChannelIds = [...nextGroup.memberChannelIds];
  let members: ParallelChatGroupMemberSummary[] = [...nextGroup.members];

  for (const subId of activeIds) {
    const currentHasSub = currentGroup.memberChannelIds.includes(subId);
    const nextHasSub = nextGroup.memberChannelIds.includes(subId);

    if (currentHasSub && !nextHasSub) {
      const currentIndex = currentGroup.memberChannelIds.indexOf(subId);
      memberChannelIds = insertAt(memberChannelIds, currentIndex, subId);
      const currentMember = currentGroup.members.find((member) => member.channelId === subId);
      if (currentMember && !members.some((member) => member.channelId === subId)) {
        members = insertAt(members, currentIndex, currentMember);
      }
      continue;
    }

    if (!currentHasSub && nextHasSub) {
      memberChannelIds = memberChannelIds.filter((channelId) => channelId !== subId);
      members = members.filter((member) => member.channelId !== subId);
    }
  }

  return {
    ...nextGroup,
    memberChannelIds,
    members,
    memberCount: memberChannelIds.length,
  };
}

export function mergeParallelChatGroupsPreservingSubscribedMembership(
  currentGroups: ParallelChatGroupSummary[],
  nextGroups: ParallelChatGroupSummary[],
  activeSubscribedIds: Iterable<string>,
): ParallelChatGroupSummary[] {
  const activeIds = normalizeActiveSubscribedIds(activeSubscribedIds);
  if (activeIds.size === 0) {
    return nextGroups;
  }

  const currentById = new Map(currentGroups.map((group) => [group.id, group]));
  const nextById = new Map(nextGroups.map((group) => [group.id, group]));
  const orderedIds = [
    ...nextGroups.map((group) => group.id),
    ...currentGroups
      .map((group) => group.id)
      .filter((id) => !nextById.has(id)),
  ];

  const result: ParallelChatGroupSummary[] = [];
  for (const groupId of orderedIds) {
    const currentGroup = currentById.get(groupId) ?? null;
    const nextGroup = nextById.get(groupId) ?? null;

    if (currentGroup && nextGroup) {
      result.push(reconcileSubscribedGroupMembership(currentGroup, nextGroup, activeIds));
      continue;
    }

    if (nextGroup) {
      result.push(nextGroup);
      continue;
    }

    if (
      currentGroup
      && currentGroup.memberChannelIds.some((channelId) => activeIds.has(channelId))
    ) {
      result.push(currentGroup);
    }
  }

  return result;
}

function resolveAssignedParticipants(selectedChannel: ChatChannelView): ChatChannelParticipant[] {
  const assignedParticipants = selectedChannel.assignedParticipants;
  return Array.isArray(assignedParticipants) && assignedParticipants.length > 0
    ? assignedParticipants
    : selectedChannel.assignedCats;
}

function resolveSelectedChannelSummaryCounts(selectedChannel: ChatChannelView): Pick<
  ChatChannelSummary,
  | 'participantCount'
  | 'activeParticipantCount'
  | 'catCount'
  | 'activeCatCount'
  | 'defaultRecipientCatId'
  | 'defaultRecipientLeaseStatus'
> {
  const roomRouting = resolveRoomRoutingState(selectedChannel.roomRouting);
  const participants = resolveAssignedParticipants(selectedChannel);
  const assignedCats = selectedChannel.assignedCats ?? [];
  const defaultRecipientCat = roomRouting.defaultRecipientId
    ? assignedCats.find((cat) => cat.catId === roomRouting.defaultRecipientId)
    : null;

  return {
    participantCount: participants.length,
    activeParticipantCount: participants.filter((participant) =>
      participant.status === 'active').length,
    catCount: assignedCats.length,
    activeCatCount: assignedCats.filter((cat) => cat.status === 'active').length,
    defaultRecipientCatId: defaultRecipientCat?.catId ?? null,
    defaultRecipientLeaseStatus: defaultRecipientCat?.execution.lease.status ?? null,
  };
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

export function mergeChannelSummaryWithChannelView(
  currentSummary: ChatChannelSummary | undefined,
  selectedChannel: ChatChannelView,
): ChatChannelSummary {
  const roomRouting = resolveRoomRoutingState(selectedChannel.roomRouting);
  const summaryCounts = resolveSelectedChannelSummaryCounts(selectedChannel);
  return {
    ...currentSummary,
    id: selectedChannel.id,
    title: selectedChannel.title,
    topic: selectedChannel.topic,
    originSurface: selectedChannel.originSurface ?? currentSummary?.originSurface,
    channelKind: selectedChannel.channelKind ?? currentSummary?.channelKind,
    status: selectedChannel.status,
    unreadCount: selectedChannel.unreadCount,
    ...summaryCounts,
    repoPath: selectedChannel.repoPath,
    chatCwd: selectedChannel.chatCwd,
    runtimeWorkspaceKind: selectedChannel.runtimeWorkspaceKind ?? null,
    runtimeWorkspaceAccess: selectedChannel.runtimeWorkspaceAccess ?? null,
    runtimePermissionMode: selectedChannel.runtimePermissionMode ?? null,
    lastMessageAt: selectedChannel.lastMessageAt,
    lastActivatedAt: selectedChannel.lastActivatedAt,
    composerMode: selectedChannel.composerMode ?? currentSummary?.composerMode,
    pendingProvider: selectedChannel.pendingProvider ?? currentSummary?.pendingProvider,
    pendingModel: selectedChannel.pendingModel ?? currentSummary?.pendingModel,
    pendingModelSelection:
      selectedChannel.pendingModelSelection
      ?? currentSummary?.pendingModelSelection
      ?? null,
    roomMode: roomRouting.mode,
    routingStatus: resolveSubscribedChannelRoutingStatus(selectedChannel),
    lastRoutingAt: resolveSubscribedChannelLastRoutingAt(selectedChannel),
  };
}

export function syncSubscribedChannelSummary(
  channels: ChatChannelSummary[],
  selectedChannel: ChatChannelView,
): ChatChannelSummary[] {
  const index = channels.findIndex((channel) => channel.id === selectedChannel.id);
  if (index === -1) {
    return channels;
  }
  const result = [...channels];
  result[index] = mergeChannelSummaryWithChannelView(channels[index], selectedChannel);
  return result;
}

export function mergeChannelSummariesPreservingSubscribedView(input: {
  currentChannels: ChatChannelSummary[];
  nextChannels: ChatChannelSummary[];
  currentSelectedChannel: ChatChannelView | null;
  activeSubscribedIds: Iterable<string>;
  insertMissingActive?: boolean;
}): ChatChannelSummary[] {
  const activeIds = normalizeActiveSubscribedIds(input.activeSubscribedIds);
  if (activeIds.size === 0) {
    return input.nextChannels;
  }

  const currentById = new Map(input.currentChannels.map((channel) => [channel.id, channel]));
  const nextIds = new Set(input.nextChannels.map((channel) => channel.id));
  const result = input.nextChannels.map((nextChannel) => {
    if (!activeIds.has(nextChannel.id)) {
      return nextChannel;
    }

    const currentChannel = currentById.get(nextChannel.id) ?? nextChannel;
    return input.currentSelectedChannel?.id === nextChannel.id
      ? mergeChannelSummaryWithChannelView(currentChannel, input.currentSelectedChannel)
      : currentChannel;
  });

  if (input.insertMissingActive === false) {
    return result;
  }

  for (const activeId of activeIds) {
    if (nextIds.has(activeId)) {
      continue;
    }
    const currentChannel = currentById.get(activeId);
    if (currentChannel) {
      result.unshift(currentChannel);
    }
  }

  return result;
}
