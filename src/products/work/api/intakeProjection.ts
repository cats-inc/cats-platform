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

  const hasRejected = tasks.some((task) => task.approval.status === 'rejected');
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
