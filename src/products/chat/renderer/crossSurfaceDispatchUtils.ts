import type { AppShellPayload } from '../api/contracts.js';

type ParallelGroupSummaryLike = Pick<
  AppShellPayload['chat']['parallelChatGroups'][number],
  'id' | 'memberChannelIds'
>;

export function resolveCrossSurfaceParallelGroupHandoffId(input: {
  dispatchRequest: {
    groupId: string;
    channelId: string;
  } | null;
  createdGroups: ReadonlyArray<ParallelGroupSummaryLike>;
  dispatchGroups: ReadonlyArray<ParallelGroupSummaryLike>;
  fallbackChannelId?: string | null;
}): string {
  if (input.dispatchRequest?.groupId?.trim()) {
    return input.dispatchRequest.groupId;
  }

  const activeChannelId = input.dispatchRequest?.channelId ?? input.fallbackChannelId ?? null;
  if (!activeChannelId) {
    return '';
  }

  return input.dispatchGroups.find((group) => group.memberChannelIds.includes(activeChannelId))?.id
    ?? input.createdGroups.find((group) => group.memberChannelIds.includes(activeChannelId))?.id
    ?? '';
}
