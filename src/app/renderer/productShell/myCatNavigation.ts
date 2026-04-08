import type { ParticipantSessionStatus, RoomRoutingMode } from '../../../shared/roomRouting.js';
import { isDirectLaneSummary, type ProductChannelKind } from './channelTopology.js';

type ChatChannelSummaryRef = {
  leadCatId?: string | null;
  channelKind?: ProductChannelKind | null;
  roomMode?: RoomRoutingMode | null;
};

export type MyCatNavigationTarget =
  | { kind: 'direct_lane'; path: string };

export type MyCatStatusDot = 'no_dot' | 'sleeping' | 'waking_up' | 'awake' | 'error';

function normalizeRouteToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildMyCatPathForPrefix(chatPrefix: string, catId: string): string {
  const normalizedCatId = normalizeRouteToken(catId);
  const myCatsPathPrefix = `${chatPrefix}/my-cats`;
  if (!normalizedCatId) {
    return myCatsPathPrefix;
  }

  return `${myCatsPathPrefix}/${encodeURIComponent(normalizedCatId)}`;
}

export function findDirectLaneForCat<TChannel extends ChatChannelSummaryRef>(
  channels: TChannel[],
  catId: string,
): TChannel | null {
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
    case 'awake':
      return 'myCatDot myCatDotAwake';
    case 'waking_up':
      return 'myCatDot myCatDotWaking';
    case 'sleeping':
      return 'myCatDot myCatDotSleeping';
    case 'error':
      return 'myCatDot myCatDotError';
    default:
      return '';
  }
}

export function statusDotLabel(dot: MyCatStatusDot): string {
  switch (dot) {
    case 'awake':
      return 'Awake';
    case 'waking_up':
      return 'Waking up';
    case 'sleeping':
      return 'Sleeping';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}

export function resolveMyCatNavigationTargetForPrefix(
  chatPrefix: string,
  _channels: ChatChannelSummaryRef[],
  catId: string,
): MyCatNavigationTarget {
  return { kind: 'direct_lane', path: buildMyCatPathForPrefix(chatPrefix, catId) };
}
