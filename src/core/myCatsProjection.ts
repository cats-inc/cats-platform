import { isActiveMission } from './missionStatus.js';
import type {
  AgentId,
  CatsCoreState,
  CoreActorKind,
  CoreActorRecord,
  CoreActorStatus,
  CoreArtifactRecord,
  CoreConversationRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
  MissionRecord,
} from './types.js';

export interface MyCatsAgentChatMetrics {
  conversationCount: number;
  lastConversationActivityAt: string | null;
}

export interface MyCatsAgentWorkMetrics {
  ownedWorkItemCount: number;
  assignedWorkItemCount: number;
  totalMissionCount: number;
  activeMissionCount: number;
  lastMissionUpdatedAt: string | null;
}

export interface MyCatsAgentCodeMetrics {
  taskCount: number;
  runCount: number;
  artifactCount: number;
  lastRunActivityAt: string | null;
}

export interface MyCatsAgentEntry {
  agent: CoreActorRecord;
  chat: MyCatsAgentChatMetrics;
  work: MyCatsAgentWorkMetrics;
  code: MyCatsAgentCodeMetrics;
  lastActivityAt: string | null;
}

export interface MyCatsProjectionSummary {
  totalAgents: number;
  byKind: Record<CoreActorKind, number>;
  byStatus: Record<CoreActorStatus, number>;
  agentsWithActiveMissions: number;
  agentsWithCodeRuns: number;
}

export interface MyCatsProjection {
  summary: MyCatsProjectionSummary;
  agents: MyCatsAgentEntry[];
}

export interface MyCatsProjectionQuery {
  agentIds?: AgentId[];
  agentKinds?: CoreActorKind[];
  agentStatuses?: CoreActorStatus[];
  hasActiveMission?: boolean;
  hasCodeRun?: boolean;
  limit?: number;
}

const ACTOR_KINDS: readonly CoreActorKind[] = [
  'owner',
  'orchestrator',
  'worker',
  'stakeholder',
  'bot',
  'resource',
];

const ACTOR_STATUSES: readonly CoreActorStatus[] = ['active', 'archived'];

function buildEmptySummary(): MyCatsProjectionSummary {
  return {
    totalAgents: 0,
    byKind: ACTOR_KINDS.reduce<Record<CoreActorKind, number>>((accumulator, kind) => {
      accumulator[kind] = 0;
      return accumulator;
    }, {} as Record<CoreActorKind, number>),
    byStatus: ACTOR_STATUSES.reduce<Record<CoreActorStatus, number>>(
      (accumulator, status) => {
        accumulator[status] = 0;
        return accumulator;
      },
      {} as Record<CoreActorStatus, number>,
    ),
    agentsWithActiveMissions: 0,
    agentsWithCodeRuns: 0,
  };
}

function maxIso(...values: Array<string | null | undefined>): string | null {
  let result: string | null = null;
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    if (result === null || value.localeCompare(result) > 0) {
      result = value;
    }
  }
  return result;
}

function indexConversationKindById(
  conversations: CoreConversationRecord[],
): Map<string, CoreConversationRecord> {
  const index = new Map<string, CoreConversationRecord>();
  for (const conversation of conversations) {
    index.set(conversation.id, conversation);
  }
  return index;
}

function isCodeConversation(
  conversation: CoreConversationRecord | undefined,
): boolean {
  return conversation?.kind === 'code_thread';
}

function buildAgentChatMetrics(
  agentId: string,
  conversations: CoreConversationRecord[],
): MyCatsAgentChatMetrics {
  let conversationCount = 0;
  let lastConversationActivityAt: string | null = null;
  for (const conversation of conversations) {
    if (!conversation.participantActorIds.includes(agentId)) {
      continue;
    }
    conversationCount += 1;
    lastConversationActivityAt = maxIso(
      lastConversationActivityAt,
      conversation.lastMessageAt,
      conversation.updatedAt,
    );
  }
  return { conversationCount, lastConversationActivityAt };
}

function buildAgentWorkMetrics(
  agentId: string,
  workItems: CoreWorkItemRecord[],
  missions: MissionRecord[],
): MyCatsAgentWorkMetrics {
  let ownedWorkItemCount = 0;
  let assignedWorkItemCount = 0;
  for (const workItem of workItems) {
    if (workItem.ownerActorId === agentId) {
      ownedWorkItemCount += 1;
    }
    if (workItem.assignedActorIds.includes(agentId)) {
      assignedWorkItemCount += 1;
    }
  }
  let totalMissionCount = 0;
  let activeMissionCount = 0;
  let lastMissionUpdatedAt: string | null = null;
  for (const mission of missions) {
    if (mission.assignedAgentId !== agentId) {
      continue;
    }
    totalMissionCount += 1;
    if (isActiveMission(mission)) {
      activeMissionCount += 1;
    }
    lastMissionUpdatedAt = maxIso(lastMissionUpdatedAt, mission.updatedAt);
  }
  return {
    ownedWorkItemCount,
    assignedWorkItemCount,
    totalMissionCount,
    activeMissionCount,
    lastMissionUpdatedAt,
  };
}

