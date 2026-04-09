export interface DraftParticipantSelection {
  participantCatIds: string[];
  effectiveDefaultRecipientCatId: string | null;
}

function normalizeCatId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveDraftParticipantSelection(input: {
  draftDefaultRecipientCatId: string | null;
  draftCatIds: readonly string[];
}): DraftParticipantSelection {
  const routeDefaultRecipientCatId = normalizeCatId(input.draftDefaultRecipientCatId);
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

  const participantCatIds = routeDefaultRecipientCatId
    ? [routeDefaultRecipientCatId, ...toggleCatIds.filter((catId) => catId !== routeDefaultRecipientCatId)]
    : toggleCatIds;

  return {
    participantCatIds,
    effectiveDefaultRecipientCatId: participantCatIds[0] ?? null,
  };
}
