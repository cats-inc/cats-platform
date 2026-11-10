import {
  sameProviderModelSelection,
  type ProviderModelSelection,
} from '../../../../../shared/providerSelection.js';
import type { ChatCat } from '../../../api/workspaceContracts.js';
import {
  CATS_DIRECTORY_NEW_CAT_PATH,
  buildCatSettingsPath,
} from '../../../../../shared/catsDirectoryPaths.js';

export function hasModelSelectionChanged(
  left: ProviderModelSelection | null | undefined,
  right: ProviderModelSelection | null | undefined,
): boolean {
  return !sameProviderModelSelection(left, right);
}

export function findNewlyCreatedActiveCat(
  previousActiveCats: readonly Pick<ChatCat, 'id'>[],
  nextCats: readonly ChatCat[],
): ChatCat | null {
  const previousIds = new Set(previousActiveCats.map((cat) => cat.id));
  return nextCats.find((cat) => cat.status === 'active' && !previousIds.has(cat.id)) ?? null;
}

/**
 * Where the cats canvas sends a URL that names no visible cat, or `null` to
 * stay. The URL is the only source of the selected cat, so this covers the
 * roster root (`/entities/cats`), a cat that was deleted, and an archived cat
 * whose row the owner just hid. With no cat to show, it opens the add-cat flow.
 */
export function resolveCatsCanvasRedirect(input: {
  isCreateRoute: boolean;
  selectedCatId: string | null;
  cats: readonly Pick<ChatCat, 'id' | 'status'>[];
  sortedActiveCats: readonly Pick<ChatCat, 'id'>[];
  sortedArchivedCats: readonly Pick<ChatCat, 'id'>[];
  showArchived: boolean;
}): string | null {
  if (input.isCreateRoute) return null;
  const current = input.selectedCatId
    ? input.cats.find((cat) => cat.id === input.selectedCatId) ?? null
    : null;
  const hiddenBecauseArchived = current?.status === 'archived' && !input.showArchived;
  if (current && !hiddenBecauseArchived) return null;
  const fallback = input.sortedActiveCats[0]
    ?? (input.showArchived ? input.sortedArchivedCats[0] : undefined);
  return fallback ? buildCatSettingsPath(fallback.id) : CATS_DIRECTORY_NEW_CAT_PATH;
}
