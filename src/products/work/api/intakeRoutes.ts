import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import { upsertCoreProject } from '../../../core/model/planningRecords.js';
import {
  upsertCoreTask,
  writeApprovalDecision,
} from '../../../core/model/taskControls.js';
import { appendCoreActivity } from '../../../core/model/executionRecords.js';
import { readTaskPlanningMetadata } from '../../../shared/taskPlanning.js';
import { generateWorkIntakePlan } from '../intake/index.js';
import { getWorkTemplate, listWorkTemplates } from '../templates/index.js';
import {
  buildWorkIntakePlanProjection,
  findIntakeProjectTasks,
} from './intakeProjection.js';
import type { WorkApiDependencies } from './index.js';
import type { WorkIntakeInput } from '../intake/types.js';
import {
  WORK_API_INTAKE_APPROVE_PATTERN,
  WORK_API_INTAKE_PATH,
  WORK_API_INTAKE_PLAN_PATTERN,
  WORK_API_INTAKE_REJECT_PATTERN,
  WORK_API_TEMPLATES_PATH,
} from '../shared/apiPaths.js';
import { createWorkProductRef } from '../shared/productMetadata.js';

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateIntakeInput(
  body: Record<string, unknown>,
): { input: WorkIntakeInput; error: null } | { input: null; error: string } {
  const title = readNonEmptyString(body.title);
  if (!title) {
    return { input: null, error: 'title is required' };
  }

  const brief = readNonEmptyString(body.brief);
  if (!brief) {
    return { input: null, error: 'brief is required' };
  }

  const desiredOutcome = readNonEmptyString(body.desiredOutcome);
  if (!desiredOutcome) {
    return { input: null, error: 'desiredOutcome is required' };
  }

  const templateId = readNonEmptyString(body.templateId);
  if (!templateId) {
    return { input: null, error: 'templateId is required' };
  }

  const priority = readNonEmptyString(body.priority);
  if (priority && priority !== 'low' && priority !== 'medium' && priority !== 'high') {
    return { input: null, error: 'priority must be low, medium, or high' };
  }

  return {
    input: {
      title,
      brief,
      desiredOutcome,
      repoPath: readNonEmptyString(body.repoPath),
      deadline: readNonEmptyString(body.deadline),
      priority: priority as 'low' | 'medium' | 'high' | null,
      templateId,
    },
    error: null,
  };
}

