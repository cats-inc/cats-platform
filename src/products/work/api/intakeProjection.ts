import type {
  CatsCoreState,
  CoreApprovalRecord,
  CoreProjectRecord,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
} from '../../../core/types.js';
import {
  readTaskPlanningMetadata,
  type TaskExecutionProduct,
} from '../../../shared/taskPlanning.js';
import { resolveTaskExecutionProduct } from '../../../shared/taskExecutionBridge.js';
import { getWorkTemplate } from '../templates/index.js';

export interface WorkIntakePlanTaskView {
  id: string;
  title: string;
  status: CoreTaskStatus;
  summary: string | null;
  productHint: TaskExecutionProduct | null;
  strategyHint: string | null;
  acceptanceCriteria: string | null;
  dependsOnTaskIds: string[];
  blueprintKey: string | null;
  roleKey: string | null;
  approval: CoreApprovalRecord;
  handoff: {
    state: 'pending_review' | 'active_here' | 'ready_for_pickup' | 'completed' | 'stopped';
    label: string;
    nextAction: string;
    targetProduct: TaskExecutionProduct;
  };
}

export interface WorkIntakePlanProjection {
  product: { id: 'work'; name: 'Cats Work' };
  project: CoreProjectRecord;
  workItem: CoreWorkItemRecord;
  template: { id: string; label: string } | null;
  tasks: WorkIntakePlanTaskView[];
  planStatus: 'draft' | 'approved' | 'rejected';
  activity: { totalCount: number; latestMessages: string[] };
}

function resolveIntakeMetadata(
  project: CoreProjectRecord,
): { templateId: string | null } {
  const intake = project.metadata?.intake;
  if (!intake || typeof intake !== 'object' || Array.isArray(intake)) {
    return { templateId: null };
  }

  const templateId = (intake as Record<string, unknown>).templateId;
  return {
    templateId: typeof templateId === 'string' ? templateId : null,
  };
}

function resolveWorkIntakeMetadata(
  task: CoreTaskRecord,
): { blueprintKey: string | null; roleKey: string | null; projectId: string | null } {
  const workIntake = task.metadata?.workIntake;
  if (!workIntake || typeof workIntake !== 'object' || Array.isArray(workIntake)) {
    return { blueprintKey: null, roleKey: null, projectId: null };
  }

  const record = workIntake as Record<string, unknown>;
  return {
    blueprintKey: typeof record.blueprintKey === 'string' ? record.blueprintKey : null,
    roleKey: typeof record.roleKey === 'string' ? record.roleKey : null,
    projectId: typeof record.projectId === 'string' ? record.projectId : null,
  };
}

function resolvePlanStatus(
  tasks: CoreTaskRecord[],
): 'draft' | 'approved' | 'rejected' {
  if (tasks.length === 0) {
    return 'draft';
  }

  const hasRejected = tasks.some(
    (task) => task.approval.status === 'rejected' || task.status === 'cancelled',
  );
  if (hasRejected) {
    return 'rejected';
  }

  const allApproved = tasks.every(
    (task) => task.approval.status === 'approved'
      || task.status === 'approved'
      || task.status === 'in_progress'
      || task.status === 'completed',
  );
  if (allApproved) {
    return 'approved';
  }

  return 'draft';
}

function productLabel(product: TaskExecutionProduct): string {
  switch (product) {
    case 'chat':
      return 'Chat';
    case 'code':
      return 'Code';
    default:
      return 'Work';
  }
}

function buildTaskHandoffView(
  task: CoreTaskRecord,
  targetProduct: TaskExecutionProduct,
): WorkIntakePlanTaskView['handoff'] {
  if (task.approval.status === 'rejected' || task.status === 'cancelled') {
    return {
      state: 'stopped',
      label: 'Stopped',
      nextAction: 'Revise the intake or start a new plan.',
      targetProduct,
    };
  }

  if (task.status === 'completed') {
    return {
      state: 'completed',
      label: 'Completed',
      nextAction: `Review the completed ${productLabel(targetProduct)} output.`,
      targetProduct,
    };
  }

  if (
    task.approval.status !== 'approved'
    && task.status !== 'approved'
    && task.status !== 'in_progress'
  ) {
    return {
      state: 'pending_review',
      label: 'Pending review',
      nextAction: 'Review and approve this plan in Work.',
      targetProduct,
    };
  }

  if (targetProduct === 'work') {
    return {
      state: 'active_here',
      label: 'Active in Work',
      nextAction: 'Continue coordinating this task from Cats Work.',
      targetProduct,
    };
  }

  return {
    state: 'ready_for_pickup',
    label: `Ready for ${productLabel(targetProduct)} pickup`,
    nextAction: `Open Cats ${productLabel(targetProduct)} to continue this task.`,
    targetProduct,
  };
}

export function findIntakeProjectTasks(
  core: CatsCoreState,
  projectId: string,
): CoreTaskRecord[] {
  return core.tasks.filter((task) => {
    const meta = resolveWorkIntakeMetadata(task);
    return meta.projectId === projectId;
  });
}

export function buildWorkIntakePlanProjection(
  core: CatsCoreState,
  project: CoreProjectRecord,
): WorkIntakePlanProjection | null {
  const workItem = core.workItems.find(
    (candidate) => candidate.projectId === project.id,
  );
  if (!workItem) {
    return null;
  }

  const tasks = findIntakeProjectTasks(core, project.id);
  const { templateId } = resolveIntakeMetadata(project);
  const template = templateId ? getWorkTemplate(templateId) : null;

  const taskViews: WorkIntakePlanTaskView[] = tasks.map((task) => {
    const planning = readTaskPlanningMetadata(task.metadata);
    const workIntake = resolveWorkIntakeMetadata(task);
    const targetProduct = planning.productHint ?? resolveTaskExecutionProduct({ core, task }) ?? 'work';

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      summary: task.summary,
      productHint: planning.productHint,
      strategyHint: planning.strategyHint,
      acceptanceCriteria: planning.acceptanceCriteria,
      dependsOnTaskIds: planning.dependsOnTaskIds,
      blueprintKey: workIntake.blueprintKey,
      roleKey: workIntake.roleKey,
      approval: task.approval,
      handoff: buildTaskHandoffView(task, targetProduct),
    };
  });

  const projectActivity = core.activities
    .filter((activity) => activity.projectId === project.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    product: { id: 'work', name: 'Cats Work' },
    project,
    workItem,
    template: template
      ? { id: template.id, label: template.label }
      : templateId
        ? { id: templateId, label: templateId }
        : null,
    tasks: taskViews,
    planStatus: resolvePlanStatus(tasks),
    activity: {
      totalCount: projectActivity.length,
      latestMessages: projectActivity.slice(0, 6).map((a) => a.message),
    },
  };
}

export { resolveIntakeMetadata };
