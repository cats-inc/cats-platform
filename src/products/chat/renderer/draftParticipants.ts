import type { ChatChannelSummary } from '../api/contracts.js';
import {
  NEW_CHAT_PATH,
  buildMyCatPath,
  buildNewChatPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths.js';

export interface DraftParticipantSelection {
  routeLeadCatId: string | null;
  toggleCatIds: string[];
  participantCatIds: string[];
  effectiveLeadCatId: string | null;
  hasRouteLeadCat: boolean;
  hasParticipants: boolean;
}

export interface DraftRouteContext {
  routeLeadCatId: string | null;
  isDirectLaneRoute: boolean;
  isLeadScopedNewChatRoute: boolean;
  isGenericNewChatRoute: boolean;
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

export function resolveDraftRouteContext(input: {
  draftLeadCatId: string | null;
  showingMyCatDirectLane: boolean;
}): DraftRouteContext {
  const routeLeadCatId = normalizeCatId(input.draftLeadCatId);
  const isDirectLaneRoute = Boolean(input.showingMyCatDirectLane && routeLeadCatId);
  const isLeadScopedNewChatRoute = Boolean(routeLeadCatId) && !isDirectLaneRoute;

  return {
    routeLeadCatId,
    isDirectLaneRoute,
    isLeadScopedNewChatRoute,
    isGenericNewChatRoute: !routeLeadCatId && !input.showingMyCatDirectLane,
  };
}

export function resolveDraftRoutePath(input: {
  route: DraftRouteContext;
  nextLeadCatId?: string | null;
}): string {
  const nextLeadCatId = normalizeCatId(input.nextLeadCatId);
  const leadCatId = nextLeadCatId ?? input.route.routeLeadCatId;

  if (input.route.isDirectLaneRoute) {
    return leadCatId ? buildMyCatPath(leadCatId) : NEW_CHAT_PATH;
  }

  return buildNewChatPath(leadCatId);
}

export function resolveMissingDraftLeadPath(input: {
  route: DraftRouteContext;
  channels: ReadonlyArray<Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>>;
  selectedChannelId: string | null | undefined;
}): string {
  return input.route.isDirectLaneRoute
    ? resolveVisibleChatPath(input.channels, input.selectedChannelId)
    : NEW_CHAT_PATH;
}