export async function routeWorkIntakeApi(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  // GET /api/work/templates
  if (context.url.pathname === WORK_API_TEMPLATES_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(context.response, 200, {
      product: createWorkProductRef(),
      templates: listWorkTemplates(),
    });
    return true;
  }

  // POST /api/work/intake
  if (context.url.pathname === WORK_API_INTAKE_PATH) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const validation = validateIntakeInput(body);
    if (validation.error !== null || validation.input === null) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_intake_input', message: validation.error ?? 'Invalid input' },
      });
      return true;
    }

    const intakeInput = validation.input;
    const template = getWorkTemplate(intakeInput.templateId);
    if (!template) {
      sendJson(context.response, 400, {
        error: {
          code: 'template_not_found',
          message: `Template not found: ${intakeInput.templateId}`,
        },
      });
      return true;
    }

    const now = context.dependencies.now?.() ?? new Date();
    const core = await context.dependencies.coreStore.readCore();
    const result = generateWorkIntakePlan(core, intakeInput, template, now);
    await context.dependencies.coreStore.writeCore(result.core);

    const projection = buildWorkIntakePlanProjection(
      result.core,
      result.plan.project,
    );

    sendJson(context.response, 201, projection);
    return true;
  }

  // POST /api/work/intake/:projectId/approve
  const approveMatch = matchRoute(
    context.url.pathname,
    WORK_API_INTAKE_APPROVE_PATTERN,
  );
  if (approveMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const projectId = approveMatch[0];
    if (!projectId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_project_id', message: 'Project id is required.' },
      });
      return true;
    }

    const now = context.dependencies.now?.() ?? new Date();
    let core = await context.dependencies.coreStore.readCore();
    const project = core.projects.find((p) => p.id === projectId);
    if (!project) {
      sendJson(context.response, 404, {
        error: { code: 'project_not_found', message: `No project found for id ${projectId}.` },
      });
      return true;
    }

    const tasks = findIntakeProjectTasks(core, projectId);
    if (tasks.length === 0) {
      sendJson(context.response, 400, {
        error: { code: 'no_intake_tasks', message: 'No intake tasks found for this project.' },
      });
      return true;
    }

    // Transition each draft task: not_requested → pending → approved
    for (const task of tasks) {
      if (task.status !== 'draft') {
        continue;
      }

      // Step 1: request approval (not_requested → pending)
      if (task.approval.status === 'not_requested') {
        const pendingResult = writeApprovalDecision(core, {
          taskId: task.id,
          status: 'pending',
          requestedByActorId: core.ownerProfile.actorId,
        }, now);
        core = pendingResult.core;
      }

      // Step 2: approve (pending → approved)
      const currentTask = core.tasks.find((t) => t.id === task.id);
      if (currentTask && currentTask.approval.status === 'pending') {
        const approveResult = writeApprovalDecision(core, {
          taskId: task.id,
          status: 'approved',
          action: 'approve',
          decidedByActorId: core.ownerProfile.actorId,
          notes: 'Approved via work intake plan review.',
        }, now);
        core = approveResult.core;
      }

      // Activity record
      const planning = readTaskPlanningMetadata(task.metadata);
      const targetProduct = planning.productHint ?? 'work';
      const activityResult = appendCoreActivity(core, {
        kind: 'approval_decided',
        projectId,
        taskId: task.id,
        message: `Plan task approved: "${task.title}" → ${targetProduct}.`,
      }, now);
      core = activityResult.core;
    }

    // Transition approved tasks to in_progress so downstream products can
    // pick them up. Work does not own runtime sessions; Chat and Code
    // create sessions when they consume tasks via their own product loops.
    for (const task of tasks) {
      const current = core.tasks.find((t) => t.id === task.id);
      if (!current || current.status !== 'approved') {
        continue;
      }

      const transitionResult = upsertCoreTask(core, {
        id: current.id,
        title: current.title,
        status: 'in_progress',
      }, now);
      core = transitionResult.core;
    }

    // Update project status to active
    const projectUpdateResult = upsertCoreProject(core, {
      id: projectId,
      title: project.title,
      status: 'active',
    }, now);
    core = projectUpdateResult.core;

    await context.dependencies.coreStore.writeCore(core);

    const projection = buildWorkIntakePlanProjection(
      core,
      projectUpdateResult.project,
    );

    sendJson(context.response, 200, projection);
    return true;
  }

  // POST /api/work/intake/:projectId/reject
  const rejectMatch = matchRoute(
    context.url.pathname,
    WORK_API_INTAKE_REJECT_PATTERN,
  );
  if (rejectMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const projectId = rejectMatch[0];
    if (!projectId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_project_id', message: 'Project id is required.' },
      });
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const notes = readNonEmptyString(body.notes) ?? 'Rejected via work intake plan review.';

    const now = context.dependencies.now?.() ?? new Date();
    let core = await context.dependencies.coreStore.readCore();
    const project = core.projects.find((p) => p.id === projectId);
    if (!project) {
      sendJson(context.response, 404, {
        error: { code: 'project_not_found', message: `No project found for id ${projectId}.` },
      });
      return true;
    }

    const tasks = findIntakeProjectTasks(core, projectId);

    for (const task of tasks) {
      if (task.status !== 'draft') {
        continue;
      }

      // Request approval if not yet requested, then reject
      if (task.approval.status === 'not_requested') {
        const pendingResult = writeApprovalDecision(core, {
          taskId: task.id,
          status: 'pending',
          requestedByActorId: core.ownerProfile.actorId,
        }, now);
        core = pendingResult.core;
      }

      const currentTask = core.tasks.find((t) => t.id === task.id);
      if (currentTask && currentTask.approval.status === 'pending') {
        const rejectResult = writeApprovalDecision(core, {
          taskId: task.id,
          status: 'rejected',
          action: 'reject',
          decidedByActorId: core.ownerProfile.actorId,
          taskStatus: 'cancelled',
          notes,
        }, now);
        core = rejectResult.core;
      }

      const activityResult = appendCoreActivity(core, {
        kind: 'approval_decided',
        projectId,
        taskId: task.id,
        message: `Plan task rejected: "${task.title}". Notes: ${notes}`,
      }, now);
      core = activityResult.core;
    }

    // Update project status to paused so it leaves the pending dashboard
    const projectUpdateResult = upsertCoreProject(core, {
      id: projectId,
      title: project.title,
      status: 'paused',
    }, now);
    core = projectUpdateResult.core;

    await context.dependencies.coreStore.writeCore(core);

    const projection = buildWorkIntakePlanProjection(core, projectUpdateResult.project);
    sendJson(context.response, 200, projection);
    return true;
  }

  // GET /api/work/intake/:projectId/plan
  const planMatch = matchRoute(
    context.url.pathname,
    WORK_API_INTAKE_PLAN_PATTERN,
  );
  if (planMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const projectId = planMatch[0];
    if (!projectId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_project_id', message: 'Project id is required.' },
      });
      return true;
    }

    const core = await context.dependencies.coreStore.readCore();
    const project = core.projects.find((p) => p.id === projectId);
    if (!project) {
      sendJson(context.response, 404, {
        error: { code: 'project_not_found', message: `No project found for id ${projectId}.` },
      });
      return true;
    }

    const projection = buildWorkIntakePlanProjection(core, project);
    if (!projection) {
      sendJson(context.response, 404, {
        error: { code: 'plan_not_found', message: 'No intake plan found for this project.' },
      });
      return true;
    }

    sendJson(context.response, 200, projection);
    return true;
  }

  return false;
}
