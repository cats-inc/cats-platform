import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import {
  readCodePlanFromTask,
  writeCodePlanToTask,
  updatePlanStepStatus,
  replanCodeTask,
  type CodePlanStep,
  type CodePlanStepStatus,
} from '../state/planSteps.js';
import type { CodeApiRouteContext } from './index.js';
import {
  CODE_API_TASK_PLAN_PATTERN,
  CODE_API_TASK_PLAN_STEP_PATTERN,
} from '../shared/apiPaths.js';

interface WritePlanBody {
  steps: CodePlanStep[];
  replan?: boolean;
}

interface PatchStepBody {
  status: CodePlanStepStatus;
}

export async function routeCodePlanApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  // PATCH /api/code/tasks/{taskId}/plan/steps/{stepId}
  const stepMatch = matchRoute(
    context.url.pathname,
    CODE_API_TASK_PLAN_STEP_PATTERN,
  );
  if (stepMatch) {
    if (context.method !== 'PATCH') {
      sendMethodNotAllowed(context.response, ['PATCH']);
      return true;
    }

    const taskId = stepMatch[0];
    const stepId = stepMatch[1];
    if (!taskId || !stepId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_params', message: 'Task id and step id are required.' },
      });
      return true;
    }

    let body: PatchStepBody;
    try {
      body = await readJsonBody<PatchStepBody>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    const validStatuses = ['not_started', 'in_progress', 'completed', 'blocked'];
    if (!body.status || !validStatuses.includes(body.status)) {
      sendJson(context.response, 400, {
        error: {
          code: 'invalid_status',
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        },
      });
      return true;
    }

    try {
      const core = await context.dependencies.coreStore.readCore();
      const result = updatePlanStepStatus(core, taskId, stepId, body.status);
      await context.dependencies.coreStore.writeCore(result.core);
      sendJson(context.response, 200, { plan: result.plan });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Step update failed.';
      sendJson(context.response, 422, {
        error: { code: 'step_update_failed', message },
      });
    }
    return true;
  }

  // GET/PUT /api/code/tasks/{taskId}/plan
  const planMatch = matchRoute(
    context.url.pathname,
    CODE_API_TASK_PLAN_PATTERN,
  );
  if (planMatch) {
    const taskId = planMatch[0];
    if (!taskId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_task_id', message: 'Task id is required.' },
      });
      return true;
    }

    if (context.method === 'GET') {
      const core = await context.dependencies.coreStore.readCore();
      const task = core.tasks.find((t) => t.id === taskId);
      if (!task) {
        sendJson(context.response, 404, {
          error: { code: 'task_not_found', message: `No task found for id ${taskId}.` },
        });
        return true;
      }

      const plan = readCodePlanFromTask(task);
      sendJson(context.response, 200, { plan });
      return true;
    }

    if (context.method === 'PUT') {
      let body: WritePlanBody;
      try {
        body = await readJsonBody<WritePlanBody>(context.request);
      } catch {
        sendJson(context.response, 400, {
          error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
        });
        return true;
      }

      if (!Array.isArray(body.steps)) {
        sendJson(context.response, 400, {
          error: { code: 'invalid_steps', message: 'Steps must be an array.' },
        });
        return true;
      }

      try {
        const core = await context.dependencies.coreStore.readCore();
        const result = body.replan
          ? replanCodeTask(core, taskId, body.steps)
          : writeCodePlanToTask(core, taskId, body.steps);
        await context.dependencies.coreStore.writeCore(result.core);
        sendJson(context.response, 200, { plan: result.plan });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Plan update failed.';
        sendJson(context.response, 422, {
          error: { code: 'plan_update_failed', message },
        });
      }
      return true;
    }

    sendMethodNotAllowed(context.response, ['GET', 'PUT']);
    return true;
  }

  return false;
}
