import type {
  ChannelMessageMetadata,
  ChatMessage,
} from '../api/contracts.js';
import { activeAssignedParticipants } from '../shared/channelParticipants.js';
import type { SelectedChannelView } from '../shared/channelEntry.js';
import { isDirectLaneChannel } from '../shared/channelTopology.js';

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

function findLatestUserMessage(messages: readonly ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.senderKind === 'user') {
      return message;
    }
  }
  return null;
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

export function resolveActiveChannelMessageMetadata(options: {
  selectedChannel: SelectedChannelView | null;
  maxAudienceParticipants?: number | null;
}): ChannelMessageMetadata | null {
  const { selectedChannel } = options;
  if (!selectedChannel) {
    return null;
  }

  if (selectedChannel.composerMode === 'solo' || isDirectLaneChannel(selectedChannel)) {
    return null;
  }

  const activeParticipantIds = clampAudienceParticipantIds(
    uniqueNonEmptyStrings(
      activeAssignedParticipants(selectedChannel).map((participant) => participant.participantId),
    ),
    options.maxAudienceParticipants,
  );
  if (activeParticipantIds.length === 0) {
    return null;
  }

  const latestUserMessage = findLatestUserMessage(selectedChannel.messages);
  const latestUserMetadata = latestUserMessage?.metadata ?? {};
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
    preferredRecipientIds.length > 0 ? preferredRecipientIds : activeParticipantIds;
  const latestCompletedTurn = selectedChannel.roomRouting.workflow.turnHistory[0] ?? null;
  const workflowShape = normalizeWorkflowShape(
    latestUserMetadata.workflowShape
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
