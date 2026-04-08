import type { ChatChannelSummary } from '../api/contracts.js';
import {
  NEW_CHAT_PATH,
  buildMyCatPath,
  buildNewChatPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths.js';

export interface DraftParticipantSelection {
  routeDefaultRecipientCatId: string | null;
  toggleCatIds: string[];
  participantCatIds: string[];
  effectiveLeadCatId: string | null;
  hasRouteLeadCat: boolean;
  hasParticipants: boolean;
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
    routeDefaultRecipientCatId,
    toggleCatIds,
    participantCatIds,
    effectiveLeadCatId: participantCatIds[0] ?? null,
    hasRouteLeadCat: Boolean(routeDefaultRecipientCatId),
    hasParticipants: participantCatIds.length > 0,
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
  nextLeadCatId?: string | null;
}): string {
  const nextLeadCatId = normalizeCatId(input.nextLeadCatId);
  const defaultRecipientCatId = nextLeadCatId ?? input.route.routeDefaultRecipientCatId;

  if (input.route.isDirectLaneRoute) {
    return defaultRecipientCatId ? buildMyCatPath(defaultRecipientCatId) : NEW_CHAT_PATH;
  }

  return buildNewChatPath(defaultRecipientCatId);
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