function buildAgentCodeMetrics(
  agentId: string,
  tasks: CoreTaskRecord[],
  runs: CoreRunRecord[],
  artifacts: CoreArtifactRecord[],
  conversationIndex: Map<string, CoreConversationRecord>,
): MyCatsAgentCodeMetrics {
  const codeTaskIds = new Set<string>();
  let taskCount = 0;
  for (const task of tasks) {
    const conversation = task.conversationId
      ? conversationIndex.get(task.conversationId)
      : undefined;
    if (!isCodeConversation(conversation)) {
      continue;
    }
    const isAssigned = task.assignedActorIds.includes(agentId)
      || task.orchestratorActorId === agentId
      || task.ownerActorId === agentId;
    if (!isAssigned) {
      continue;
    }
    taskCount += 1;
    codeTaskIds.add(task.id);
  }

  let runCount = 0;
  let lastRunActivityAt: string | null = null;
  // Track every run id that ended up in this agent's scope so the
  // artifact bridge below can attribute run-only artifacts (artifacts
  // with `runId` set but no `taskId` / `conversationId`) without
  // re-deriving the run scope rules.
  const codeRunIds = new Set<string>();
  for (const run of runs) {
    const conversation = run.conversationId
      ? conversationIndex.get(run.conversationId)
      : undefined;
    const taskInScope = run.taskId !== null && codeTaskIds.has(run.taskId);
    const orchestratedByAgent = run.orchestratorActorId === agentId;
    if (!orchestratedByAgent && !taskInScope) {
      continue;
    }
    if (!taskInScope && !isCodeConversation(conversation)) {
      // Only count runs that are clearly attached to a code-side task or
      // run on a code-thread conversation. Drop other orchestration noise.
      continue;
    }
    runCount += 1;
    codeRunIds.add(run.id);
    lastRunActivityAt = maxIso(
      lastRunActivityAt,
      run.completedAt,
      run.startedAt,
      run.updatedAt,
      run.createdAt,
    );
  }

  let artifactCount = 0;
  for (const artifact of artifacts) {
    // Strong attribution: artifact attached to a task this agent is
    // already scoped into.
    if (artifact.taskId !== null && codeTaskIds.has(artifact.taskId)) {
      artifactCount += 1;
      continue;
    }
    // Run-only attribution: code artifact materialization sometimes
    // writes `runId` without `taskId` (see
    // `src/products/code/state/artifactMaterialization.ts`). The
    // artifact still belongs to whichever Cat owned the run.
    if (artifact.runId !== null && codeRunIds.has(artifact.runId)) {
      artifactCount += 1;
      continue;
    }
    // Conversation-scoped artifacts only count when the agent actually
    // participates in that code-thread conversation. Without this
    // guard every agent in the projection would inherit every code-
    // thread artifact, regardless of involvement.
    if (artifact.conversationId) {
      const conversation = conversationIndex.get(artifact.conversationId);
      if (
        isCodeConversation(conversation)
        && conversation?.participantActorIds.includes(agentId)
      ) {
        artifactCount += 1;
      }
    }
  }

  return { taskCount, runCount, artifactCount, lastRunActivityAt };
}

function matchesAgentQuery(
  entry: MyCatsAgentEntry,
  query: MyCatsProjectionQuery,
): boolean {
  if (query.agentIds && !query.agentIds.includes(entry.agent.id)) {
    return false;
  }
  if (query.agentKinds && !query.agentKinds.includes(entry.agent.kind)) {
    return false;
  }
  if (query.agentStatuses && !query.agentStatuses.includes(entry.agent.status)) {
    return false;
  }
  if (query.hasActiveMission !== undefined) {
    const hasActive = entry.work.activeMissionCount > 0;
    if (hasActive !== query.hasActiveMission) {
      return false;
    }
  }
  if (query.hasCodeRun !== undefined) {
    const hasRun = entry.code.runCount > 0;
    if (hasRun !== query.hasCodeRun) {
      return false;
    }
  }
  return true;
}

export function buildMyCatsProjection(
  core: CatsCoreState,
  query: MyCatsProjectionQuery = {},
): MyCatsProjection {
  const conversationIndex = indexConversationKindById(core.conversations);
  const entries: MyCatsAgentEntry[] = core.actors.map((agent) => {
    const chat = buildAgentChatMetrics(agent.id, core.conversations);
    const work = buildAgentWorkMetrics(agent.id, core.workItems, core.missions);
    const code = buildAgentCodeMetrics(
      agent.id,
      core.tasks,
      core.runs,
      core.artifacts,
      conversationIndex,
    );
    const lastActivityAt = maxIso(
      chat.lastConversationActivityAt,
      work.lastMissionUpdatedAt,
      code.lastRunActivityAt,
      agent.updatedAt,
    );
    return { agent, chat, work, code, lastActivityAt };
  });

  const filtered = entries
    .filter((entry) => matchesAgentQuery(entry, query))
    .sort((left, right) => {
      const leftAt = left.lastActivityAt ?? left.agent.updatedAt;
      const rightAt = right.lastActivityAt ?? right.agent.updatedAt;
      const comparison = rightAt.localeCompare(leftAt);
      if (comparison !== 0) {
        return comparison;
      }
      return left.agent.id.localeCompare(right.agent.id);
    })
    .slice(0, query.limit);

  const summary = filtered.reduce<MyCatsProjectionSummary>((accumulator, entry) => {
    accumulator.totalAgents += 1;
    accumulator.byKind[entry.agent.kind] += 1;
    accumulator.byStatus[entry.agent.status] += 1;
    if (entry.work.activeMissionCount > 0) {
      accumulator.agentsWithActiveMissions += 1;
    }
    if (entry.code.runCount > 0) {
      accumulator.agentsWithCodeRuns += 1;
    }
    return accumulator;
  }, buildEmptySummary());

  return { summary, agents: filtered };
}
