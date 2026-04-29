import type {
  ChannelParticipantAssignment,
  ChannelCatAssignment,
  ChatChannelKind,
} from '../api/contracts.js';
import type { RoomRoutingMode } from '../../../shared/roomRouting.js';

type ChannelParticipantTopologyRef = Pick<
  ChannelParticipantAssignment,
  'participantId' | 'status'
> | Pick<ChannelCatAssignment, 'catId' | 'status'> | {
  participantId: string;
  status?: string | null;
} | {
  catId: string;
  status?: string | null;
};
type ChannelTopologyCarrier = {
  channelKind?: ChatChannelKind | null;
  pendingProvider?: string | null;
  roomRouting?: { mode?: RoomRoutingMode | null } | null;
  participantAssignments?: readonly ChannelParticipantTopologyRef[] | null;
  catAssignments?: readonly ChannelParticipantTopologyRef[] | null;
  assignedParticipants?: readonly ChannelParticipantTopologyRef[] | null;
  assignedCats?: readonly ChannelParticipantTopologyRef[] | null;
};
type ChannelTopologySummaryRef = {
  channelKind?: ChatChannelKind | null;
  roomMode?: RoomRoutingMode | null;
};

function readTopologyParticipantId(assignment: ChannelParticipantTopologyRef): string {
  return 'participantId' in assignment ? assignment.participantId : assignment.catId;
}

function dedupeChannelAssignments<T extends ChannelParticipantTopologyRef>(
  assignments: readonly T[],
): T[] {
  const seenParticipantIds = new Set<string>();
  const normalized: T[] = [];
  for (const assignment of assignments) {
    const participantId = readTopologyParticipantId(assignment);
    if (!participantId || seenParticipantIds.has(participantId)) {
      continue;
    }
    seenParticipantIds.add(participantId);
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
  if (input.channelKind === 'direct_lane') {
    return 'direct_lane';
  }
  if (input.channelKind === 'multi_cat_room') {
    return inferred === 'boss_thread' && input.participants.length === 0
      ? 'boss_thread'
      : 'multi_cat_room';
  }
  if (input.channelKind === 'boss_thread') {
    return inferred === 'multi_cat_room' ? 'multi_cat_room' : 'boss_thread';
  }

  return inferred;
}

function readChannelTopologyParticipants(
  channel: ChannelTopologyCarrier,
): readonly ChannelParticipantTopologyRef[] {
  if (channel.assignedParticipants && channel.assignedParticipants.length > 0) {
    return channel.assignedParticipants;
  }
  if (channel.assignedCats && channel.assignedCats.length > 0) {
    return channel.assignedCats;
  }
  if (channel.participantAssignments && channel.participantAssignments.length > 0) {
    return channel.participantAssignments;
  }
  return channel.catAssignments ?? [];
}

export function countActiveChannelParticipants(
  channel: ChannelTopologyCarrier,
): number {
  return countActiveParticipants(readChannelTopologyParticipants(channel));
}

export function hasActiveChannelParticipants(
  channel: ChannelTopologyCarrier,
): boolean {
  return countActiveChannelParticipants(channel) > 0;
}

export function resolveChannelKindForChannel(
  channel: ChannelTopologyCarrier,
): ChatChannelKind {
  return resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: channel.roomRouting?.mode === 'direct_cat_chat' ? 'direct_cat_chat' : 'boss_chat',
    participants: readChannelTopologyParticipants(channel),
  });
}

export function isDirectLaneChannel(channel: ChannelTopologyCarrier): boolean {
  return resolveChannelKindForChannel(channel) === 'direct_lane';
}

export function isProviderSoloThreadChannel(channel: ChannelTopologyCarrier): boolean {
  return !isDirectLaneChannel(channel)
    && !hasActiveChannelParticipants(channel)
    && Boolean(channel.pendingProvider?.trim());
}

export function isSoloThreadChannel(channel: ChannelTopologyCarrier): boolean {
  return !isDirectLaneChannel(channel)
    && !hasActiveChannelParticipants(channel);
}

export function isParticipantRoomChannel(channel: ChannelTopologyCarrier): boolean {
  return !isDirectLaneChannel(channel)
    && hasActiveChannelParticipants(channel);
}

export function supportsParticipantAudienceSelection(channel: ChannelTopologyCarrier): boolean {
  return isParticipantRoomChannel(channel);
}

export function isDirectLaneSummary(
  channel: ChannelTopologySummaryRef,
): boolean {
  return resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: channel.roomMode === 'direct_cat_chat' ? 'direct_cat_chat' : 'boss_chat',
    participants: [],
  }) === 'direct_lane';
}

export function resolveDirectLaneRecipientId(
  assignments: readonly ChannelParticipantTopologyRef[],
  defaultRecipientId: string | null | undefined,
): string | null {
  const dedupedAssignments = dedupeChannelAssignments(assignments);
  if (
    defaultRecipientId
    && dedupedAssignments.some((assignment) => readTopologyParticipantId(assignment) === defaultRecipientId)
  ) {
    return defaultRecipientId;
  }

  const activeAssignment = dedupedAssignments.find((assignment) => assignment.status === 'active');
  const fallbackAssignment = dedupedAssignments[0] ?? null;

  if (activeAssignment) {
    return readTopologyParticipantId(activeAssignment);
  }
  if (fallbackAssignment) {
    return readTopologyParticipantId(fallbackAssignment);
  }
  return defaultRecipientId ?? null;
}

export function normalizeChannelAssignmentsForRoomMode<T extends ChannelParticipantTopologyRef>(
  assignments: readonly T[],
  roomMode: RoomRoutingMode,
  defaultRecipientId: string | null | undefined,
): T[] {
  const dedupedAssignments = dedupeChannelAssignments(assignments);
  if (roomMode !== 'direct_cat_chat') {
    return dedupedAssignments;
  }

  const directLeadId = resolveDirectLaneRecipientId(
    dedupedAssignments,
    defaultRecipientId,
  );
  if (!directLeadId) {
    return [];
  }

  return dedupedAssignments.filter((assignment) => readTopologyParticipantId(assignment) === directLeadId);
}
