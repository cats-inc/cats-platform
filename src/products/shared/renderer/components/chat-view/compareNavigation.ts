import type { ParallelChatGroupSummary } from '../../../api/workspaceContracts.js';

type CompareMember = ParallelChatGroupSummary['members'][number];

export function resolveActiveCompareChannelId(
  compareMembers: readonly CompareMember[],
  routeChannelId: string | null | undefined,
  selectedChannelId: string,
): string {
  if (routeChannelId && compareMembers.some((member) => member.channelId === routeChannelId)) {
    return routeChannelId;
  }

  if (compareMembers.some((member) => member.channelId === selectedChannelId)) {
    return selectedChannelId;
  }

  return compareMembers[0]?.channelId ?? selectedChannelId;
}

export function resolveCompareNeighborChannelId(
  compareMembers: readonly CompareMember[],
  activeChannelId: string,
  direction: 'prev' | 'next',
): string | null {
  const activeIndex = compareMembers.findIndex((member) => member.channelId === activeChannelId);
  if (activeIndex < 0 || compareMembers.length < 2) {
    return null;
  }

  return direction === 'prev'
    ? compareMembers[(activeIndex - 1 + compareMembers.length) % compareMembers.length]?.channelId ?? null
    : compareMembers[(activeIndex + 1) % compareMembers.length]?.channelId ?? null;
}
