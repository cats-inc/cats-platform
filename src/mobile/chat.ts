import type {
  MobileAppShellPayload,
  MobileChatChannelSummary,
} from './contracts.js';

/**
 * UX-facing recents shape consumed by the React Native trimmed
 * product sidebars. The cat / presence-status portion of the old
 * ChatSidebar contract was removed in 2026-05-05 once the
 * Chat / Code / Work tabs dropped their MY-lens sections — only the
 * recents projection survives on the mobile boundary.
 */
export interface MobileSidebarRecent {
  id: string;
  title: string;
  subtitle: string | null;
  updatedAt: number;
}

export interface SelectProductRecentsOptions {
  recentLimit?: number;
}

/**
 * Returns the channels whose `originSurface` matches the given product,
 * filtered to active status, sorted desc by last activity. Drives the
 * `Recents (Code)` / `Recents (Work)` screens. Matches the SPEC-070
 * product-scoped recents pattern.
 */
export function selectMobileProductRecents(
  payload: MobileAppShellPayload,
  product: 'chat' | 'code' | 'work',
  options: SelectProductRecentsOptions = {},
): MobileSidebarRecent[] {
  const recentLimit = options.recentLimit ?? 50;
  return payload.chat.channels
    .filter(
      (channel) =>
        channel.status === 'active' && channel.originSurface === product,
    )
    .map(channelToRecent)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, recentLimit);
}

function channelToRecent(
  channel: MobileChatChannelSummary,
): MobileSidebarRecent {
  const lastTimestamp = channel.lastMessageAt ?? channel.lastActivatedAt;
  const updatedAt = lastTimestamp ? Date.parse(lastTimestamp) : 0;
  return {
    id: channel.id,
    title: channel.title,
    // Subtitle derivation needs participant + time; both of those need
    // richer payload than `MobileChatChannelSummary` carries today. For
    // now we leave it null and the renderer skips the subtitle row.
    // Phase 4c expands the wire DTO to carry "lastSenderName" so the
    // subtitle becomes "{sender} · {timeAgo}".
    subtitle: null,
    updatedAt,
  };
}
