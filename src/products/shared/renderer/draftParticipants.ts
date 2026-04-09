export interface DraftParticipantSelection {
  participantCatIds: string[];
  effectiveDefaultRecipientCatId: string | null;
}

export interface DraftRouteContext {
  routeDefaultRecipientCatId: string | null;
  isDirectLaneRoute: boolean;
  isRecipientScopedNewChatRoute: boolean;
  isGenericNewChatRoute: boolean;
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

export function resolveDraftRouteContext(input: {
  draftDefaultRecipientCatId: string | null;
  showingMyCatDirectLane: boolean;
}): DraftRouteContext {
  const routeDefaultRecipientCatId = normalizeCatId(input.draftDefaultRecipientCatId);
  const isDirectLaneRoute = Boolean(input.showingMyCatDirectLane && routeDefaultRecipientCatId);
  const isRecipientScopedNewChatRoute = Boolean(routeDefaultRecipientCatId) && !isDirectLaneRoute;

  return {
    routeDefaultRecipientCatId,
    isDirectLaneRoute,
    isRecipientScopedNewChatRoute,
    isGenericNewChatRoute: !routeDefaultRecipientCatId && !input.showingMyCatDirectLane,
  };
}

export function resolveDraftRoutePath(input: {
  route: DraftRouteContext;
  nextDefaultRecipientCatId?: string | null;
  newChatPath: string;
  buildMyCatPath: (catId: string) => string;
  buildNewChatPath: (defaultRecipientCatId?: string | null) => string;
}): string {
  const nextDefaultRecipientCatId = normalizeCatId(input.nextDefaultRecipientCatId);
  const defaultRecipientCatId = nextDefaultRecipientCatId ?? input.route.routeDefaultRecipientCatId;

  if (input.route.isDirectLaneRoute) {
    return defaultRecipientCatId ? input.buildMyCatPath(defaultRecipientCatId) : input.newChatPath;
  }

  return input.buildNewChatPath(defaultRecipientCatId);
}

export function resolveMissingDraftDefaultRecipientPath(input: {
  route: DraftRouteContext;
  newChatPath: string;
  resolveVisibleChatPath: () => string;
}): string {
  return input.route.isDirectLaneRoute
    ? input.resolveVisibleChatPath()
    : input.newChatPath;
}
