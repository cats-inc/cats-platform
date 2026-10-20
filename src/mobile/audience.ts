/**
 * The audience of a mobile send (SPEC-125 FR-6): a DM goes to its cat; any
 * other conversation names one or more of its participants. The composer
 * starts with every participant and lets the user narrow it, keeping at least
 * one.
 */
export interface MobileChannelParticipant {
  participantId: string;
  name: string;
  status: 'active' | 'removed';
  avatarColor: string | null;
}

/** The fields of `GET /api/channels/:id` the mobile composer reads. */
export interface MobileChannelDetail {
  id: string;
  channelKind?: 'direct_message' | 'chat_channel' | null;
  roomRouting?: { mode?: string | null } | null;
  assignedParticipants?: MobileChannelParticipant[];
}

export interface MobileChannelDetailPayload {
  channel: MobileChannelDetail;
}

export interface MobileAudience {
  direct: boolean;
  participants: MobileChannelParticipant[];
}

export interface MobileSendChannelMessageInput {
  body: string;
  messageMetadata?: { recipientParticipantIds: string[] };
}

export function selectMobileAudience(channel: MobileChannelDetail): MobileAudience {
  return {
    direct: channel.channelKind === 'direct_message' || channel.roomRouting?.mode === 'direct_message',
    participants: (channel.assignedParticipants ?? []).filter((participant) => participant.status === 'active'),
  };
}

/** The participants a send names: the selection still in the room, else everyone. */
export function resolveMobileRecipientIds(
  audience: MobileAudience,
  selectedIds: readonly string[] | null,
): string[] {
  if (audience.direct) {
    return [];
  }
  const selected = new Set(selectedIds ?? []);
  const narrowed = audience.participants
    .filter((participant) => selected.has(participant.participantId))
    .map((participant) => participant.participantId);
  return narrowed.length > 0
    ? narrowed
    : audience.participants.map((participant) => participant.participantId);
}

/** Toggles one participant in or out of the audience; the last one stays. */
export function toggleMobileAudienceSelection(
  audience: MobileAudience,
  selectedIds: readonly string[] | null,
  participantId: string,
): string[] {
  const current = resolveMobileRecipientIds(audience, selectedIds);
  if (current.includes(participantId)) {
    return current.length > 1 ? current.filter((id) => id !== participantId) : current;
  }
  return audience.participants
    .map((participant) => participant.participantId)
    .filter((id) => id === participantId || current.includes(id));
}

export function buildMobileSendInput(
  body: string,
  recipientParticipantIds: readonly string[],
): MobileSendChannelMessageInput {
  return recipientParticipantIds.length > 0
    ? { body, messageMetadata: { recipientParticipantIds: [...recipientParticipantIds] } }
    : { body };
}
