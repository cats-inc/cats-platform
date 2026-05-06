/**
 * Canonical direct-message selectors for the chat product. Both the
 * web Chat sidebar (`src/products/chat/renderer/components/Sidebar.tsx`)
 * and the mobile boundary (`src/mobile/chat.ts`, re-exported to the
 * RN client) consume from this module so the algorithms can't drift.
 *
 * Earlier the sort + finder lived as duplicated copies in web and
 * mobile — flagged by review on commit `ec245b5b3`. This module
 * pulls the canonical implementation back into the chat product
 * directory where it belongs.
 *
 * Why this lives at `src/products/chat/shared/` and not
 * `src/mobile/`: the algorithm is chat-product domain logic, not
 * mobile-specific. The mobile boundary is allowed to import from
 * here (`scripts/check-mobile-boundary.mjs` does not list
 * `/products/chat/shared/` as forbidden), so mobile picks the
 * shared copy up via a thin re-export rather than hosting the
 * canonical version.
 *
 * The module is intentionally Node-clean: no `node:*` imports, no
 * helpers from `src/shared/platformSurfaces.ts` (the chat-product
 * membership check is inlined). All public functions are generic
 * over narrow `Pick<>`-style refs so both web's full
 * `ChatCat` / `ChatChannelSummary` and mobile's `MobileChatCat` /
 * `MobileChatChannelSummary` satisfy the constraints.
 */

const DIRECT_MESSAGE_KIND = 'direct_message';

interface DirectLaneChannelRef {
  channelKind?: string | null;
  /**
   * Optional — desktop's `toChannelSummary` resolves `channelKind`
   * from full state, so the wire shape always carries the
   * resolved kind. The fallback to `roomMode` mirrors web's
   * `isDirectLaneSummary` defensive check for callers whose
   * channel shape doesn't include `channelKind` (e.g. raw state
   * objects pre-projection).
   */
  roomMode?: string | null;
  defaultRecipientCatId?: string | null;
}

interface ChannelRecencyRef extends DirectLaneChannelRef {
  lastActivatedAt: string | null;
  lastMessageAt: string | null;
}

function isDirectLaneChannel(channel: DirectLaneChannelRef): boolean {
  return (
    channel.channelKind === DIRECT_MESSAGE_KIND
    || channel.roomMode === DIRECT_MESSAGE_KIND
  );
}

interface CatRecencyRef {
  id: string;
  createdAt: string;
}

interface CatProductMembershipRef {
  /**
   * `string[]` rather than `readonly string[]` because mobile's
   * `MobileChatCat.products` is mutable; the function only reads.
   */
  products?: string[] | readonly string[] | null;
}

/**
 * Returns the direct-lane (`channelKind === 'direct_message'`)
 * channel whose `defaultRecipientCatId` matches `catId`, or null
 * when no DM exists. The channel-kind guard means a regular chat
 * channel that happens to have the same default recipient does NOT
 * resolve here — DMs and group chats stay independent.
 */
export function findDirectLaneForCat<TChannel extends DirectLaneChannelRef>(
  channels: readonly TChannel[],
  catId: string,
): TChannel | null {
  return (
    channels.find(
      (channel) =>
        isDirectLaneChannel(channel)
        && channel.defaultRecipientCatId === catId,
    ) ?? null
  );
}

/**
 * Sort cats descending by direct-lane channel activity. Cats with
 * no DM channel fall back to their `createdAt`, so a brand-new cat
 * appears at the top of the list before any conversation has
 * happened. Boss-cat pinning is intentionally NOT applied here —
 * that's Lobby behaviour, not Chat.
 */
export function sortChatCatsByRecency<
  TCat extends CatRecencyRef,
  TChannel extends ChannelRecencyRef,
>(cats: readonly TCat[], channels: readonly TChannel[]): TCat[] {
  const recencyByCatId = new Map<string, string>();
  for (const channel of channels) {
    if (!isDirectLaneChannel(channel)) {
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
 * Pure check: does this cat belong to the chat product? A cat with
 * an empty / missing `products` array defaults to chat (matches
 * `defaultCatProducts() = ['chat']` in
 * `src/shared/platformSurfaces.ts`). The check is inlined here to
 * keep this module Node-clean and free of the heavier
 * `platformSurfaces` import surface.
 *
 * Mirrors web's `isChatCat` (`src/products/shared/renderer/workspaceChatUtils.tsx`)
 * for the surface-membership decision; renderer-only behaviour
 * (visibility filters, etc.) stays at the call site.
 */
export function isCatPartOfChatProduct<TCat extends CatProductMembershipRef>(
  cat: TCat,
): boolean {
  if (!cat.products || cat.products.length === 0) {
    return true;
  }
  return cat.products.includes('chat');
}
