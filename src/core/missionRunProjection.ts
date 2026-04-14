import type {
  CatsCoreState,
  CoreActorRecord,
  CoreConversationRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
  LaneRecord,
  MissionRecord,
  MissionRecordStatus,
  TurnRecord,
} from './types.js';

export interface CoreMissionRunProjectionItem {
  mission: MissionRecord;
  managedWork: CoreWorkItemRecord | null;
  conversation: CoreConversationRecord | null;
  sourceTurn: TurnRecord | null;
  sourceLane: LaneRecord | null;
  assignedAgent: CoreActorRecord | null;
  linkedTask: CoreTaskRecord | null;
  linkedRun: CoreRunRecord | null;
  updatedAt: string;
}

export interface CoreMissionRunProjectionSummary {
  total: number;
  draft: number;
  planned: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface CoreMissionRunProjection {
  summary: CoreMissionRunProjectionSummary;
  items: CoreMissionRunProjectionItem[];
}

export interface CoreMissionRunProjectionQuery {
  missionStatuses?: MissionRecordStatus[];
  conversationIds?: string[];
  assignedAgentIds?: string[];
  managedWorkIds?: string[];
  taskIds?: string[];
  runIds?: string[];
  hasRun?: boolean;
  limit?: number;
}

function buildEmptySummary(): CoreMissionRunProjectionSummary {
  return {
    total: 0,
    draft: 0,
    planned: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
}

function resolveMissionRunId(mission: MissionRecord): string | null {
  const value = mission.metadata.runId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function matchesQuery(
  item: CoreMissionRunProjectionItem,
  query: CoreMissionRunProjectionQuery,
): boolean {
  if (
    query.missionStatuses
    && !query.missionStatuses.includes(item.mission.status)
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(item.mission.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.assignedAgentIds
    && !query.assignedAgentIds.includes(item.mission.assignedAgentId ?? '')
  ) {
    return false;
  }
  if (
    query.managedWorkIds
    && !query.managedWorkIds.includes(item.mission.managedWorkId ?? '')
  ) {
    return false;
  }
  if (
    query.taskIds
    && !query.taskIds.includes(item.linkedTask?.id ?? '')
  ) {
    return false;
  }
  if (
    query.runIds
    && !query.runIds.includes(item.linkedRun?.id ?? '')
  ) {
    return false;
  }
  if (query.hasRun !== undefined && (item.linkedRun !== null) !== query.hasRun) {
    return false;
  }
  return true;
}

export function buildMissionRunProjection(
  core: CatsCoreState,
  query: CoreMissionRunProjectionQuery = {},
): CoreMissionRunProjection {
  const items = core.missions
    .map<CoreMissionRunProjectionItem>((mission) => {
      const managedWork = mission.managedWorkId
        ? core.workItems.find((workItem) => workItem.id === mission.managedWorkId) ?? null
        : null;
      const linkedRun = (() => {
        const runId = resolveMissionRunId(mission);
        return runId
          ? core.runs.find((run) => run.id === runId) ?? null
          : null;
      })();
      const conversation = mission.conversationId
        ? core.conversations.find((candidate) => candidate.id === mission.conversationId) ?? null
        : null;
      const sourceTurn = mission.sourceTurnId
        ? core.turns.find((candidate) => candidate.id === mission.sourceTurnId) ?? null
        : null;
      const sourceLane = mission.sourceLaneId
        ? core.lanes.find((candidate) => candidate.id === mission.sourceLaneId) ?? null
        : null;
      const assignedAgent = mission.assignedAgentId
        ? core.actors.find((candidate) => candidate.id === mission.assignedAgentId) ?? null
        : null;
      const linkedTask = managedWork?.taskId
        ? core.tasks.find((task) => task.id === managedWork.taskId) ?? null
        : null;
      const updatedAt = [
        mission.updatedAt,
        linkedRun?.updatedAt ?? null,
        managedWork?.updatedAt ?? null,
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort((left, right) => right.localeCompare(left))[0] ?? mission.updatedAt;

      return {
        mission,
        managedWork,
        conversation,
        sourceTurn,
        sourceLane,
        assignedAgent,
        linkedTask,
        linkedRun,
        updatedAt,
      };
    })
    .filter((item) => matchesQuery(item, query))
    .sort((left, right) => {
      const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedComparison !== 0) {
        return updatedComparison;
      }
      return left.mission.id.localeCompare(right.mission.id);
    })
    .slice(0, query.limit);

  const summary = items.reduce<CoreMissionRunProjectionSummary>((accumulator, item) => {
    accumulator.total += 1;
    accumulator[item.mission.status] += 1;
    return accumulator;
  }, buildEmptySummary());

  return {
    summary,
    items,
  };
}
