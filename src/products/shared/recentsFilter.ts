import { normalizePlatformSurface } from '../../shared/platformSurfaces.js';
import type { PlatformSurfaceId } from '../../shared/platform-contract.js';

const DIRECT_MESSAGE_KIND = 'direct_message';

interface RecentsFilterChannelRef {
  channelKind?: string | null;
  /**
   * Optional fallback for callers whose channel shape predates
   * `channelKind` resolution (raw state objects, etc.). Desktop's
   * `toChannelSummary` always sets `channelKind`, so the wire shape
   * normally doesn't need this branch.
   */
  roomMode?: string | null;
  originSurface?: string | null;
}

/**
 * Canonical filter for the Chat / Code / Work product Recents
 * lists. Drops direct-lane (DM) channels — those live under the
 * dedicated DIRECT MESSAGES section on the Chat tab — and scopes
 * to the product whose tab the user is viewing.
 *
 * Both web (`src/app/renderer/productShell/conversationSidebarRecentEntries.tsx`'s
 * inline `recentsChannels` filter) and mobile
 * (`src/mobile/chat.ts`'s `selectMobileProductRecents`) consume
 * from here so the predicate can't drift across surfaces.
 *
 * The function does NOT sort. Both web and mobile rely on the wire
 * order (desktop maintains `state.channels` newest-first via
 * `unshift` on every channel create — see
 * `src/products/chat/state/model/index.ts`'s `nextState.channels.unshift`).
 *
 * Generic over the channel shape; both web's `ChatChannelSummary`
 * (full type) and mobile's `MobileChatChannelSummary` (narrowed
 * subset) satisfy `RecentsFilterChannelRef`.
 */
export function filterChatChannelsForProductRecents<
  TChannel extends RecentsFilterChannelRef,
>(channels: readonly TChannel[], product: PlatformSurfaceId): TChannel[] {
  return channels.filter((channel) => {
    if (
      channel.channelKind === DIRECT_MESSAGE_KIND
      || channel.roomMode === DIRECT_MESSAGE_KIND
    ) {
      return false;
    }
    return normalizePlatformSurface(channel.originSurface) === product;
  });
}
