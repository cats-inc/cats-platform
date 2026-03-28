import type { ChatChannelSummary } from '../api/contracts.js';
import type { ParticipantSessionStatus } from '../../../shared/roomRouting.js';
import { buildMyCatPath } from '../shared/channelPaths.js';
import { isDirectLaneSummary } from '../shared/channelTopology.js';

export type MyCatNavigationTarget =
  | { kind: 'direct_lane'; path: string };

export type MyCatStatusDot = 'no_dot' | 'sleeping' | 'waking_up' | 'awake' | 'error';

export function findDirectLaneForCat(
  channels: ChatChannelSummary[],
  catId: string,
): ChatChannelSummary | null {
  return channels.find((channel) =>
    channel.leadCatId === catId && isDirectLaneSummary(channel),
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
  _channels: ChatChannelSummary[],
  catId: string,
): MyCatNavigationTarget {
  return { kind: 'direct_lane', path: buildMyCatPath(catId) };
}
