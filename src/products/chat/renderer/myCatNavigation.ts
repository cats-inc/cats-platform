import type { ChatChannelSummary } from '../../../shared/app-shell.js';
import { buildNewChatPath } from '../../../shared/channelPaths.js';

export type MyCatNavigationTarget =
  | { kind: 'existing_channel'; channelId: string }
  | { kind: 'draft_lane'; path: string };

export function resolveMyCatNavigationTarget(
  channels: ChatChannelSummary[],
  catId: string,
): MyCatNavigationTarget {
  const existing = channels.find((channel) => {
    const summary = channel as { leadCatId?: string | null; roomMode?: string | null };
    return summary.leadCatId === catId && summary.roomMode === 'direct_cat_chat';
  });

  if (existing) {
    return { kind: 'existing_channel', channelId: existing.id };
  }

  return { kind: 'draft_lane', path: buildNewChatPath(catId) };
}
