import type { MobileAppShellPayload } from './contracts.js';

/**
 * Mobile-side Lobby content. Per PLAN-091 phase 5 (and the user's IA
 * correction logged in SPEC-102 §Resolved Decisions), the mobile
 * Lobby tab IS the sidebar — three sections (My Cats / My Clowders /
 * My Catteries) projected from the same `MobileAppShellPayload` the
 * sidebars consume. The earlier `stats / quickEntryRow /
 * recentActivity` shape was removed cleanly in the same change. Phase
 * 6 lands the actual Clowder/Cattery registries (ADR-100 + SPEC-103);
 * until then the latter two sections render their empty state.
 */

export interface MobileLobbyCatSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
  isBoss: boolean;
}

export interface MobileLobbyData {
  cats: MobileLobbyCatSummary[];
  /**
   * Phase 6 (ADR-100 + SPEC-103) extends the mobile contract with
   * real Clowder / Cattery summaries. Until then the section renders
   * empty.
   */
  clowders: readonly unknown[];
  catteries: readonly unknown[];
}

export interface SelectMobileLobbyOptions {
  /** Cap on the cats list. Optional — undefined returns the full list. */
  catsLimit?: number;
}

export function selectMobileLobby(
  payload: MobileAppShellPayload,
  options: SelectMobileLobbyOptions = {},
): MobileLobbyData {
  // The mobile chat contract (`MobileChatShellState`) is intentionally
  // a strict subset of the desktop one — it does not carry bossCatId or
  // avatarUrl today. Surface the fields we have; extend the boundary
  // contract when Phase 6 lands richer entity payloads.
  const cats: MobileLobbyCatSummary[] = payload.chat.cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    avatarUrl: null,
    avatarColor: cat.avatarColor ?? null,
    isBoss: false,
  }));

  const limited =
    typeof options.catsLimit === 'number' && options.catsLimit >= 0
      ? cats.slice(0, options.catsLimit)
      : cats;

  return {
    cats: limited,
    clowders: [],
    catteries: [],
  };
}
