import { randomUUID } from 'node:crypto';

import {
  CoreConflictError,
  CoreNotFoundError,
  CoreValidationError,
} from './errors.js';
import {
  createCatActorId,
  createDefaultOwnerProfile,
  createEmptyMemoryCheckpoint,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  OWNER_ACTOR_ID,
} from './actors.js';
import {
  appendCoreActivity,
  appendCoreTrace,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreWorkItem,
} from './modelRecords.js';
import {
  ALLOWED_APPROVAL_TRANSITIONS,
  createDefaultOrchestratorActor,
  createOwnerActor,
  DEFAULT_APPROVAL_DECISION_OPTIONS,
  normalizeMetadata,
  normalizeNullableString,
  normalizeStringArray,
  replaceById,
  replaceOwnerActor,
  touchCoreState,
} from './modelShared.js';
import type {
  CatsCoreState,
  BotBindingRecord,
  CoreApprovalQueueItem,
  CoreTaskRecord,
  DurableMemoryRecord,
  DurableMemorySubjectType,
  OwnerProfileRecord,
} from './types.js';
import { CATS_CORE_STATE_VERSION } from './types.js';
import type {
  CoreActivityWriteInput,
  CoreApprovalBindingWriteInput,
  CoreApprovalWriteInput,
  CoreArtifactWriteInput,
  CoreCheckpointWriteInput,
  CoreOutcomeWriteInput,
  CoreProjectWriteInput,
  CoreRunWriteInput,
  CoreTaskWriteInput,
  CoreTraceWriteInput,
  CoreWorkItemWriteInput,
  OwnerProfilePatchInput,
} from './modelInputs.js';

export {
  appendCoreActivity,
  appendCoreTrace,
  createCatActorId,
  createDefaultOwnerProfile,
  createEmptyMemoryCheckpoint,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  OWNER_ACTOR_ID,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreWorkItem,
};
export type {
  CoreActivityWriteInput,
  CoreApprovalBindingWriteInput,
  CoreApprovalWriteInput,
  CoreArtifactWriteInput,
  CoreCheckpointWriteInput,
  CoreOutcomeWriteInput,
  CoreProjectWriteInput,
  CoreRunWriteInput,
  CoreTaskWriteInput,
  CoreTraceWriteInput,
  CoreWorkItemWriteInput,
  OwnerProfilePatchInput,
} from './modelInputs.js';

export function createDefaultCoreState(): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = createDefaultOwnerProfile(updatedAt);

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: null,
    ownerProfile,
    actors: [
      createOwnerActor(ownerProfile),
      createDefaultOrchestratorActor(updatedAt),
    ],
    conversations: [],
    projects: [],
    workItems: [],
    tasks: [],
    runs: [],
    traces: [],
    checkpoints: [],
    outcomes: [],
    artifacts: [],
    activities: [],
    approvalBindings: [],
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

export function upsertCoreTask(
  core: CatsCoreState,
  input: CoreTaskWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; task: CoreTaskRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Task title is required', 'task_title_required');
  }

  const taskId = normalizeNullableString(input.id) ?? `task-${randomUUID()}`;
  const existingTask = core.tasks.find((task) => task.id === taskId);
  const task: CoreTaskRecord = {
    id: taskId,
    title,
    status: input.status ?? existingTask?.status ?? 'draft',
    conversationId:
      input.conversationId === undefined
        ? existingTask?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    parentTaskId:
      input.parentTaskId === undefined
        ? existingTask?.parentTaskId ?? null
        : normalizeNullableString(input.parentTaskId),
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existingTask?.ownerActorId
      ?? core.ownerProfile.actorId,
    orchestratorActorId:
      input.orchestratorActorId === undefined
        ? existingTask?.orchestratorActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.orchestratorActorId),
    assignedActorIds:
      input.assignedActorIds === undefined
        ? structuredClone(existingTask?.assignedActorIds ?? [])
        : normalizeStringArray(input.assignedActorIds),
    summary:
      input.summary === undefined
        ? existingTask?.summary ?? null
        : normalizeNullableString(input.summary),
    approval: {
      status: input.approval?.status ?? existingTask?.approval.status ?? 'not_requested',
      requestedAt:
        input.approval?.requestedAt === undefined
          ? existingTask?.approval.requestedAt ?? null
          : normalizeNullableString(input.approval.requestedAt),
      decidedAt:
        input.approval?.decidedAt === undefined
          ? existingTask?.approval.decidedAt ?? null
          : normalizeNullableString(input.approval.decidedAt),
      decidedByActorId:
        input.approval?.decidedByActorId === undefined
          ? existingTask?.approval.decidedByActorId ?? null
          : normalizeNullableString(input.approval.decidedByActorId),
      decisionAction:
        input.approval?.decisionAction === undefined
          ? existingTask?.approval.decisionAction ?? null
          : input.approval.decisionAction ?? null,
      notes:
        input.approval?.notes === undefined
          ? existingTask?.approval.notes ?? null
          : normalizeNullableString(input.approval.notes),
    },
    createdAt: existingTask?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existingTask?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.tasks, task);

  return {
    core: touchCoreState(
      {
        ...core,
        tasks: records,
      },
      nowIso,
    ),
    task,
    created,
  };
}

