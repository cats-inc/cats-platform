import { upsertCoreApprovalBinding } from '../model/index.js';
import {
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableString,
  readOptionalString,
  readRequiredString,
  readWrappedBody,
} from './shared.js';
import {
  CORE_APPROVAL_BINDING_KINDS,
  CORE_APPROVAL_BINDING_SUBJECT_KINDS,
} from './constants.js';
import type { CoreApiRouteContext } from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreApprovalBindings(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { approvalBindings: core.approvalBindings });
}

async function handleCoreApprovalBindingWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const approvalBinding = await readWrappedBody(context, 'approvalBinding');
    const next = upsertCoreApprovalBinding(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(approvalBinding.id, 'approvalBinding.id'),
        kind: readEnumValue(
          approvalBinding.kind,
          'approvalBinding.kind',
          CORE_APPROVAL_BINDING_KINDS,
        ),
        approvalTaskId: readRequiredString(
          approvalBinding.approvalTaskId,
          'approvalBinding.approvalTaskId',
        ),
        subjectKind:
          readEnumValue(
            approvalBinding.subjectKind,
            'approvalBinding.subjectKind',
            CORE_APPROVAL_BINDING_SUBJECT_KINDS,
          ) ?? 'task',
        subjectId: readRequiredString(
          approvalBinding.subjectId,
          'approvalBinding.subjectId',
        ),
        projectId: readNullableString(
          approvalBinding.projectId,
          'approvalBinding.projectId',
        ),
        workItemId: readNullableString(
          approvalBinding.workItemId,
          'approvalBinding.workItemId',
        ),
        conversationId: readNullableString(
          approvalBinding.conversationId,
          'approvalBinding.conversationId',
        ),
        requestedByActorId: readNullableString(
          approvalBinding.requestedByActorId,
          'approvalBinding.requestedByActorId',
        ),
        requestedForActorId: readOptionalString(
          approvalBinding.requestedForActorId,
          'approvalBinding.requestedForActorId',
        ),
        createdAt: readOptionalString(
          approvalBinding.createdAt,
          'approvalBinding.createdAt',
        ),
        metadata: readMetadata(
          approvalBinding.metadata,
          'approvalBinding.metadata',
        ),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedApprovalBinding = persisted.approvalBindings.find(
      (candidate) => candidate.id === next.approvalBinding.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      approvalBinding: persistedApprovalBinding ?? next.approvalBinding,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreGovernanceRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/approval-bindings') {
    if (context.method === 'GET') {
      await handleCoreApprovalBindings(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreApprovalBindingWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
