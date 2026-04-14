import type {
  CatsCoreState,
  SessionRecord,
  SessionRecordStatus,
} from './types.js';

export interface CoreSessionListQuery {
  conversationIds?: string[];
  turnIds?: string[];
  laneIds?: string[];
  participantIds?: string[];
  agentIds?: string[];
  transportBindingIds?: string[];
  runtimeKeys?: string[];
  statuses?: SessionRecordStatus[];
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

function matchesQuery(
  session: SessionRecord,
  query: CoreSessionListQuery,
): boolean {
  if (
    query.conversationIds
    && !query.conversationIds.includes(session.conversationId)
  ) {
    return false;
  }
  if (
    query.turnIds
    && !query.turnIds.includes(session.turnId ?? '')
  ) {
    return false;
  }
  if (
    query.laneIds
    && !query.laneIds.includes(session.laneId ?? '')
  ) {
    return false;
  }
  if (
    query.participantIds
    && !query.participantIds.includes(session.participantId ?? '')
  ) {
    return false;
  }
  if (
    query.agentIds
    && !query.agentIds.includes(session.agentId ?? '')
  ) {
    return false;
  }
  if (
    query.transportBindingIds
    && !query.transportBindingIds.includes(session.transportBindingId ?? '')
  ) {
    return false;
  }
  if (
    query.runtimeKeys
    && !query.runtimeKeys.includes(session.runtimeKey ?? '')
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(session.status)
  ) {
    return false;
  }

  return true;
}

export function listSessions(
  core: CatsCoreState,
  query: CoreSessionListQuery = {},
): SessionRecord[] {
  return core.sessions
    .filter((session) => matchesQuery(session, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
