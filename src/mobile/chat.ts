import {
  findDirectLaneForCat,
  isCatPartOfChatProduct,
  sortChatCatsByRecency,
} from '../products/chat/shared/directMessageSelectors.js';

// Both helpers are re-exported below for the mobile boundary's
// public surface; we also use them locally in
// `selectMobileChatDirectLaneCats`.
export {
  sortChatCatsByRecency,
} from '../products/chat/shared/directMessageSelectors.js';
export const findMobileDirectLaneForCat = findDirectLaneForCat;
import type {
  MobileAppShellPayload,
  MobileChatCat,
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
 * Returns the channels whose `originSurface` matches the given
 * product, capped to `recentLimit`. Drives the `Recents (Chat)` /
 * `Recents (Code)` / `Recents (Work)` lists on the trimmed product
 * sidebars. Matches the SPEC-070 product-scoped recents pattern.
 *
 * Filter alignment with the web Chat sidebar
 * (`src/app/renderer/productShell/conversationSidebarViewModel.ts`'s
 * `recentsChannels` filter):
 *
 *   - `originSurface === product` (this is the product-scoping rule
 *     SPEC-070 introduced; equivalent to web's
 *     `channelMatchesActiveSurface`)
 *   - `channelKind !== 'direct_message'` (mirrors web's
 *     `!isDirectLaneSummary`; DMs live under the dedicated DIRECT
 *     MESSAGES section on the Chat tab, never in the product
 *     Recents list)
 *
 * Sort alignment:
 *
 *   - The list preserves the input order of `payload.chat.channels`.
 *     Desktop maintains this list with `unshift` on every channel
 *     create (`state/model/index.ts`'s `nextState.channels.unshift`),
 *     so creation order — newest first — is the order both web and
 *     mobile see on the wire.
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
    .slice(0, recentLimit)
    .map(channelToRecent);
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
    subtitle: null,
    updatedAt,
  };
}

/**
 * Returns the `MobileChatCat`s the mobile Chat tab renders inside
 * its DIRECT MESSAGES section, sorted by `sortChatCatsByRecency`.
 * Mirrors the web Chat sidebar (`src/products/chat/renderer/components/Sidebar.tsx`):
 *
 *   - Filters out archived cats (the section only shows cats that
 *     are still active).
 *   - Filters out cats whose `products` list does not include
 *     `'chat'`. A cat scoped only to Code / Work would otherwise
 *     leak into the Chat tab's DM list — flagged on review as a
 *     missing parity check vs web's `isChatCat` gate.
 *   - Does NOT filter on whether a direct-lane channel exists. A
 *     fresh chat-product cat with no DM yet still appears, sorted
 *     by its own `createdAt`. Tap behaviour for "no channel yet"
 *     is the consumer's call.
 */
export function selectMobileChatDirectLaneCats(
  payload: MobileAppShellPayload,
): MobileChatCat[] {
  const eligibleCats = payload.chat.cats.filter(
    (cat) => cat.status === 'active' && isCatPartOfChatProduct(cat),
  );
  return sortChatCatsByRecency(eligibleCats, payload.chat.channels);
}
