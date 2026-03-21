import type {
  CoreApprovalDecisionOptionRecord,
  CoreApprovalQueueItem,
  CatsCoreState,
  CoreActorRecord,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
  OwnerProfileRecord,
} from './types.js';
import { CATS_CORE_STATE_VERSION } from './types.js';

export const OWNER_ACTOR_ID = 'actor-owner';
export const GLOBAL_ORCHESTRATOR_ACTOR_ID = 'actor-orchestrator-global';

export function createPalActorId(palId: string): string {
  return `actor-pal-${palId}`;
}

export function createEmptyMemoryCheckpoint(): MemoryCheckpointSummary {
  return {
    summary: null,
    facts: [],
    openLoops: [],
    updatedAt: null,
  };
}

function createDefaultExecutionTarget(): ExecutionTargetSummary {
  return {
    provider: 'claude',
    instance: null,
    model: null,
  };
}

export function createDefaultOwnerProfile(updatedAt: string = new Date().toISOString()): OwnerProfileRecord {
  return {
    actorId: OWNER_ACTOR_ID,
    displayName: 'Owner',
    avatarColor: null,
    summary: null,
    communicationPreferences: [],
    decisionPreferences: [],
    escalationPreferences: [],
    updatedAt,
  };
}

const DEFAULT_APPROVAL_DECISION_OPTIONS: CoreApprovalDecisionOptionRecord[] = [
  {
    action: 'approve',
    label: 'Approve',
    description: 'Allow the orchestrator plan to proceed.',
  },
  {
    action: 'revise',
    label: 'Request revision',
    description: 'Send the plan back for refinement before execution.',
  },
  {
    action: 'reject',
    label: 'Reject',
    description: 'Do not allow the plan to proceed.',
  },
];

function createOwnerActor(ownerProfile: OwnerProfileRecord): CoreActorRecord {
  return {
    id: ownerProfile.actorId,
    name: ownerProfile.displayName,
    kind: 'owner',
    status: 'active',
    roles: ['owner'],
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: null,
    memory: createEmptyMemoryCheckpoint(),
    source: 'owner_profile',
    sourceId: ownerProfile.actorId,
    createdAt: ownerProfile.updatedAt,
    updatedAt: ownerProfile.updatedAt,
    archivedAt: null,
  };
}

function createDefaultOrchestratorActor(updatedAt: string): CoreActorRecord {
  return {
    id: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    name: 'Orchestrator',
    kind: 'orchestrator',
    status: 'active',
    roles: ['orchestrator', 'coordinator'],
    skillProfile: 'aaif-a2a-default',
    mcpProfile: 'workspace-memory',
    defaultExecutionTarget: createDefaultExecutionTarget(),
    memory: createEmptyMemoryCheckpoint(),
    source: 'global_orchestrator',
    sourceId: 'global',
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
  };
}

export function createDefaultCoreState(): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = createDefaultOwnerProfile(updatedAt);

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: null,
    ownerProfile,
    actors: [createOwnerActor(ownerProfile), createDefaultOrchestratorActor(updatedAt)],
    conversations: [],
    tasks: [],
    botBindings: [],
    archives: [],
  };
}

export function buildApprovalQueue(core: CatsCoreState): CoreApprovalQueueItem[] {
  return core.tasks
    .filter((task) =>
      task.status === 'pending_approval' || task.approval.status === 'pending',
    )
    .map((task) => ({
    id: `approval-${task.id}`,
    kind: 'dispatch_plan',
    taskId: task.id,
    conversationId: task.conversationId,
    status: task.approval.status,
    title: task.title,
    summary: task.summary,
    requestedByActorId: task.orchestratorActorId,
    requestedForActorId: task.ownerActorId,
    requestedAt: task.approval.requestedAt,
    decidedAt: task.approval.decidedAt,
    decidedByActorId: task.approval.decidedByActorId,
    notes: task.approval.notes,
    requiresOwnerDecision: task.approval.status === 'pending',
    decisionOptions: DEFAULT_APPROVAL_DECISION_OPTIONS.map((option) => ({ ...option })),
    }));
}
