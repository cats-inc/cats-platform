import { buildCoreMemoryMaintenanceSummary } from '../memoryMaintenance.js';
import { executeCoreMemoryMaintenanceAction } from '../memoryMaintenanceActions.js';
import { CoreApiError, CoreValidationError } from '../errors.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError, readNullableString, readObjectBody } from './shared.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { MemoryFlushReason } from '../../platform/memory/contracts.js';

type CoreMemoryMaintenanceAction =
  | 'sync_companion'
  | 'sync_owner'
  | 'sync_project'
  | 'sync_relationship';

async function handleCoreMemoryMaintenance(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, {
    maintenance: buildCoreMemoryMaintenanceSummary(core),
  });
}

function readMemoryMaintenanceAction(value: unknown): CoreMemoryMaintenanceAction {
  if (
    value === 'sync_companion'
    || value === 'sync_owner'
    || value === 'sync_project'
    || value === 'sync_relationship'
  ) {
    return value;
  }

  throw new CoreValidationError(
    'action must be one of: sync_companion, sync_owner, sync_project, sync_relationship',
  );
}

function readFlushReason(value: unknown): MemoryFlushReason | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === 'manual'
    || value === 'session_hydration'
    || value === 'pre_reset'
    || value === 'pre_compaction'
    || value === 'channel_handoff'
    || value === 'owner_profile_sync'
  ) {
    return value;
  }

  throw new CoreValidationError(
    'reason must be one of: manual, session_hydration, pre_reset, pre_compaction, channel_handoff, owner_profile_sync',
  );
}

async function handleCoreMemoryMaintenanceAction(
  context: CoreApiRouteContext,
): Promise<void> {
  if (!context.dependencies.memoryService) {
    throw new CoreApiError(
      'Cats memory service is not available.',
      'memory_service_unavailable',
      503,
    );
  }

  const body = await readObjectBody(context);
  const action = readMemoryMaintenanceAction(body.action);
  const catId = readNullableString(body.catId, 'catId') ?? undefined;
  const projectId = readNullableString(body.projectId, 'projectId') ?? undefined;
  const relationshipId = readNullableString(body.relationshipId, 'relationshipId') ?? undefined;
  const reason = readFlushReason(body.reason);
  if (action === 'sync_companion' && !catId) {
    throw new CoreValidationError('catId is required for sync_companion');
  }
  if (action === 'sync_project' && !projectId) {
    throw new CoreValidationError('projectId is required for sync_project');
  }
  if (action === 'sync_relationship' && !relationshipId) {
    throw new CoreValidationError('relationshipId is required for sync_relationship');
  }
  if (action === 'sync_companion' && !context.dependencies.companionStore) {
    throw new CoreApiError(
      'Cats companion store is not available.',
      'companion_store_unavailable',
      503,
    );
  }

  const result = await executeCoreMemoryMaintenanceAction({
    action,
    coreStore: context.dependencies.coreStore,
    memoryService: context.dependencies.memoryService,
    companionStore: context.dependencies.companionStore,
    catId,
    projectId,
    relationshipId,
    reason,
    now: context.dependencies.now?.(),
  });

  sendJson(context.response, 200, {
    maintenanceAction: result,
  });
}

export async function routeCoreMemoryMaintenanceApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/core/memory-maintenance') {
    return false;
  }

  if (context.method === 'GET') {
    try {
      await handleCoreMemoryMaintenance(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }
  if (context.method === 'POST') {
    try {
      await handleCoreMemoryMaintenanceAction(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  sendMethodNotAllowed(context.response, ['GET', 'POST']);
  return true;
}
