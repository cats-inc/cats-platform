import { randomUUID } from 'node:crypto';

import {
  CoreConflictError,
  CoreNotFoundError,
  CoreValidationError,
} from '../errors.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID } from '../actors.js';
import type {
  CoreApprovalWriteInput,
  CoreTaskWriteInput,
  OwnerProfilePatchInput,
} from './inputs.js';
import {
  ALLOWED_APPROVAL_TRANSITIONS,
  normalizeMetadata,
  normalizeNullableString,
  normalizeStringArray,
  replaceById,
  replaceOwnerActor,
  touchCoreState,
} from './shared.js';
import type {
  CatsCoreState,
  CoreTaskRecord,
  OwnerProfileRecord,
} from '../types.js';

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
