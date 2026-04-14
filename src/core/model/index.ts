import {
  createDefaultOwnerProfile,
  createEmptyMemoryCheckpoint,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  OWNER_ACTOR_ID,
  createCatActorId,
} from '../actors.js';
import {
  appendCoreActivity,
  appendCoreTrace,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreLane,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreSegment,
  upsertCoreSession,
  upsertCoreTurn,
  upsertCoreWorkItem,
} from './records.js';
import {
  addDurableMemory,
  createBotBinding,
  listDurableMemoryBySubject,
  removeBotBinding,
  removeDurableMemory,
  updateDurableMemory,
} from './memoryBindings.js';
import {
  patchOwnerProfile,
  upsertCoreTask,
  writeApprovalDecision,
} from './taskControls.js';
import {
  createDefaultOrchestratorActor,
  createOwnerActor,
  DEFAULT_APPROVAL_DECISION_OPTIONS,
} from './shared.js';
import type {
  BotBindingRecord,
  CatsCoreState,
  CoreApprovalQueueItem,
  CoreTaskRecord,
  DurableMemoryRecord,
  DurableMemorySubjectType,
  OwnerProfileRecord,
} from '../types.js';
import { CATS_CORE_STATE_VERSION } from '../types.js';
import type {
  CoreActivityWriteInput,
  CoreApprovalBindingWriteInput,
  CoreApprovalWriteInput,
  CoreArtifactWriteInput,
  CoreCheckpointWriteInput,
  CoreLaneWriteInput,
  CoreOutcomeWriteInput,
  CoreProjectWriteInput,
  CoreRunWriteInput,
  CoreSegmentWriteInput,
  CoreSessionWriteInput,
  CoreTaskWriteInput,
  CoreTraceWriteInput,
  CoreTurnWriteInput,
  CoreWorkItemWriteInput,
  OwnerProfilePatchInput,
} from './inputs.js';

export {
  addDurableMemory,
  appendCoreActivity,
  appendCoreTrace,
  createBotBinding,
  createCatActorId,
  createDefaultOwnerProfile,
  createEmptyMemoryCheckpoint,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  listDurableMemoryBySubject,
  OWNER_ACTOR_ID,
  patchOwnerProfile,
  removeBotBinding,
  removeDurableMemory,
  updateDurableMemory,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreLane,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreSegment,
  upsertCoreSession,
  upsertCoreTask,
  upsertCoreTurn,
  upsertCoreWorkItem,
  writeApprovalDecision,
};
export type {
  BotBindingRecord,
  CoreActivityWriteInput,
  CoreApprovalBindingWriteInput,
  CoreApprovalWriteInput,
  CoreArtifactWriteInput,
  CoreCheckpointWriteInput,
  CoreLaneWriteInput,
  CoreOutcomeWriteInput,
  CoreProjectWriteInput,
  CoreRunWriteInput,
  CoreSegmentWriteInput,
  CoreSessionWriteInput,
  CoreTaskRecord,
  CoreTaskWriteInput,
  CoreTraceWriteInput,
  CoreTurnWriteInput,
  CoreWorkItemWriteInput,
  DurableMemoryRecord,
  DurableMemorySubjectType,
  OwnerProfilePatchInput,
  OwnerProfileRecord,
};

export function createDefaultCoreState(): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = createDefaultOwnerProfile(updatedAt);

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: null,
    ownerProfile,
    guideCat: null,
    assistantPresets: [],
    actors: [
      createOwnerActor(ownerProfile),
      createDefaultOrchestratorActor(updatedAt),
    ],
    participants: [],
    containers: [],
    conversations: [],
    turns: [],
    lanes: [],
    segments: [],
    sessions: [],
    projects: [],
    workItems: [],
    missions: [],
    tasks: [],
    runs: [],
    traces: [],
    checkpoints: [],
    outcomes: [],
    artifacts: [],
    activities: [],
    approvalBindings: [],
    transportBindings: [],
    botBindings: [],
    archives: [],
    durableMemory: [],
  };
}

export function buildApprovalQueue(core: CatsCoreState): CoreApprovalQueueItem[] {
  return core.tasks
    .filter(
      (task) =>
        task.status === 'pending_approval' && task.approval.status === 'pending',
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
      decisionAction: task.approval.decisionAction,
      notes: task.approval.notes,
      requiresOwnerDecision: task.approval.status === 'pending',
      decisionOptions: DEFAULT_APPROVAL_DECISION_OPTIONS.map((option) => ({
        ...option,
      })),
    }));
}
