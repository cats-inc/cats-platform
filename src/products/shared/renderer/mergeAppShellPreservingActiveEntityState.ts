import type {
  ChatChannelView,
  ParallelChatGroupMemberSummary,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';

export interface MergeableAppShellPayload {
  chat: {
    selectedChannelId: string;
    selectedChannel: ChatChannelView | null;
    parallelChatGroups: ParallelChatGroupSummary[];
  };
}

function normalizeActiveIds(activeSubscribedIds: Iterable<string>): Set<string> {
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

function mergeParallelChatGroups(
  currentGroups: ParallelChatGroupSummary[],
  nextGroups: ParallelChatGroupSummary[],
  activeIds: Set<string>,
): ParallelChatGroupSummary[] {
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

export function mergeAppShellPreservingActiveEntityState<
  TPayload extends MergeableAppShellPayload,
>(
  current: TPayload,
  next: TPayload,
  activeSubscribedIds: Iterable<string>,
): TPayload {
  const activeIds = normalizeActiveIds(activeSubscribedIds);
  if (activeIds.size === 0) {
    return next;
  }

  const preserveSelectedChannel =
    current.chat.selectedChannelId
    && activeIds.has(current.chat.selectedChannelId);

  return {
    ...next,
    chat: {
      ...next.chat,
      selectedChannelId: preserveSelectedChannel
        ? current.chat.selectedChannelId
        : next.chat.selectedChannelId,
      selectedChannel: preserveSelectedChannel
        ? current.chat.selectedChannel
        : next.chat.selectedChannel,
      parallelChatGroups: mergeParallelChatGroups(
        current.chat.parallelChatGroups,
        next.chat.parallelChatGroups,
        activeIds,
      ),
    },
  };
}
