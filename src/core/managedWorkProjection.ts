import type {
  CatsCoreState,
  CoreActorRecord,
  CoreConversationRecord,
  CoreProjectRecord,
  CoreRunRecord,
  CoreRunStatus,
  CoreTaskRecord,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
  MissionRecord,
  MissionRecordStatus,
} from './types.js';

export interface CoreManagedWorkProjectionItem {
  workItem: CoreWorkItemRecord;
  project: CoreProjectRecord | null;
  conversation: CoreConversationRecord | null;
  owner: CoreActorRecord | null;
  assignedActors: CoreActorRecord[];
  linkedTask: CoreTaskRecord | null;
  linkedMissions: MissionRecord[];
  latestMission: MissionRecord | null;
  latestRun: CoreRunRecord | null;
  updatedAt: string;
}

export interface CoreManagedWorkProjectionSummary {
  total: number;
  draft: number;
  planned: number;
  ready: number;
  in_progress: number;
  blocked: number;
  completed: number;
  cancelled: number;
  archived: number;
  withTask: number;
  withMission: number;
  withRun: number;
}

export interface CoreManagedWorkProjection {
  summary: CoreManagedWorkProjectionSummary;
  items: CoreManagedWorkProjectionItem[];
}

export interface CoreManagedWorkProjectionQuery {
  workItemIds?: string[];
  workItemStatuses?: CoreWorkItemStatus[];
  projectIds?: string[];
  conversationIds?: string[];
  ownerActorIds?: string[];
  assignedActorIds?: string[];
  taskIds?: string[];
  missionStatuses?: MissionRecordStatus[];
  runStatuses?: CoreRunStatus[];
  hasTask?: boolean;
  hasMission?: boolean;
  hasRun?: boolean;
  limit?: number;
}

function buildEmptySummary(): CoreManagedWorkProjectionSummary {
  return {
    total: 0,
    draft: 0,
    planned: 0,
    ready: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
    withTask: 0,
    withMission: 0,
    withRun: 0,
  };
}

function resolveMissionRunId(mission: MissionRecord): string | null {
  const value = mission.metadata.runId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function compareRecordsByUpdatedAt(
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
  item: CoreManagedWorkProjectionItem,
  query: CoreManagedWorkProjectionQuery,
): boolean {
  if (query.workItemIds && !query.workItemIds.includes(item.workItem.id)) {
    return false;
  }
  if (
    query.workItemStatuses
    && !query.workItemStatuses.includes(item.workItem.status)
  ) {
    return false;
  }
  if (
    query.projectIds
    && !query.projectIds.includes(item.workItem.projectId ?? '')
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(item.workItem.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.ownerActorIds
    && !query.ownerActorIds.includes(item.workItem.ownerActorId ?? '')
  ) {
    return false;
  }
  if (
    query.assignedActorIds
    && !item.assignedActors.some((actor) => query.assignedActorIds!.includes(actor.id))
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
    query.missionStatuses
    && !item.linkedMissions.some((mission) => query.missionStatuses!.includes(mission.status))
  ) {
    return false;
  }
  if (
    query.runStatuses
    && (!item.latestRun || !query.runStatuses.includes(item.latestRun.status))
  ) {
    return false;
  }
  if (query.hasTask !== undefined && (item.linkedTask !== null) !== query.hasTask) {
    return false;
  }
  if (query.hasMission !== undefined && (item.linkedMissions.length > 0) !== query.hasMission) {
    return false;
  }
  if (query.hasRun !== undefined && (item.latestRun !== null) !== query.hasRun) {
    return false;
  }
  return true;
}

export function buildManagedWorkProjection(
  core: CatsCoreState,
  query: CoreManagedWorkProjectionQuery = {},
): CoreManagedWorkProjection {
  const items = core.workItems
    .map<CoreManagedWorkProjectionItem>((workItem) => {
      const linkedTask = workItem.taskId
        ? core.tasks.find((task) => task.id === workItem.taskId) ?? null
        : null;
      const project = workItem.projectId
        ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
        : null;
      const conversation = workItem.conversationId
        ? core.conversations.find((candidate) => candidate.id === workItem.conversationId) ?? null
        : null;
      const owner = core.actors.find((candidate) => candidate.id === workItem.ownerActorId) ?? null;
      const assignedActors = workItem.assignedActorIds
        .map((actorId) => core.actors.find((candidate) => candidate.id === actorId) ?? null)
        .filter((actor): actor is CoreActorRecord => actor !== null);
      const linkedMissions = core.missions
        .filter((mission) => mission.managedWorkId === workItem.id)
        .sort(compareRecordsByUpdatedAt);
      const latestMission = linkedMissions[0] ?? null;
      const latestRun = (() => {
        const runCandidates = new Map<string, CoreRunRecord>();
        for (const mission of linkedMissions) {
          const runId = resolveMissionRunId(mission);
          if (!runId) {
            continue;
          }
          const run = core.runs.find((candidate) => candidate.id === runId);
          if (run) {
            runCandidates.set(run.id, run);
          }
        }
        if (linkedTask) {
          for (const run of core.runs) {
            if (run.taskId === linkedTask.id) {
              runCandidates.set(run.id, run);
            }
          }
        }
        return Array.from(runCandidates.values()).sort(compareRecordsByUpdatedAt)[0] ?? null;
      })();
      const updatedAt = [
        workItem.updatedAt,
        linkedTask?.updatedAt ?? null,
        latestMission?.updatedAt ?? null,
        latestRun?.updatedAt ?? null,
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort((left, right) => right.localeCompare(left))[0] ?? workItem.updatedAt;

      return {
        workItem,
        project,
        conversation,
        owner,
        assignedActors,
        linkedTask,
        linkedMissions,
        latestMission,
        latestRun,
        updatedAt,
      };
    })
    .filter((item) => matchesQuery(item, query))
    .sort((left, right) => {
      const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedComparison !== 0) {
        return updatedComparison;
      }
      return left.workItem.id.localeCompare(right.workItem.id);
    })
    .slice(0, query.limit);

  const summary = items.reduce<CoreManagedWorkProjectionSummary>((accumulator, item) => {
    accumulator.total += 1;
    accumulator[item.workItem.status] += 1;
    if (item.linkedTask) {
      accumulator.withTask += 1;
    }
    if (item.linkedMissions.length > 0) {
      accumulator.withMission += 1;
    }
    if (item.latestRun) {
      accumulator.withRun += 1;
    }
    return accumulator;
  }, buildEmptySummary());

  return {
    summary,
    items,
  };
}
