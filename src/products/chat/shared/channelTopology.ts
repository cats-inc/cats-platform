import type { ChannelCatAssignment } from '../api/contracts.js';
import type { RoomRoutingMode } from '../../../shared/roomRouting.js';

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
