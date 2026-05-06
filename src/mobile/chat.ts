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
 *     mobile see on the wire. The web sidebar's
 *     `buildConversationSidebarRecentEntries` does NOT re-sort
 *     either; it just iterates. Earlier the mobile selector sorted
 *     by `lastMessageAt`, which produced a different visual order
 *     than web (a freshly-created-but-empty channel sat at the
 *     bottom on mobile, top on web).
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
    // Phase 4c expands the wire DTO to carry "lastSenderName" so the
    // subtitle becomes "{sender} · {timeAgo}".
    subtitle: null,
    updatedAt,
  };
}

/**
 * Direct-lane channel finder — given a cat id, returns the
 * `direct_message` channel for that cat (or null). Mirrors the web
 * `findDirectLaneForCat` helper at
 * `src/app/renderer/productShell/myCatNavigation.ts`. Generic over
 * the channel shape so web's `ChatChannelSummary` and mobile's
 * narrowed `MobileChatChannelSummary` can both consume it.
 */
export function findMobileDirectLaneForCat<
  TChannel extends Pick<
    MobileChatChannelSummary,
    'channelKind' | 'defaultRecipientCatId'
  >,
>(channels: readonly TChannel[], catId: string): TChannel | null {
  return (
    channels.find(
      (channel) =>
        channel.channelKind === 'direct_message'
        && channel.defaultRecipientCatId === catId,
    ) ?? null
  );
}

/**
 * Sorts cats for the DIRECT MESSAGES section. Pure port of the web
 * `sortChatCatsByRecency` algorithm at
 * `src/products/chat/renderer/components/Sidebar.tsx` —
 *
 *   - Each cat's recency = the latest `lastActivatedAt ?? lastMessageAt`
 *     of any direct-lane channel they're the recipient of.
 *   - Cats with no direct-lane channel fall back to their own
 *     `createdAt`, so a brand-new cat appears at the top of the
 *     list before any DM has happened.
 *   - Sort descending (most recent first).
 *   - Boss-cat pinning is intentionally NOT honored here — that's
 *     Lobby behaviour, not Chat.
 *
 * Generic over the cat / channel shapes so web can also consume the
 * same algorithm with its full `ChatCat` / `ChatChannelSummary`
 * types (both are structural supertypes of the mobile narrows).
 */
export function sortChatCatsByRecency<
  TCat extends Pick<MobileChatCat, 'id' | 'createdAt'>,
  TChannel extends Pick<
    MobileChatChannelSummary,
    | 'channelKind'
    | 'defaultRecipientCatId'
    | 'lastActivatedAt'
    | 'lastMessageAt'
  >,
>(cats: readonly TCat[], channels: readonly TChannel[]): TCat[] {
  const recencyByCatId = new Map<string, string>();
  for (const channel of channels) {
    if (channel.channelKind !== 'direct_message') {
      continue;
    }
    const catId = channel.defaultRecipientCatId;
    if (!catId) {
      continue;
    }
    const ts = channel.lastActivatedAt ?? channel.lastMessageAt ?? '';
    const existing = recencyByCatId.get(catId);
    if (!existing || existing.localeCompare(ts) < 0) {
      recencyByCatId.set(catId, ts);
    }
  }
  return [...cats].sort((left, right) => {
    const leftTime = recencyByCatId.get(left.id) ?? left.createdAt;
    const rightTime = recencyByCatId.get(right.id) ?? right.createdAt;
    return rightTime.localeCompare(leftTime);
  });
}

/**
 * Returns the `MobileChatCat`s the mobile Chat tab renders inside
 * its DIRECT MESSAGES section, sorted by `sortChatCatsByRecency`.
 * Mirrors the web Chat sidebar's behaviour:
 *
 *   - Filters out archived cats (the section only shows cats that
 *     are still active).
 *   - Does NOT filter on whether a direct-lane channel exists — a
 *     fresh cat with no DM yet still appears, sorted by its own
 *     `createdAt`. Tap behaviour for "no channel yet" is the
 *     consumer's call (mobile currently surfaces a desktop-only
 *     alert; web auto-creates a draft).
 */
export function selectMobileChatDirectLaneCats(
  payload: MobileAppShellPayload,
): MobileChatCat[] {
  const activeCats = payload.chat.cats.filter((cat) => cat.status === 'active');
  return sortChatCatsByRecency(activeCats, payload.chat.channels);
}
