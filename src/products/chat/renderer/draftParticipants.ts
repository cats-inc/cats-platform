import type { ChatChannelSummary } from '../api/contracts.js';
import {
  resolveDraftParticipantSelection as resolveWorkspaceDraftParticipantSelection,
  resolveDraftRouteContext as resolveWorkspaceDraftRouteContext,
  resolveDraftRoutePath as resolveWorkspaceDraftRoutePath,
  resolveMissingDraftDefaultRecipientPath as resolveWorkspaceMissingDraftDefaultRecipientPath,
} from '../../shared/renderer/draftParticipants.js';
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
  effectiveDefaultRecipientCatId: string | null;
  hasRouteDefaultRecipient: boolean;
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
  const selection = resolveWorkspaceDraftParticipantSelection(input);

  return {
    routeDefaultRecipientCatId,
    toggleCatIds,
    participantCatIds: selection.participantCatIds,
    effectiveDefaultRecipientCatId: selection.effectiveDefaultRecipientCatId,
    hasRouteDefaultRecipient: Boolean(routeDefaultRecipientCatId),
    hasParticipants: selection.participantCatIds.length > 0,
  };
}

export function resolveDraftRouteContext(input: {
  draftDefaultRecipientCatId: string | null;
  showingMyCatDirectLane: boolean;
}): DraftRouteContext {
  return resolveWorkspaceDraftRouteContext(input);
}

export function resolveDraftRoutePath(input: {
  route: DraftRouteContext;
  nextDefaultRecipientCatId?: string | null;
}): string {
  return resolveWorkspaceDraftRoutePath({
    ...input,
    newChatPath: NEW_CHAT_PATH,
    buildMyCatPath,
    buildNewChatPath,
  });
}

export function resolveMissingDraftDefaultRecipientPath(input: {
  route: DraftRouteContext;
  channels: ReadonlyArray<Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>>;
  selectedChannelId: string | null | undefined;
}): string {
  return resolveWorkspaceMissingDraftDefaultRecipientPath({
    route: input.route,
    newChatPath: NEW_CHAT_PATH,
    resolveVisibleChatPath: () => resolveVisibleChatPath(input.channels, input.selectedChannelId),
  });
}