export function patchOwnerProfile(
  core: CatsCoreState,
  patch: OwnerProfilePatchInput,
  now: Date = new Date(),
): { core: CatsCoreState; ownerProfile: OwnerProfileRecord } {
  const nowIso = now.toISOString();
  const displayName = patch.displayName?.trim();
  if (patch.displayName !== undefined && !displayName) {
    throw new CoreValidationError(
      'Owner profile displayName is required',
      'owner_profile_display_name_required',
    );
  }

  const ownerProfile: OwnerProfileRecord = {
    ...core.ownerProfile,
    displayName: displayName ?? core.ownerProfile.displayName,
    avatarColor:
      patch.avatarColor === undefined
        ? core.ownerProfile.avatarColor
        : normalizeNullableString(patch.avatarColor),
    summary:
      patch.summary === undefined
        ? core.ownerProfile.summary
        : normalizeNullableString(patch.summary),
    communicationPreferences:
      patch.communicationPreferences === undefined
        ? structuredClone(core.ownerProfile.communicationPreferences)
        : normalizeStringArray(patch.communicationPreferences),
    decisionPreferences:
      patch.decisionPreferences === undefined
        ? structuredClone(core.ownerProfile.decisionPreferences)
        : normalizeStringArray(patch.decisionPreferences),
    escalationPreferences:
      patch.escalationPreferences === undefined
        ? structuredClone(core.ownerProfile.escalationPreferences)
        : normalizeStringArray(patch.escalationPreferences),
    updatedAt: nowIso,
  };

  return {
    core: touchCoreState(
      {
        ...core,
        ownerProfile,
        actors: replaceOwnerActor(core.actors, ownerProfile),
      },
      nowIso,
    ),
    ownerProfile,
  };
}

export function writeApprovalDecision(
  core: CatsCoreState,
  input: CoreApprovalWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; task: CoreTaskRecord } {
  const nowIso = now.toISOString();
  const task = core.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) {
    throw new CoreNotFoundError(`Task not found: ${input.taskId}`, 'task_not_found');
  }

  if (!ALLOWED_APPROVAL_TRANSITIONS[task.approval.status].includes(input.status)) {
    throw new CoreConflictError(
      `Approval transition not allowed: ${task.approval.status} -> ${input.status}`,
      'approval_transition_invalid',
    );
  }

  if (input.status === 'pending' && input.action) {
    throw new CoreValidationError(
      'Approval action cannot be set while the task is still pending',
      'approval_action_pending_invalid',
    );
  }
  if (input.action === 'approve' && input.status !== 'approved') {
    throw new CoreValidationError(
      'Approval action approve requires status approved',
      'approval_action_status_mismatch',
    );
  }
  if (
    (input.action === 'reroute' || input.action === 'reject')
    && input.status !== 'rejected'
  ) {
    throw new CoreValidationError(
      `Approval action ${input.action} requires status rejected`,
      'approval_action_status_mismatch',
    );
  }

  const resolvedDecisionAction =
    input.status === 'pending'
      ? null
      : input.action
        ?? (input.status === 'approved'
          ? 'approve'
          : input.taskStatus === 'draft'
            ? 'reroute'
            : 'reject');
  const nextTaskStatus =
    input.taskStatus
    ?? (input.status === 'pending'
      ? 'pending_approval'
      : input.status === 'approved'
        ? 'approved'
        : resolvedDecisionAction === 'reroute'
          ? 'draft'
          : task.status);
  const requestedByActorId = normalizeNullableString(input.requestedByActorId);
  const decidedByActorId = normalizeNullableString(input.decidedByActorId);
  const existingApproval = task.approval;
  const nextRequestedAt =
    input.status === 'pending'
      ? existingApproval.status === 'pending'
        ? existingApproval.requestedAt ?? nowIso
        : nowIso
      : existingApproval.requestedAt;
  const nextDecidedAt =
    input.status === 'approved' || input.status === 'rejected'
      ? existingApproval.status === input.status
        ? existingApproval.decidedAt ?? nowIso
        : nowIso
      : null;
  const nextTask: CoreTaskRecord = {
    ...task,
    status: nextTaskStatus,
    approval: {
      status: input.status,
      requestedAt: nextRequestedAt,
      decidedAt: nextDecidedAt,
      decidedByActorId:
        input.status === 'pending'
          ? null
          : decidedByActorId ?? existingApproval.decidedByActorId,
      decisionAction:
        input.status === 'pending'
          ? null
          : resolvedDecisionAction,
      notes:
        input.notes === undefined
          ? existingApproval.notes
          : normalizeNullableString(input.notes),
    },
    orchestratorActorId:
      requestedByActorId
      ?? task.orchestratorActorId
      ?? GLOBAL_ORCHESTRATOR_ACTOR_ID,
    updatedAt: nowIso,
  };

  const nextTasks = core.tasks.map((candidate) =>
    candidate.id === nextTask.id ? nextTask : candidate,
  );

  return {
    core: touchCoreState(
      {
        ...core,
        tasks: nextTasks,
      },
      nowIso,
    ),
    task: nextTask,
  };
}

