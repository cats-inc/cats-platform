import type {
  ChannelMessageMetadata,
  ChatMessage,
} from '../api/workspaceContracts.js';
import type { SelectedChannelView } from '../channelEntry.js';
import { isDirectLaneChannel } from '../channelTopology.js';

export interface ActiveChannelAudienceState {
  audienceKeys: string[];
  workflowShape: 'sequential' | 'concurrent';
}

function normalizeWorkflowShape(
  value: unknown,
): ChannelMessageMetadata['workflowShape'] | null {
  if (
    value === 'sequential'
    || value === 'concurrent'
    || value === 'converge'
    || value === 'parallel'
  ) {
    return value;
  }
  return null;
}

function normalizeAudienceChipWorkflowShape(
  value: unknown,
): ActiveChannelAudienceState['workflowShape'] {
  return value === 'concurrent' ? 'concurrent' : 'sequential';
}

function findLatestUserMessage(messages: readonly ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.senderKind === 'user') {
      return message;
    }
  }
  return null;
}

export function buildActiveAudienceParticipantKey(participantId: string): string {
  return `cat:${participantId}`;
}

function clampAudienceParticipantIds(
  participantIds: readonly string[],
  maxAudienceParticipants?: number | null,
): string[] {
  if (!Number.isFinite(maxAudienceParticipants)) {
    return [...participantIds];
  }

  const limit = Math.max(1, Math.trunc(maxAudienceParticipants ?? Number.POSITIVE_INFINITY));
  return participantIds.slice(0, limit);
}

function uniqueNonEmptyStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function resolveActiveParticipantIds(
  selectedChannel: SelectedChannelView,
  maxAudienceParticipants?: number | null,
): string[] {
  return clampAudienceParticipantIds(
    uniqueNonEmptyStrings(
      selectedChannel.assignedCats
        .filter((participant) => participant.status === 'active')
        .map((participant) => participant.catId),
    ),
    maxAudienceParticipants,
  );
}

function resolveRecipientParticipantIdsFromAudienceKeys(input: {
  activeParticipantIds: readonly string[];
  audienceKeys?: readonly string[] | null;
  maxAudienceParticipants?: number | null;
}): string[] {
  const { audienceKeys } = input;
  if (!audienceKeys || audienceKeys.length === 0) {
    return [];
  }

  const participantIdsByKey = new Map(
    input.activeParticipantIds.map((participantId) => [
      buildActiveAudienceParticipantKey(participantId),
      participantId,
    ]),
  );

  return clampAudienceParticipantIds(
    uniqueNonEmptyStrings(
      audienceKeys.map((key) => participantIdsByKey.get(key) ?? ''),
    ),
    input.maxAudienceParticipants,
  );
}

export function resolveActiveChannelAudienceState(options: {
  selectedChannel: SelectedChannelView | null;
  maxAudienceParticipants?: number | null;
}): ActiveChannelAudienceState | null {
  const metadata = resolveActiveChannelMessageMetadata(options);
  const { selectedChannel } = options;
  if (!selectedChannel || !metadata?.recipientParticipantIds?.length) {
    return null;
  }

  return {
    audienceKeys: metadata.recipientParticipantIds.map((participantId) =>
      buildActiveAudienceParticipantKey(participantId)),
    workflowShape: normalizeAudienceChipWorkflowShape(metadata.workflowShape),
  };
}

export function resolveActiveChannelMessageMetadata(options: {
  selectedChannel: SelectedChannelView | null;
  maxAudienceParticipants?: number | null;
  audienceKeys?: readonly string[] | null;
  workflowShape?: 'sequential' | 'concurrent' | null;
}): ChannelMessageMetadata | null {
  const { selectedChannel } = options;
  if (!selectedChannel) {
    return null;
  }

  if (selectedChannel.composerMode === 'solo' || isDirectLaneChannel(selectedChannel)) {
    return null;
  }

  const activeParticipantIds = resolveActiveParticipantIds(
    selectedChannel,
    options.maxAudienceParticipants,
  );
  if (activeParticipantIds.length === 0) {
    return null;
  }

  const latestUserMessage = findLatestUserMessage(selectedChannel.messages);
  const latestUserMetadata = latestUserMessage?.metadata ?? {};
  const selectedRecipientIds = resolveRecipientParticipantIdsFromAudienceKeys({
    activeParticipantIds,
    audienceKeys: options.audienceKeys,
    maxAudienceParticipants: options.maxAudienceParticipants,
  });
  const preferredRecipientIds = clampAudienceParticipantIds(
    uniqueNonEmptyStrings(
      Array.isArray(latestUserMetadata.recipientParticipantIds)
        ? latestUserMetadata.recipientParticipantIds.filter(
          (value): value is string => typeof value === 'string',
        )
        : [],
    ).filter((participantId) => activeParticipantIds.includes(participantId)),
    options.maxAudienceParticipants,
  );
  if (activeParticipantIds.length <= 1 && preferredRecipientIds.length === 0) {
    return null;
  }

  const recipientParticipantIds =
    selectedRecipientIds.length > 0
      ? selectedRecipientIds
      : preferredRecipientIds.length > 0
        ? preferredRecipientIds
        : activeParticipantIds;
  const latestCompletedTurn = selectedChannel.roomRouting.workflow.turnHistory[0] ?? null;
  const workflowShape = normalizeWorkflowShape(
    options.workflowShape
      ?? latestUserMetadata.workflowShape
      ?? selectedChannel.roomRouting.workflow.activeTurn?.workflowShape
      ?? latestCompletedTurn?.workflowShape
      ?? (recipientParticipantIds.length > 1 ? 'sequential' : null),
  );

  if (recipientParticipantIds.length === 0 && !workflowShape) {
    return null;
  }

  return {
    ...(recipientParticipantIds.length > 0
      ? {
          recipientParticipantIds,
        }
      : {}),
    ...(workflowShape
      ? {
          workflowShape,
        }
      : {}),
  };
}
