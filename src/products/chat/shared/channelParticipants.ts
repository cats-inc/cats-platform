import type {
  ChannelCatAssignment,
  ChannelParticipantAssignment,
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelState,
  ChatChannelView,
} from '../api/contracts.js';

export type ResolvedChannelParticipant = ChatChannelParticipant | ChatChannelCat;

function mapCatAssignmentToParticipantAssignment(
  assignment: ChannelCatAssignment,
): ChannelParticipantAssignment {
  return {
    participantId: assignment.participantId,
    sourceKind: assignment.sourceKind,
    sourceRefId: assignment.sourceRefId,
    name: assignment.name,
    status: assignment.status,
    roles: structuredClone(assignment.roles),
    roleHint: assignment.roleHint,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    execution: structuredClone(assignment.execution),
  };
}

export function resolveChannelParticipantAssignments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  options: { clone?: boolean } = {},
): ChannelParticipantAssignment[] {
  if (Array.isArray(channel.participantAssignments) && channel.participantAssignments.length > 0) {
    return options.clone ? structuredClone(channel.participantAssignments) : channel.participantAssignments;
  }

  return channel.catAssignments.map(mapCatAssignmentToParticipantAssignment);
}

export function resolveAssignedParticipants(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
): ResolvedChannelParticipant[] {
  return channel.assignedParticipants && channel.assignedParticipants.length > 0
    ? channel.assignedParticipants
    : channel.assignedCats;
}

export function activeAssignedParticipants(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
): ResolvedChannelParticipant[] {
  return resolveAssignedParticipants(channel).filter((participant) => participant.status === 'active');
}

export function findAssignedParticipant(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
  participantId: string,
): ResolvedChannelParticipant | null {
  return resolveAssignedParticipants(channel).find(
    (participant) => participant.participantId === participantId,
  ) ?? null;
}

export function resolveParticipantCatId(
  participant: Pick<ChatChannelParticipant, 'sourceKind' | 'sourceRefId'>
    & Partial<Pick<ChatChannelCat, 'catId'>>,
): string | null {
  if ('catId' in participant && typeof participant.catId === 'string' && participant.catId.length > 0) {
    return participant.catId;
  }

  return participant.sourceKind === 'cat'
    ? participant.sourceRefId
    : null;
}

export function resolveParticipantExecutionAssignments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  participantId: string,
): {
  participantAssignment: ChannelParticipantAssignment | null;
  catAssignment: ChannelCatAssignment | null;
} {
  const participantAssignment = resolveChannelParticipantAssignments(channel).find(
    (candidate) => candidate.participantId === participantId,
  ) ?? null;
  const catRef = participantAssignment ? resolveParticipantCatId(participantAssignment) : null;
  const catAssignment = channel.catAssignments.find((candidate) =>
    candidate.participantId === participantId
    || candidate.catId === participantId
    || (catRef != null && candidate.catId === catRef)
  ) ?? null;

  return { participantAssignment, catAssignment };
}
