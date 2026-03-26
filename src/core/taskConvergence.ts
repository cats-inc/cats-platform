import {
  appendCoreActivity,
  upsertCoreTask,
} from './model/index.js';
import {
  cloneTaskInput,
  mergeTaskLifecycleMetadata,
  resolveActorName,
} from './taskLifecycleShared.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreTaskRecord,
  CoreTaskStatus,
} from './types.js';

function isTerminalTaskStatus(status: CoreTaskStatus): boolean {
  return status === 'completed'
    || status === 'blocked'
    || status === 'cancelled'
    || status === 'archived';
}

function summarizeChildStatuses(
  children: CoreTaskRecord[],
): Record<CoreTaskStatus, number> {
  return children.reduce<Record<CoreTaskStatus, number>>((counts, child) => {
    counts[child.status] += 1;
    return counts;
  }, {
    draft: 0,
    pending_approval: 0,
    approved: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
  });
}

function resolveParentStatus(children: CoreTaskRecord[]): CoreTaskStatus {
  if (children.every((child) => child.status === 'completed')) {
    return 'completed';
  }
  if (children.every((child) => child.status === 'cancelled' || child.status === 'archived')) {
    return 'cancelled';
  }
  return 'blocked';
}

function buildParentConvergenceMessage(
  task: CoreTaskRecord,
  actorName: string,
  nextStatus: CoreTaskStatus,
  childCount: number,
): string {
  if (nextStatus === 'completed') {
    return `${actorName} converged parent task "${task.title}" after ${childCount} child task(s) completed.`;
  }
  if (nextStatus === 'cancelled') {
    return `${actorName} converged parent task "${task.title}" after all child task(s) were cancelled.`;
  }
  return `${actorName} converged parent task "${task.title}" into a blocked state after child task outcomes diverged.`;
}

export function reconcileParentTaskConvergence(input: {
  core: CatsCoreState;
  childTaskId: string;
  actorId: string;
  now?: Date;
}): {
  core: CatsCoreState;
  parentTask: CoreTaskRecord | null;
  activity: CoreActivityRecord | null;
} {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const childTask = input.core.tasks.find((candidate) => candidate.id === input.childTaskId) ?? null;
  if (!childTask?.parentTaskId || !isTerminalTaskStatus(childTask.status)) {
    return {
      core: input.core,
      parentTask: null,
      activity: null,
    };
  }

  const parentTask = input.core.tasks.find((candidate) => candidate.id === childTask.parentTaskId) ?? null;
  if (!parentTask || isTerminalTaskStatus(parentTask.status)) {
    return {
      core: input.core,
      parentTask,
      activity: null,
    };
  }

  const childTasks = input.core.tasks.filter((candidate) => candidate.parentTaskId === parentTask.id);
  if (childTasks.length === 0 || childTasks.some((candidate) => !isTerminalTaskStatus(candidate.status))) {
    return {
      core: input.core,
      parentTask,
      activity: null,
    };
  }

  const nextStatus = resolveParentStatus(childTasks);
  const childStatusCounts = summarizeChildStatuses(childTasks);
  const convergedTaskWrite = upsertCoreTask(
    input.core,
    {
      ...cloneTaskInput(parentTask),
      status: nextStatus,
      metadata: mergeTaskLifecycleMetadata(parentTask.metadata, {
        completedAt: nowIso,
        convergence: {
          status: nextStatus,
          convergedAt: nowIso,
          convergedByChildTaskId: childTask.id,
          childTaskIds: childTasks.map((candidate) => candidate.id),
          childStatusCounts,
        },
      }),
    },
    now,
  );
  const actorName = resolveActorName(convergedTaskWrite.core, input.actorId);
  const activityWrite = appendCoreActivity(
    convergedTaskWrite.core,
    {
      kind: 'status_change',
      actorId: input.actorId,
      conversationId: convergedTaskWrite.task.conversationId,
      taskId: convergedTaskWrite.task.id,
      runId: null,
      message: buildParentConvergenceMessage(
        convergedTaskWrite.task,
        actorName,
        nextStatus,
        childTasks.length,
      ),
      metadata: {
        source: 'task-convergence',
        convergedByChildTaskId: childTask.id,
        childTaskIds: childTasks.map((candidate) => candidate.id),
        childStatusCounts,
      },
    },
    now,
  );

  return {
    core: activityWrite.core,
    parentTask: activityWrite.core.tasks.find((candidate) => candidate.id === parentTask.id)
      ?? convergedTaskWrite.task,
    activity: activityWrite.activity,
  };
}
