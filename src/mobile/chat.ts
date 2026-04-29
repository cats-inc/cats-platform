import type {
  MobileAppShellPayload,
  MobileChatCat,
  MobileChatChannelSummary,
} from './contracts.js';

/**
 * UX-facing sidebar shape consumed by the React Native ChatSidebar
 * component. The selector below produces this from the mobile-safe
 * `MobileAppShellPayload` DTO. Mobile keeps callback / interaction
 * shapes (button labels, onPress handlers) on its own side; only the
 * data shape comes from the boundary so the field set stays in lock-
 * step with the server contract.
 */
export interface MobileSidebarRecent {
  id: string;
  title: string;
  subtitle: string | null;
  updatedAt: number;
}

export type MobileSidebarCatStatus = 'ready' | 'warm' | 'sleeping';

export interface MobileSidebarCat {
  id: string;
  name: string;
  avatarColor: string | null;
  status: MobileSidebarCatStatus;
}

export interface MobileChatSidebarData {
  recents: MobileSidebarRecent[];
  cats: MobileSidebarCat[];
}

export interface SelectChatSidebarOptions {
  /** Cap on recent entries returned. Server payload may be larger;
   *  mobile typically only renders the top-N. Defaults to 50. */
  recentLimit?: number;
}

/**
 * Pure projection from the wire payload to the mobile sidebar UX
 * shape. Deterministic — no Date.now(), no random IDs — so tests
 * remain stable across runs.
 */
export function selectMobileChatSidebar(
  payload: MobileAppShellPayload,
  options: SelectChatSidebarOptions = {},
): MobileChatSidebarData {
  const recentLimit = options.recentLimit ?? 50;

  const recents = payload.chat.channels
    .filter((channel) => channel.status === 'active')
    .map(channelToRecent)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, recentLimit);

  const cats = payload.chat.cats.map(catToSidebarCat);

  return { recents, cats };
}

/**
 * Returns the cats that belong to the given product, sorted by name.
 * Drives the `MY CODES` / `MY WORKS` screens (PLAN-084 Phase 6
 * placeholder destinations becoming live). Matches FR-046 / FR-047 —
 * MY CATS is one platform-level home with lens projections.
 */
export function selectMobileMyCatsLens(
  payload: MobileAppShellPayload,
  product: 'chat' | 'code' | 'work',
): MobileSidebarCat[] {
  return payload.chat.cats
    .filter((cat) => cat.products.includes(product))
    .map(catToSidebarCat)
    .sort((a, b) => a.name.localeCompare(b.name));
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

function catToSidebarCat(cat: MobileChatCat): MobileSidebarCat {
  return {
    id: cat.id,
    name: cat.name,
    avatarColor: cat.avatarColor,
    status: derivePresenceStatus(cat),
  };
}

function derivePresenceStatus(cat: MobileChatCat): MobileSidebarCatStatus {
  // V1 mapping is intentionally coarse: archived → sleeping, everything
  // else → ready. Phase 4b will surface real `warm` (recently active)
  // status once the runtime presence projection lands; until then the
  // sidebar shows a steady-state view rather than guessing.
  if (cat.status === 'archived') {
    return 'sleeping';
  }
  return 'ready';
}
