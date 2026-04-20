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

  // Prefer the post-dispatch projection when available because it reflects the
  // latest selected/active member channel after the first turn was sent. Fall
  // back to the just-created groups only when the dispatch projection has not
  // materialized that membership yet.
  return input.dispatchGroups.find((group) => group.memberChannelIds.includes(activeChannelId))?.id
    ?? input.createdGroups.find((group) => group.memberChannelIds.includes(activeChannelId))?.id
    ?? '';
}