export function addDurableMemory(
  core: CatsCoreState,
  record: DurableMemoryRecord,
): CatsCoreState {
  return touchCoreState(
    {
      ...core,
      durableMemory: [...core.durableMemory, structuredClone(record)],
    },
    record.updatedAt,
  );
}

export function updateDurableMemory(
  core: CatsCoreState,
  recordId: string,
  updates: Partial<Pick<DurableMemoryRecord, 'content' | 'confidence' | 'category' | 'sourceRefs'>>,
  now: Date = new Date(),
): CatsCoreState {
  const nowIso = now.toISOString();
  const index = core.durableMemory.findIndex((record) => record.id === recordId);
  if (index === -1) {
    throw new CoreNotFoundError(
      `Durable memory not found: ${recordId}`,
      'durable_memory_not_found',
    );
  }

  const nextMemory = structuredClone(core.durableMemory);
  nextMemory[index] = {
    ...nextMemory[index],
    ...updates,
    updatedAt: nowIso,
  };

  return touchCoreState(
    {
      ...core,
      durableMemory: nextMemory,
    },
    nowIso,
  );
}

export function removeDurableMemory(
  core: CatsCoreState,
  recordId: string,
  now: Date = new Date(),
): CatsCoreState {
  const nowIso = now.toISOString();
  const nextMemory = core.durableMemory.filter((record) => record.id !== recordId);

  if (nextMemory.length === core.durableMemory.length) {
    throw new CoreNotFoundError(
      `Durable memory not found: ${recordId}`,
      'durable_memory_not_found',
    );
  }

  return touchCoreState(
    {
      ...core,
      durableMemory: nextMemory,
    },
    nowIso,
  );
}

export function listDurableMemoryBySubject(
  core: CatsCoreState,
  subjectType: DurableMemorySubjectType,
  subjectId: string,
): DurableMemoryRecord[] {
  return core.durableMemory.filter(
    (record) => record.subjectType === subjectType && record.subjectId === subjectId,
  );
}

export function createBotBinding(
  core: CatsCoreState,
  input: {
    platform: 'telegram' | 'line';
    botName: string;
    catId: string;
    roomMode?: 'boss_chat' | 'direct_cat_chat';
  },
  now: Date = new Date(),
): { core: CatsCoreState; binding: BotBindingRecord } {
  const nowIso = now.toISOString();
  const binding: BotBindingRecord = {
    id: `bot-binding-${randomUUID()}`,
    platform: input.platform,
    botName: input.botName.trim(),
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    catActorId: createCatActorId(input.catId),
    bossCatActorId: null,
    botToken: null,
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: input.roomMode ?? 'direct_cat_chat',
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    core: touchCoreState(
      {
        ...core,
        botBindings: [...core.botBindings, binding],
      },
      nowIso,
    ),
    binding,
  };
}

export function removeBotBinding(
  core: CatsCoreState,
  bindingId: string,
  now: Date = new Date(),
): CatsCoreState {
  const nowIso = now.toISOString();
  const next = core.botBindings.filter((binding) => binding.id !== bindingId);
  if (next.length === core.botBindings.length) {
    throw new CoreNotFoundError(
      `Bot binding not found: ${bindingId}`,
      'bot_binding_not_found',
    );
  }
  return touchCoreState({ ...core, botBindings: next }, nowIso);
}
