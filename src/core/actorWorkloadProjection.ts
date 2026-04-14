import type {
  CatsCoreState,
  CoreActorKind,
  CoreActorRecord,
  CoreActorSource,
  CoreActorStatus,
  CoreConversationRecord,
  CoreRunRecord,
  MissionRecord,
  MissionRecordStatus,
  ParticipantRecord,
  SessionRecord,
  TransportBindingPlatform,
  TransportBindingRecord,
  CoreWorkItemRecord,
} from './types.js';

export interface CoreActorWorkloadProjectionItem {
  actor: CoreActorRecord;
  activeParticipants: ParticipantRecord[];
  activeConversations: CoreConversationRecord[];
  assignedManagedWork: CoreWorkItemRecord[];
  assignedMissions: MissionRecord[];
  latestRun: CoreRunRecord | null;
  transportBindings: TransportBindingRecord[];
  latestSession: SessionRecord | null;
  updatedAt: string;
}

export interface CoreActorWorkloadProjectionSummary {
  total: number;
  active: number;
  archived: number;
  withActiveParticipant: number;
  withManagedWork: number;
  withMission: number;
  withTransport: number;
  withActiveSession: number;
  queuedMissionCount: number;
  runningMissionCount: number;
}

export interface CoreActorWorkloadProjection {
  summary: CoreActorWorkloadProjectionSummary;
  items: CoreActorWorkloadProjectionItem[];
}

export interface CoreActorWorkloadProjectionQuery {
  actorIds?: string[];
  actorKinds?: CoreActorKind[];
  statuses?: CoreActorStatus[];
  sources?: CoreActorSource[];
  missionStatuses?: MissionRecordStatus[];
  platforms?: TransportBindingPlatform[];
  hasActiveParticipant?: boolean;
  hasManagedWork?: boolean;
  hasMission?: boolean;
  hasTransport?: boolean;
  hasActiveSession?: boolean;
  limit?: number;
}

