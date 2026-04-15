import type { CoreTaskStatus } from './types.js';

export const CORE_TASK_VIEW_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
] as const satisfies readonly CoreTaskStatus[];

export interface CoreTaskViewCommonQuery {
  containerIds?: string[];
  conversationIds?: string[];
  taskStatuses?: CoreTaskStatus[];
  limit?: number | null;
}

export function matchesCoreTaskViewCommonQuery(
  input: {
    containerId: string | null;
    conversationId: string | null;
    taskStatus: CoreTaskStatus;
  },
  query: CoreTaskViewCommonQuery,
): boolean {
  if (
    query.containerIds?.length
    && (!input.containerId || !query.containerIds.includes(input.containerId))
  ) {
    return false;
  }

  if (
    query.conversationIds?.length
    && (!input.conversationId || !query.conversationIds.includes(input.conversationId))
  ) {
    return false;
  }

  if (query.taskStatuses?.length && !query.taskStatuses.includes(input.taskStatus)) {
    return false;
  }

  return true;
}

export function applyCoreTaskViewLimit<T>(
  items: T[],
  limit: number | null | undefined,
): T[] {
  if (!limit || limit >= items.length) {
    return items;
  }

  return items.slice(0, limit);
}

export function countCoreTaskViewConversations<T extends {
  conversationId: string | null;
}>(
  items: T[],
): number {
  return new Set(
    items
      .map((item) => item.conversationId)
      .filter((conversationId): conversationId is string => Boolean(conversationId)),
  ).size;
}

export function buildCoreTaskStatusCounts<T extends {
  taskStatus: CoreTaskStatus;
}>(
  items: T[],
): Record<CoreTaskStatus, number> {
  const counts = Object.fromEntries(
    CORE_TASK_VIEW_STATUSES.map((status) => [status, 0]),
  ) as Record<CoreTaskStatus, number>;

  for (const item of items) {
    counts[item.taskStatus] += 1;
  }

  return counts;
}
