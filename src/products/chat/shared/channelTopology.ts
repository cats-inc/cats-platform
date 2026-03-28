import type {
  ChannelCatAssignment,
  ChatChannelKind,
} from '../api/contracts.js';
import type { RoomRoutingMode } from '../../../shared/roomRouting.js';

type ChannelParticipantTopologyRef = Pick<ChannelCatAssignment, 'catId' | 'status'>;

function dedupeChannelAssignments(
  assignments: readonly ChannelCatAssignment[],
): ChannelCatAssignment[] {
  const seenCatIds = new Set<string>();
  const normalized: ChannelCatAssignment[] = [];
  for (const assignment of assignments) {
    if (seenCatIds.has(assignment.catId)) {
      continue;
    }
    seenCatIds.add(assignment.catId);
    normalized.push(assignment);
  }
  return normalized;
}

function countActiveParticipants(
  assignments: readonly ChannelParticipantTopologyRef[],
): number {
  return assignments.filter((assignment) => assignment.status === 'active').length;
}

export function inferChannelKind(input: {
  roomMode: RoomRoutingMode;
  participants: readonly ChannelParticipantTopologyRef[];
}): ChatChannelKind {
  if (input.roomMode === 'direct_cat_chat') {
    return 'direct_lane';
  }

  return countActiveParticipants(input.participants) > 1
    ? 'multi_cat_room'
    : 'boss_thread';
}

export function resolveChannelKind(input: {
  channelKind?: ChatChannelKind | null;
  roomMode: RoomRoutingMode;
  participants: readonly ChannelParticipantTopologyRef[];
}): ChatChannelKind {
  const inferred = inferChannelKind({
    roomMode: input.roomMode,
    participants: input.participants,
  });
  if (
    (input.channelKind === 'boss_thread'
    || input.channelKind === 'direct_lane'
    || input.channelKind === 'multi_cat_room')
    && input.channelKind === inferred
  ) {
    return input.channelKind;
  }

  return inferred;
}

export function isDirectLaneChannel(input: {
  channelKind?: ChatChannelKind | null;
  roomMode: RoomRoutingMode;
  participants: readonly ChannelParticipantTopologyRef[];
}): boolean {
  return resolveChannelKind(input) === 'direct_lane';
}

export function resolveDirectLaneLeadParticipantId(
  assignments: readonly ChannelCatAssignment[],
  leadParticipantId: string | null | undefined,
): string | null {
  const dedupedAssignments = dedupeChannelAssignments(assignments);
  if (
    leadParticipantId
    && dedupedAssignments.some((assignment) => assignment.catId === leadParticipantId)
  ) {
    return leadParticipantId;
  }

  return dedupedAssignments.find((assignment) => assignment.status === 'active')?.catId
    ?? dedupedAssignments[0]?.catId
    ?? leadParticipantId
    ?? null;
}

export function normalizeChannelAssignmentsForRoomMode(
  assignments: readonly ChannelCatAssignment[],
  roomMode: RoomRoutingMode,
  leadParticipantId: string | null | undefined,
): ChannelCatAssignment[] {
  const dedupedAssignments = dedupeChannelAssignments(assignments);
  if (roomMode !== 'direct_cat_chat') {
    return dedupedAssignments;
  }

  const directLeadId = resolveDirectLaneLeadParticipantId(
    dedupedAssignments,
    leadParticipantId,
  );
  if (!directLeadId) {
    return [];
  }

  return dedupedAssignments.filter((assignment) => assignment.catId === directLeadId);
}
