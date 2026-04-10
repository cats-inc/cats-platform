import { resolveTaskExecutionProduct } from '../../../shared/taskExecutionBridge.js';
import type {
  CatsCoreState,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreWorkItemStatus,
} from '../../../core/types.js';

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

export function isWorkTask(core: CatsCoreState, task: CoreTaskRecord): boolean {
  if (core.workItems.some((workItem) => workItem.taskId === task.id)) {
    return true;
  }

  return resolveTaskExecutionProduct({ core, task }) === 'work';
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
