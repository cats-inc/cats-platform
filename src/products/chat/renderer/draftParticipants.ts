export interface DraftParticipantSelection {
  routeLeadCatId: string | null;
  toggleCatIds: string[];
  participantCatIds: string[];
  effectiveLeadCatId: string | null;
  hasRouteLeadCat: boolean;
  hasParticipants: boolean;
}

function normalizeCatId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveDraftParticipantSelection(input: {
  draftLeadCatId: string | null;
  draftCatIds: readonly string[];
}): DraftParticipantSelection {
  const routeLeadCatId = normalizeCatId(input.draftLeadCatId);
  const toggleCatIds: string[] = [];
  const seen = new Set<string>();

  for (const candidate of input.draftCatIds) {
    const catId = normalizeCatId(candidate);
    if (!catId || seen.has(catId)) {
      continue;
    }
    seen.add(catId);
    toggleCatIds.push(catId);
  }

  const participantCatIds = routeLeadCatId
    ? [routeLeadCatId, ...toggleCatIds.filter((catId) => catId !== routeLeadCatId)]
    : toggleCatIds;

  return {
    routeLeadCatId,
    toggleCatIds,
    participantCatIds,
    effectiveLeadCatId: participantCatIds[0] ?? null,
    hasRouteLeadCat: Boolean(routeLeadCatId),
    hasParticipants: participantCatIds.length > 0,
  };
}