function buildEmptySummary(): CoreActorWorkloadProjectionSummary {
  return {
    total: 0,
    active: 0,
    archived: 0,
    withActiveParticipant: 0,
    withManagedWork: 0,
    withMission: 0,
    withTransport: 0,
    withActiveSession: 0,
    queuedMissionCount: 0,
    runningMissionCount: 0,
  };
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

function resolveMissionRunId(mission: MissionRecord): string | null {
  const value = mission.metadata.runId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function matchesQuery(
  item: CoreActorWorkloadProjectionItem,
  query: CoreActorWorkloadProjectionQuery,
): boolean {
  if (query.actorIds && !query.actorIds.includes(item.actor.id)) {
    return false;
  }
  if (query.actorKinds && !query.actorKinds.includes(item.actor.kind)) {
    return false;
  }
  if (query.statuses && !query.statuses.includes(item.actor.status)) {
    return false;
  }
  if (query.sources && !query.sources.includes(item.actor.source)) {
    return false;
  }
  if (
    query.missionStatuses
    && !item.assignedMissions.some((mission) => query.missionStatuses!.includes(mission.status))
  ) {
    return false;
  }
  if (
    query.platforms
    && !item.transportBindings.some((binding) => query.platforms!.includes(binding.platform))
  ) {
    return false;
  }
  if (
    query.hasActiveParticipant !== undefined
    && (item.activeParticipants.length > 0) !== query.hasActiveParticipant
  ) {
    return false;
  }
  if (
    query.hasManagedWork !== undefined
    && (item.assignedManagedWork.length > 0) !== query.hasManagedWork
  ) {
    return false;
  }
  if (query.hasMission !== undefined && (item.assignedMissions.length > 0) !== query.hasMission) {
    return false;
  }
  if (
    query.hasTransport !== undefined
    && (item.transportBindings.length > 0) !== query.hasTransport
  ) {
    return false;
  }
  if (
    query.hasActiveSession !== undefined
    && ((item.latestSession?.status === 'active') !== query.hasActiveSession)
  ) {
    return false;
  }
  return true;
}

export function buildActorWorkloadProjection(
  core: CatsCoreState,
  query: CoreActorWorkloadProjectionQuery = {},
): CoreActorWorkloadProjection {
  const items = core.actors
    .map<CoreActorWorkloadProjectionItem>((actor) => {
      const activeParticipants = core.participants
        .filter((participant) => participant.agentId === actor.id && participant.status === 'active')
        .sort(compareByUpdatedAt);
      const activeConversationIds = Array.from(
        new Set(activeParticipants.map((participant) => participant.conversationId)),
      );
      const activeConversations = activeConversationIds
        .map((conversationId) => (
          core.conversations.find((conversation) => conversation.id === conversationId) ?? null
        ))
        .filter((conversation): conversation is CoreConversationRecord => conversation !== null);
      const assignedManagedWork = core.workItems
        .filter((workItem) => (
          workItem.ownerActorId === actor.id || workItem.assignedActorIds.includes(actor.id)
        ))
        .sort(compareByUpdatedAt);
      const assignedMissions = core.missions
        .filter((mission) => mission.assignedAgentId === actor.id)
        .sort(compareByUpdatedAt);
      const latestRun = (() => {
        const runCandidates = new Map<string, CoreRunRecord>();
        for (const mission of assignedMissions) {
          const runId = resolveMissionRunId(mission);
          if (!runId) {
            continue;
          }
          const run = core.runs.find((candidate) => candidate.id === runId);
          if (run) {
            runCandidates.set(run.id, run);
          }
        }
        return Array.from(runCandidates.values()).sort(compareByUpdatedAt)[0] ?? null;
      })();
      const transportBindings = core.transportBindings
        .filter((binding) => binding.agentId === actor.id)
        .sort(compareByUpdatedAt);
      const latestSession = core.sessions
        .filter((session) => (
          session.agentId === actor.id
          || transportBindings.some((binding) => binding.id === session.transportBindingId)
        ))
        .sort(compareByUpdatedAt)[0] ?? null;
      const updatedAt = [
        actor.updatedAt,
        activeParticipants[0]?.updatedAt ?? null,
        assignedManagedWork[0]?.updatedAt ?? null,
        assignedMissions[0]?.updatedAt ?? null,
        latestRun?.updatedAt ?? null,
        transportBindings[0]?.updatedAt ?? null,
        latestSession?.updatedAt ?? null,
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort((left, right) => right.localeCompare(left))[0] ?? actor.updatedAt;

      return {
        actor,
        activeParticipants,
        activeConversations,
        assignedManagedWork,
        assignedMissions,
        latestRun,
        transportBindings,
        latestSession,
        updatedAt,
      };
    })
    .filter((item) => matchesQuery(item, query))
    .sort((left, right) => {
      const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedComparison !== 0) {
        return updatedComparison;
      }
      return left.actor.id.localeCompare(right.actor.id);
    })
    .slice(0, query.limit);

  const summary = items.reduce<CoreActorWorkloadProjectionSummary>((accumulator, item) => {
    accumulator.total += 1;
    accumulator[item.actor.status] += 1;
    if (item.activeParticipants.length > 0) {
      accumulator.withActiveParticipant += 1;
    }
    if (item.assignedManagedWork.length > 0) {
      accumulator.withManagedWork += 1;
    }
    if (item.assignedMissions.length > 0) {
      accumulator.withMission += 1;
      accumulator.queuedMissionCount += item.assignedMissions.filter(
        (mission) => mission.status === 'queued',
      ).length;
      accumulator.runningMissionCount += item.assignedMissions.filter(
        (mission) => mission.status === 'running',
      ).length;
    }
    if (item.transportBindings.length > 0) {
      accumulator.withTransport += 1;
    }
    if (item.latestSession?.status === 'active') {
      accumulator.withActiveSession += 1;
    }
    return accumulator;
  }, buildEmptySummary());

  return {
    summary,
    items,
  };
}
