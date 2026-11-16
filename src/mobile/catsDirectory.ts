import type { MobileAppShellPayload, MobileDirectoryGroupSummary } from './contracts.js';

/**
 * Mobile-side Cats tab directory content. The Cats tab IS the
 * directory landing — three sections (My Cats / My Clowders /
 * My Catteries) projected from the same `MobileAppShellPayload` the
 * sidebars consume. Web Lobby content (greeting, entity index cards)
 * is intentionally NOT mirrored here. Clowders and Catteries come from
 * the lobby summaries (SPEC-103); their homes read the full Directory.
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
  clowders: MobileDirectoryGroupSummary[];
  catteries: MobileDirectoryGroupSummary[];
}

function summarizeGroups(groups: readonly MobileDirectoryGroupSummary[] | undefined): MobileDirectoryGroupSummary[] {
  return (groups ?? []).map((group) => ({ id: group.id, name: group.name, catCount: group.catCount }));
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
  // a strict subset of the desktop one — it does not carry avatarUrl
  // today. Surface the fields we have; extend the boundary contract when
  // Phase 6 lands richer entity payloads.
  const cats: MobileCatsDirectoryCatSummary[] = payload.chat.cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    avatarUrl: null,
    avatarColor: cat.avatarColor ?? null,
    isBoss: cat.group === 'admin',
  }));

  const limited =
    typeof options.catsLimit === 'number' && options.catsLimit >= 0
      ? cats.slice(0, options.catsLimit)
      : cats;

  return {
    cats: limited,
    clowders: summarizeGroups(payload.lobby?.clowders),
    catteries: summarizeGroups(payload.lobby?.catteries),
  };
}
