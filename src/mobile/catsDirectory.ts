import type { MobileAppShellPayload } from './contracts.js';

/**
 * Mobile-side Cats tab directory content. The Cats tab IS the
 * directory landing — three sections (My Cats / My Clowders /
 * My Catteries) projected from the same `MobileAppShellPayload` the
 * sidebars consume. Web Lobby content (greeting, entity index cards)
 * is intentionally NOT mirrored here. Phase 6 (ADR-100 + SPEC-103)
 * lands the actual Clowder/Cattery registries; until then the latter
 * two sections render their empty state.
 */

export interface MobileCatsDirectoryCatSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
  isBoss: boolean;
}

export interface MobileCatsDirectoryData {
  cats: MobileCatsDirectoryCatSummary[];
  /**
   * Phase 6 (ADR-100 + SPEC-103) extends the mobile contract with
   * real Clowder / Cattery summaries. Until then the section renders
   * empty.
   */
  clowders: readonly unknown[];
  catteries: readonly unknown[];
}

export interface SelectMobileCatsDirectoryOptions {
  /** Cap on the cats list. Optional — undefined returns the full list. */
  catsLimit?: number;
}

export function selectMobileCatsDirectory(
  payload: MobileAppShellPayload,
  options: SelectMobileCatsDirectoryOptions = {},
): MobileCatsDirectoryData {
  // The mobile chat contract (`MobileChatShellState`) is intentionally
  // a strict subset of the desktop one — it does not carry bossCatId or
  // avatarUrl today. Surface the fields we have; extend the boundary
  // contract when Phase 6 lands richer entity payloads.
  const cats: MobileCatsDirectoryCatSummary[] = payload.chat.cats.map((cat) => ({
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
