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
 * sorted desc by last activity, capped to `recentLimit`. Drives the
 * `Recents (Chat)` / `Recents (Code)` / `Recents (Work)` lists on the
 * trimmed product sidebars. Matches the SPEC-070 product-scoped
 * recents pattern.
 *
 * Filter alignment with the web Chat sidebar
 * (`src/app/renderer/productShell/conversationSidebarViewModel.ts`'s
 * `recentsChannels` filter):
 *
 *   - `originSurface === product` (this is the product-scoping rule
 *     SPEC-070 introduced; equivalent to web's
 *     `channelMatchesActiveSurface`)
 *   - `channelKind !== 'direct_message'` (mirrors web's
 *     `!isDirectLaneSummary`; DMs live under the Cats tab on mobile,
 *     never in the product Recents list)
 *
 * What this filter does NOT do:
 *
 *   - It does NOT gate on `status === 'active'`. The previous filter
 *     dropped any channel that hadn't seen at least one round-trip,
 *     so freshly-created-but-empty channels (status `'configured'` /
 *     `'planned'`) were invisible on mobile while still showing up on
 *     web. Aligning with web means the user sees the same set of
 *     conversations on both surfaces — including drafts they
 *     abandoned mid-thread.
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
        channel.originSurface === product
        && channel.channelKind !== 'direct_message',
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
