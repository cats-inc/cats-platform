import type { ChatChannelSummary, ParticipantSessionStatus } from '../../../shared/app-shell.js';
import { buildNewChatPath } from '../../../shared/channelPaths.js';

export type MyCatNavigationTarget =
  | { kind: 'existing_channel'; channelId: string }
  | { kind: 'draft_lane'; path: string };

export type MyCatStatusDot = 'no_dot' | 'sleeping' | 'waking_up' | 'awake' | 'error';

export function findDirectLaneForCat(
  channels: ChatChannelSummary[],
  catId: string,
): ChatChannelSummary | null {
  return channels.find((channel) =>
    channel.leadCatId === catId && channel.roomMode === 'direct_cat_chat',
  ) ?? null;
}

export function resolveMyCatStatusDot(
  leaseStatus: ParticipantSessionStatus | null | undefined,
): MyCatStatusDot {
  switch (leaseStatus) {
    case 'ready':
      return 'awake';
    case 'initializing':
      return 'waking_up';
    case 'error':
      return 'error';
    case 'not_started':
    case 'closed':
    case 'removed':
      return 'sleeping';
    default:
      return 'no_dot';
  }
}

export function statusDotClassName(dot: MyCatStatusDot): string {
  switch (dot) {
    case 'awake': return 'myCatDot myCatDotAwake';
    case 'waking_up': return 'myCatDot myCatDotWaking';
    case 'sleeping': return 'myCatDot myCatDotSleeping';
    case 'error': return 'myCatDot myCatDotError';
    default: return '';
  }
}

export function statusDotLabel(dot: MyCatStatusDot): string {
  switch (dot) {
    case 'awake': return 'Awake';
    case 'waking_up': return 'Waking up';
    case 'sleeping': return 'Sleeping';
    case 'error': return 'Error';
    default: return '';
  }
}

export function resolveMyCatNavigationTarget(
  channels: ChatChannelSummary[],
  catId: string,
): MyCatNavigationTarget {
  const existing = findDirectLaneForCat(channels, catId);

  if (existing) {
    return { kind: 'existing_channel', channelId: existing.id };
  }

  return { kind: 'draft_lane', path: buildNewChatPath(catId) };
}
