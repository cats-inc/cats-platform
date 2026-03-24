import { randomUUID } from 'node:crypto';

import {
  CoreNotFoundError,
  CoreValidationError,
} from './errors.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID } from './actors.js';
import type { CoreApprovalBindingWriteInput } from './modelInputs.js';
import {
  normalizeMetadata,
  normalizeNullableString,
  replaceById,
  touchCoreState,
} from './modelShared.js';
import type {
  CatsCoreState,
  CoreApprovalBindingRecord,
} from './types.js';

export function upsertCoreApprovalBinding(
  core: CatsCoreState,
  input: CoreApprovalBindingWriteInput,
  now: Date = new Date(),
): {
  core: CatsCoreState;
  approvalBinding: CoreApprovalBindingRecord;
  created: boolean;
} {
  const nowIso = now.toISOString();
  const approvalTaskId = input.approvalTaskId.trim();
  const subjectId = input.subjectId.trim();

  if (!approvalTaskId) {
    throw new CoreValidationError(
      'approvalBinding.approvalTaskId is required',
      'approval_binding_task_id_required',
    );
  }

  if (!subjectId) {
    throw new CoreValidationError(
      'approvalBinding.subjectId is required',
      'approval_binding_subject_id_required',
    );
  }
  if (!core.tasks.some((task) => task.id === approvalTaskId)) {
    throw new CoreNotFoundError(
      `Task not found: ${approvalTaskId}`,
      'task_not_found',
    );
  }

  const approvalBindingId =
    normalizeNullableString(input.id) ?? `approval-binding-${randomUUID()}`;
  const existing = core.approvalBindings.find(
    (binding) => binding.id === approvalBindingId,
  );
  const approvalBinding: CoreApprovalBindingRecord = {
    id: approvalBindingId,
    kind: input.kind ?? existing?.kind ?? 'owner_decision',
    approvalTaskId,
    subjectKind: input.subjectKind,
    subjectId,
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined
        ? existing?.workItemId ?? null
        : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    requestedByActorId:
      input.requestedByActorId === undefined
        ? existing?.requestedByActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.requestedByActorId),
    requestedForActorId:
      normalizeNullableString(input.requestedForActorId)
      ?? existing?.requestedForActorId
      ?? core.ownerProfile.actorId,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.approvalBindings, approvalBinding);

  return {
    core: touchCoreState(
      {
        ...core,
        approvalBindings: records,
      },
      nowIso,
    ),
    approvalBinding,
    created,
  };
}
