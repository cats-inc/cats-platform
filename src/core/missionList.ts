import type {
  CatsCoreState,
  MissionRecord,
  MissionRecordStatus,
} from './types.js';

export interface CoreMissionListQuery {
  managedWorkIds?: string[];
  conversationIds?: string[];
  sourceTurnIds?: string[];
  sourceLaneIds?: string[];
  assignedAgentIds?: string[];
  statuses?: MissionRecordStatus[];
  runIds?: string[];
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
  mission: MissionRecord,
  query: CoreMissionListQuery,
): boolean {
  if (
    query.managedWorkIds
    && !query.managedWorkIds.includes(mission.managedWorkId ?? '')
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(mission.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.sourceTurnIds
    && !query.sourceTurnIds.includes(mission.sourceTurnId ?? '')
  ) {
    return false;
  }
  if (
    query.sourceLaneIds
    && !query.sourceLaneIds.includes(mission.sourceLaneId ?? '')
  ) {
    return false;
  }
  if (
    query.assignedAgentIds
    && !query.assignedAgentIds.includes(mission.assignedAgentId ?? '')
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(mission.status)
  ) {
    return false;
  }
  if (
    query.runIds
    && !query.runIds.includes(String(mission.metadata.runId ?? ''))
  ) {
    return false;
  }

  return true;
}

export function listMissions(
  core: CatsCoreState,
  query: CoreMissionListQuery = {},
): MissionRecord[] {
  return core.missions
    .filter((mission) => matchesQuery(mission, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
