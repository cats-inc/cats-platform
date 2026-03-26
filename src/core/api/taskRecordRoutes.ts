import { CoreNotFoundError } from '../errors.js';
import { buildCoreTaskRecordsView } from '../taskRecords.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTaskRecords(
  context: CoreApiRouteContext,
  taskId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (!task) {
    throw new CoreNotFoundError(`Task not found: ${taskId}`, 'task_not_found');
  }

  sendJson(context.response, 200, {
    taskId,
    records: buildCoreTaskRecordsView(core, task),
  });
}

export async function routeCoreTaskRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  const taskRecordMatch = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)\/records$/u,
  );
  if (!taskRecordMatch) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreTaskRecords(context, taskRecordMatch[0]!);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
