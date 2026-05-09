import { resolveRunsForMission } from './missionRunResolution.js';
import {
  classifyMissionVisibility,
  type MissionVisibility,
} from './missionVisibility.js';
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
  /**
   * Primary run for this mission. Equals `runs[0] ?? null`. Preserves
   * the legacy single-run shape for callers that only consume one run
   * per mission. New code that needs to surface every anchored run
   * should consume `runs` instead — see SHA cf1354859 / d2bd5a7c4.
   */
  linkedRun: CoreRunRecord | null;
  /**
   * Every run anchored on this mission via either `mission.metadata.runId`
   * (mission-claimed) or `run.metadata.missionId` (run back-reference),
   * deduplicated. The mission-claimed run, if any, appears first.
   */
  runs: CoreRunRecord[];
  visibility: MissionVisibility;
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
  missionIds?: string[];
  missionStatuses?: MissionRecordStatus[];
  conversationIds?: string[];
  assignedAgentIds?: string[];
  managedWorkIds?: string[];
  taskIds?: string[];
  runIds?: string[];
  hasRun?: boolean;
  visibilities?: MissionVisibility[];
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

function matchesQuery(
  item: CoreMissionRunProjectionItem,
  query: CoreMissionRunProjectionQuery,
): boolean {
  if (query.missionIds && !query.missionIds.includes(item.mission.id)) {
    return false;
  }
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
  if (query.taskIds) {
    const taskIdSet = new Set(query.taskIds);
    const linkedTaskMatches = item.linkedTask !== null
      && taskIdSet.has(item.linkedTask.id);
    const runTaskMatches = item.runs.some((run) =>
      run.taskId !== null && taskIdSet.has(run.taskId));
    if (!linkedTaskMatches && !runTaskMatches) {
      return false;
    }
  }
  if (query.runIds) {
    const runIdSet = new Set(query.runIds);
    if (!item.runs.some((run) => runIdSet.has(run.id))) {
      return false;
    }
  }
  if (query.hasRun !== undefined && (item.runs.length > 0) !== query.hasRun) {
    return false;
  }
  if (query.visibilities && !query.visibilities.includes(item.visibility)) {
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
      const runs = resolveRunsForMission(core.runs, mission);
      const linkedRun = runs[0] ?? null;
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
      const linkedTask = (() => {
        // Primary: managed work supplies the task explicitly.
        if (managedWork?.taskId) {
          return core.tasks.find((task) => task.id === managedWork.taskId) ?? null;
        }
        // Fallback: after the mission-run resolver unification, runs
        // can carry their own taskId. Surface the first run-anchored
        // task so consumers picking `linkedTask` for a "primary task"
        // signal stay symmetrical with the runs[].taskId entries that
        // taskIds filter now matches.
        for (const run of runs) {
          if (run.taskId !== null) {
            return core.tasks.find((task) => task.id === run.taskId) ?? null;
          }
        }
        return null;
      })();
      const latestRunUpdatedAt = runs
        .map((run) => run.updatedAt)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort((left, right) => right.localeCompare(left))[0] ?? null;
      const updatedAt = [
        mission.updatedAt,
        latestRunUpdatedAt,
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
        runs,
        visibility: classifyMissionVisibility(mission),
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
