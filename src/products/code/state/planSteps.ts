import type {
  CatsCoreState,
  CoreRecordMetadata,
  CoreTaskRecord,
} from '../../../core/types.js';
import { upsertCoreTask } from '../../../core/model/taskControls.js';

export const CODE_PLAN_METADATA_KEY = 'codePlan';
export const CODE_PLAN_MAX_STEPS = 50;

export type CodePlanStepStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface CodePlanStep {
  id: string;
  ordinal: number;
  title: string;
  status: CodePlanStepStatus;
  detail: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CodePlanState {
  taskId: string;
  steps: CodePlanStep[];
  version: number;
  replanCount: number;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidStatus(value: unknown): value is CodePlanStepStatus {
  return value === 'not_started'
    || value === 'in_progress'
    || value === 'completed'
    || value === 'blocked';
}

function normalizeStep(raw: unknown, index: number): CodePlanStep | null {
  if (!isRecord(raw)) {
    return null;
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) {
    return null;
  }

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `step-${index}`,
    ordinal: typeof raw.ordinal === 'number' ? raw.ordinal : index,
    title,
    status: isValidStatus(raw.status) ? raw.status : 'not_started',
    detail: typeof raw.detail === 'string' ? raw.detail : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
  };
}

export function readCodePlanFromTask(
  task: Pick<CoreTaskRecord, 'id' | 'metadata'>,
): CodePlanState | null {
  const raw = task.metadata?.[CODE_PLAN_METADATA_KEY];
  if (!isRecord(raw)) {
    return null;
  }

  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = rawSteps
    .map((entry, index) => normalizeStep(entry, index))
    .filter((step): step is CodePlanStep => step !== null)
    .slice(0, CODE_PLAN_MAX_STEPS);

  if (steps.length === 0) {
    return null;
  }

  return {
    taskId: task.id,
    steps,
    version: typeof raw.version === 'number' ? raw.version : 1,
    replanCount: typeof raw.replanCount === 'number' ? raw.replanCount : 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function serializeCodePlan(plan: CodePlanState): Record<string, unknown> {
  return {
    steps: plan.steps.map((step) => ({
      id: step.id,
      ordinal: step.ordinal,
      title: step.title,
      status: step.status,
      ...(step.detail ? { detail: step.detail } : {}),
      ...(step.startedAt ? { startedAt: step.startedAt } : {}),
      ...(step.completedAt ? { completedAt: step.completedAt } : {}),
    })),
    version: plan.version,
    replanCount: plan.replanCount,
    updatedAt: plan.updatedAt,
  };
}

function buildMetadataWithPlan(
  existingMetadata: CoreRecordMetadata | null | undefined,
  plan: CodePlanState,
): CoreRecordMetadata {
  const metadata: CoreRecordMetadata = existingMetadata
    ? structuredClone(existingMetadata)
    : {};
  metadata[CODE_PLAN_METADATA_KEY] = serializeCodePlan(plan);
  return metadata;
}

export function writeCodePlanToTask(
  core: CatsCoreState,
  taskId: string,
  steps: CodePlanStep[],
  now: Date = new Date(),
): { core: CatsCoreState; plan: CodePlanState } {
  const task = core.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const existingPlan = readCodePlanFromTask(task);
  const plan: CodePlanState = {
    taskId,
    steps: steps.slice(0, CODE_PLAN_MAX_STEPS),
    version: (existingPlan?.version ?? 0) + 1,
    replanCount: existingPlan?.replanCount ?? 0,
    updatedAt: now.toISOString(),
  };

  const metadata = buildMetadataWithPlan(task.metadata, plan);
  const result = upsertCoreTask(core, {
    id: task.id,
    title: task.title,
    metadata,
  }, now);

  return { core: result.core, plan };
}

export function updatePlanStepStatus(
  core: CatsCoreState,
  taskId: string,
  stepId: string,
  status: CodePlanStepStatus,
  now: Date = new Date(),
): { core: CatsCoreState; plan: CodePlanState } {
  const task = core.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const plan = readCodePlanFromTask(task);
  if (!plan) {
    throw new Error(`No plan found for task: ${taskId}`);
  }

  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) {
    throw new Error(`Plan step not found: ${stepId}`);
  }

  const nowIso = now.toISOString();
  step.status = status;
  if (status === 'in_progress' && !step.startedAt) {
    step.startedAt = nowIso;
  }
  if (status === 'completed' && !step.completedAt) {
    step.completedAt = nowIso;
  }

  plan.version += 1;
  plan.updatedAt = nowIso;

  const metadata = buildMetadataWithPlan(task.metadata, plan);
  const result = upsertCoreTask(core, {
    id: task.id,
    title: task.title,
    metadata,
  }, now);

  return { core: result.core, plan };
}

export function replanCodeTask(
  core: CatsCoreState,
  taskId: string,
  newSteps: CodePlanStep[],
  now: Date = new Date(),
): { core: CatsCoreState; plan: CodePlanState } {
  const task = core.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const existingPlan = readCodePlanFromTask(task);
  const plan: CodePlanState = {
    taskId,
    steps: newSteps.slice(0, CODE_PLAN_MAX_STEPS),
    version: (existingPlan?.version ?? 0) + 1,
    replanCount: (existingPlan?.replanCount ?? 0) + 1,
    updatedAt: now.toISOString(),
  };

  const metadata = buildMetadataWithPlan(task.metadata, plan);
  const result = upsertCoreTask(core, {
    id: task.id,
    title: task.title,
    metadata,
  }, now);

  return { core: result.core, plan };
}
