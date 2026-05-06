import type { ParticipantSessionStatus, RoomRoutingMode } from '../../../shared/roomRouting.js';
import { type ProductChannelKind } from './channelTopology.js';
import { findDirectLaneForCat as findDirectLaneForCatShared } from '../../../products/chat/shared/directMessageSelectors.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';

type ChatChannelSummaryRef = {
  defaultRecipientCatId?: string | null;
  channelKind?: ProductChannelKind | null;
  roomMode?: RoomRoutingMode | null;
};

export type MyCatNavigationTarget =
  | { kind: 'direct_message'; path: string };

export type MyCatStatusDot = 'no_dot' | 'sleeping' | 'waking_up' | 'awake' | 'error';

function normalizeRouteToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildMyCatPathForPrefix(chatPrefix: string, catId: string): string {
  // PLAN-091 phase 2 path migration: `/chat/my-cats/:catId` collapsed to
  // `/chat/dm/:catId`. Chat's own AppRoutes only registers `dm/:catId`,
  // and the platform-shell `WorkspaceAppRoutes` was updated to match,
  // so all surfaces resolve direct-lane navigation through `/dm` now.
  const normalizedCatId = normalizeRouteToken(catId);
  const directMessagePathPrefix = `${chatPrefix}/dm`;
  if (!normalizedCatId) {
    return directMessagePathPrefix;
  }

  return `${directMessagePathPrefix}/${encodeURIComponent(normalizedCatId)}`;
}

/**
 * Re-export of the shared `findDirectLaneForCat` from
 * `src/products/chat/shared/directMessageSelectors.ts`. Web call
 * sites keep importing from here for backward compatibility; the
 * canonical implementation lives in the chat product's shared
 * module so mobile picks it up via the same source of truth.
 */
export function findDirectLaneForCat<TChannel extends ChatChannelSummaryRef>(
  channels: TChannel[],
  catId: string,
): TChannel | null {
  return findDirectLaneForCatShared(channels, catId);
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

export function statusDotLabel(dot: MyCatStatusDot): MessageKey | null {
  switch (dot) {
    case 'awake':
      return messageKeys.chatLifecycleAwakeLabel;
    case 'waking_up':
      return messageKeys.chatLifecycleWakingUpLabel;
    case 'sleeping':
      return messageKeys.chatLifecycleSleepingLabel;
    case 'error':
      return messageKeys.chatCatStatusErrorLabel;
    default:
      return null;
  }
}

export function resolveMyCatNavigationTargetForPrefix(
  chatPrefix: string,
  _channels: ChatChannelSummaryRef[],
  catId: string,
): MyCatNavigationTarget {
  return { kind: 'direct_message', path: buildMyCatPathForPrefix(chatPrefix, catId) };
}
