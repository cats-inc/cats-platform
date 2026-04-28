import { resolveTaskExecutionProduct } from '../../../shared/taskExecutionBridge.js';
import type {
  CatsCoreState,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreWorkItemStatus,
} from '../../../core/types.js';
import type { WorkTaskProductBinding } from '../shared/workGraphTypes.js';

export function buildTaskStatusCounts(tasks: CoreTaskRecord[]): Record<CoreTaskRecord['status'], number> {
  return tasks.reduce<Record<CoreTaskRecord['status'], number>>(
    (counts, task) => {
      counts[task.status] += 1;
      return counts;
    },
    {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
      archived: 0,
    },
  );
}

export function resolveTaskProductBinding(
  core: CatsCoreState,
  task: CoreTaskRecord,
): WorkTaskProductBinding {
  if (core.workItems.some((workItem) => workItem.taskId === task.id)) {
    return 'work';
  }
  if (core.artifacts.some((artifact) => artifact.taskId === task.id && (
    artifact.kind === 'build' || artifact.kind === 'preview'
  ))) {
    return 'code';
  }

  const executionProduct = resolveTaskExecutionProduct({ core, task });
  return executionProduct === 'work'
    ? 'unbound'
    : executionProduct ?? 'unbound';
}

export function isWorkTask(core: CatsCoreState, task: CoreTaskRecord): boolean {
  return resolveTaskProductBinding(core, task) === 'work';
}

export function buildProjectStatusCounts(core: CatsCoreState): Record<CoreProjectStatus, number> {
  return core.projects.reduce<Record<CoreProjectStatus, number>>(
    (counts, project) => {
      counts[project.status] += 1;
      return counts;
    },
    { planned: 0, active: 0, paused: 0, archived: 0 },
  );
}

export function buildWorkItemStatusCounts(core: CatsCoreState): Record<CoreWorkItemStatus, number> {
  return core.workItems.reduce<Record<CoreWorkItemStatus, number>>(
    (counts, workItem) => {
      counts[workItem.status] += 1;
      return counts;
    },
    {
      draft: 0,
      planned: 0,
      ready: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
      archived: 0,
    },
  );
}

export function resolveActorName(core: CatsCoreState, actorId: string | null | undefined): string {
  if (!actorId) {
    return 'Unknown owner';
  }

  if (actorId === core.ownerProfile.actorId) {
    return core.ownerProfile.displayName;
  }

  return core.actors.find((actor) => actor.id === actorId)?.name ?? actorId;
}

export function resolveConversationTitle(
  core: CatsCoreState,
  conversationId: string | null,
): string | null {
  if (!conversationId) {
    return null;
  }

  return core.conversations.find((conversation) => conversation.id === conversationId)?.title ?? null;
}
