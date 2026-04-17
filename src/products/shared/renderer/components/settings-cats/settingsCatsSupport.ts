import type { ProviderModelSelection } from '../../../../../shared/providerSelection.js';
import type { ChatCat } from '../../../api/workspaceContracts.js';

export function hasModelSelectionChanged(
  left: ProviderModelSelection | null | undefined,
  right: ProviderModelSelection | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

export function findNewlyCreatedActiveCat(
  previousActiveCats: readonly Pick<ChatCat, 'id'>[],
  nextCats: readonly ChatCat[],
): ChatCat | null {
  const previousIds = new Set(previousActiveCats.map((cat) => cat.id));
  return nextCats.find((cat) => cat.status === 'active' && !previousIds.has(cat.id)) ?? null;
}
