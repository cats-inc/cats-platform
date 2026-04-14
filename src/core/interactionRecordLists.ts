import type {
  CatsCoreState,
  LaneRecord,
  LaneRecordStatus,
  SegmentRecord,
  SegmentRecordKind,
  SegmentRecordStatus,
  TurnRecord,
  TurnRecordKind,
  TurnRecordStatus,
} from './types.js';

export interface CoreTurnListQuery {
  conversationIds?: string[];
  sourceParticipantIds?: string[];
  kinds?: TurnRecordKind[];
  statuses?: TurnRecordStatus[];
  limit?: number;
}

export interface CoreLaneListQuery {
  conversationIds?: string[];
  turnIds?: string[];
  participantIds?: string[];
  agentIds?: string[];
  statuses?: LaneRecordStatus[];
  limit?: number;
}

export interface CoreSegmentListQuery {
  conversationIds?: string[];
  turnIds?: string[];
  laneIds?: string[];
  sessionIds?: string[];
  kinds?: SegmentRecordKind[];
  statuses?: SegmentRecordStatus[];
  limit?: number;
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function compareByCreatedAt(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  const createdComparison = right.createdAt.localeCompare(left.createdAt);
  if (createdComparison !== 0) {
    return createdComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesTurnQuery(
  turn: TurnRecord,
  query: CoreTurnListQuery,
): boolean {
  if (
    query.conversationIds
    && !query.conversationIds.includes(turn.conversationId)
  ) {
    return false;
  }
  if (
    query.sourceParticipantIds
    && !query.sourceParticipantIds.includes(turn.sourceParticipantId ?? '')
  ) {
    return false;
  }
  if (
    query.kinds
    && !query.kinds.includes(turn.kind)
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(turn.status)
  ) {
    return false;
  }
  return true;
}

function matchesLaneQuery(
  lane: LaneRecord,
  query: CoreLaneListQuery,
): boolean {
  if (
    query.conversationIds
    && !query.conversationIds.includes(lane.conversationId)
  ) {
    return false;
  }
  if (
    query.turnIds
    && !query.turnIds.includes(lane.turnId)
  ) {
    return false;
  }
  if (
    query.participantIds
    && !query.participantIds.includes(lane.participantId ?? '')
  ) {
    return false;
  }
  if (
    query.agentIds
    && !query.agentIds.includes(lane.agentId ?? '')
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(lane.status)
  ) {
    return false;
  }
  return true;
}

function matchesSegmentQuery(
  segment: SegmentRecord,
  query: CoreSegmentListQuery,
): boolean {
  if (
    query.conversationIds
    && !query.conversationIds.includes(segment.conversationId)
  ) {
    return false;
  }
  if (
    query.turnIds
    && !query.turnIds.includes(segment.turnId)
  ) {
    return false;
  }
  if (
    query.laneIds
    && !query.laneIds.includes(segment.laneId)
  ) {
    return false;
  }
  if (
    query.sessionIds
    && !query.sessionIds.includes(segment.sessionId ?? '')
  ) {
    return false;
  }
  if (
    query.kinds
    && !query.kinds.includes(segment.kind)
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(segment.status)
  ) {
    return false;
  }
  return true;
}

export function listTurns(
  core: CatsCoreState,
  query: CoreTurnListQuery = {},
): TurnRecord[] {
  return core.turns
    .filter((turn) => matchesTurnQuery(turn, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listLanes(
  core: CatsCoreState,
  query: CoreLaneListQuery = {},
): LaneRecord[] {
  return core.lanes
    .filter((lane) => matchesLaneQuery(lane, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listSegments(
  core: CatsCoreState,
  query: CoreSegmentListQuery = {},
): SegmentRecord[] {
  return core.segments
    .filter((segment) => matchesSegmentQuery(segment, query))
    .sort(compareByCreatedAt)
    .slice(0, query.limit);
}
