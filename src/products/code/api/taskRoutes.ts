import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import {
  createCodeTask,
  resumeCodeTask,
  bridgeCodeTaskToRuntime,
  type CreateCodeTaskInput,
  type BridgeCodeTaskInput,
} from '../state/taskExecution.js';
import { buildCodeTaskDetailProjection } from './projection.js';
import type { CodeApiRouteContext } from './index.js';

interface CreateTaskBody {
  title: string;
  summary?: string | null;
  workspacePath?: string | null;
  parentTaskId?: string | null;
  conversationId?: string | null;
  assignedActorIds?: string[];
  acceptanceCriteria?: string | null;
}

interface ExecuteTaskBody {
  workspacePath: string;
  provider: string;
  model?: string | null;
  instance?: string | null;
}

export async function routeCodeTaskMutationApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  // POST /api/code/tasks/{taskId}/execute
  const executeMatch = matchRoute(
    context.url.pathname,
    /^\/api\/code\/tasks\/([^/]+)\/execute$/u,
  );
  if (executeMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const taskId = executeMatch[0];
    if (!taskId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_task_id', message: 'Task id is required.' },
      });
      return true;
    }

    let body: ExecuteTaskBody;
    try {
      body = await readJsonBody<ExecuteTaskBody>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    if (!body.workspacePath?.trim() || !body.provider?.trim()) {
      sendJson(context.response, 400, {
        error: {
          code: 'missing_fields',
          message: 'workspacePath and provider are required.',
        },
      });
      return true;
    }

    const input: BridgeCodeTaskInput = {
      taskId,
      workspacePath: body.workspacePath.trim(),
      provider: body.provider.trim(),
      model: body.model,
      instance: body.instance,
    };

    try {
      const result = await bridgeCodeTaskToRuntime(
        context.dependencies.coreStore,
        context.dependencies.runtimeClient,
        input,
      );

      const taskDetail = buildCodeTaskDetailProjection(result.core, result.task);
      sendJson(context.response, 200, {
        task: taskDetail,
        sessionId: result.sessionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution bridge failed.';
      sendJson(context.response, 422, {
        error: { code: 'execution_failed', message },
      });
    }
    return true;
  }

  // POST /api/code/tasks/{taskId}/resume
  const resumeMatch = matchRoute(
    context.url.pathname,
    /^\/api\/code\/tasks\/([^/]+)\/resume$/u,
  );
  if (resumeMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const taskId = resumeMatch[0];
    if (!taskId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_task_id', message: 'Task id is required.' },
      });
      return true;
    }

    try {
      const core = await context.dependencies.coreStore.readCore();
      const result = resumeCodeTask(core, { taskId });
      await context.dependencies.coreStore.writeCore(result.core);

      const taskDetail = buildCodeTaskDetailProjection(result.core, result.task);
      sendJson(context.response, 200, { task: taskDetail });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resume failed.';
      sendJson(context.response, 422, {
        error: { code: 'resume_failed', message },
      });
    }
    return true;
  }

  // POST /api/code/tasks — create new code task
  if (context.url.pathname === '/api/code/tasks') {
    if (context.method !== 'POST') {
      return false;
    }

    let body: CreateTaskBody;
    try {
      body = await readJsonBody<CreateTaskBody>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    if (!body.title?.trim()) {
      sendJson(context.response, 400, {
        error: { code: 'missing_title', message: 'Task title is required.' },
      });
      return true;
    }

    const input: CreateCodeTaskInput = {
      title: body.title.trim(),
      summary: body.summary,
      workspacePath: body.workspacePath,
      parentTaskId: body.parentTaskId,
      conversationId: body.conversationId,
      assignedActorIds: body.assignedActorIds,
      acceptanceCriteria: body.acceptanceCriteria,
    };

    try {
      const core = await context.dependencies.coreStore.readCore();
      const result = createCodeTask(core, input);
      await context.dependencies.coreStore.writeCore(result.core);

      const taskDetail = buildCodeTaskDetailProjection(result.core, result.task);
      sendJson(context.response, 201, { task: taskDetail });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Task creation failed.';
      sendJson(context.response, 422, {
        error: { code: 'creation_failed', message },
      });
    }
    return true;
  }

  return false;
}
