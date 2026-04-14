import type {
  CatsCoreState,
  CoreRunRecord,
  CoreRunStatus,
  CoreTraceKind,
  CoreTraceRecord,
} from './types.js';

export interface CoreRunListQuery {
  statuses?: CoreRunStatus[];
  conversationIds?: string[];
  taskIds?: string[];
  parentRunIds?: string[];
  orchestratorActorIds?: string[];
  traceIds?: string[];
  limit?: number;
}

export interface CoreTraceListQuery {
  kinds?: CoreTraceKind[];
  conversationIds?: string[];
  runIds?: string[];
  taskIds?: string[];
  actorIds?: string[];
  traceIds?: string[];
  limit?: number;
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function compareByCreatedAt(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  const createdComparison = right.createdAt.localeCompare(left.createdAt);
  if (createdComparison !== 0) {
    return createdComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesRunQuery(
  run: CoreRunRecord,
  query: CoreRunListQuery,
): boolean {
  if (
    query.statuses
    && !query.statuses.includes(run.status)
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(run.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.taskIds
    && !query.taskIds.includes(run.taskId ?? '')
  ) {
    return false;
  }
  if (
    query.parentRunIds
    && !query.parentRunIds.includes(run.parentRunId ?? '')
  ) {
    return false;
  }
  if (
    query.orchestratorActorIds
    && !query.orchestratorActorIds.includes(run.orchestratorActorId ?? '')
  ) {
    return false;
  }
  if (
    query.traceIds
    && !query.traceIds.includes(run.traceId ?? '')
  ) {
    return false;
  }
  return true;
}

function matchesTraceQuery(
  trace: CoreTraceRecord,
  query: CoreTraceListQuery,
): boolean {
  if (
    query.kinds
    && !query.kinds.includes(trace.kind)
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(trace.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.runIds
    && !query.runIds.includes(trace.runId ?? '')
  ) {
    return false;
  }
  if (
    query.taskIds
    && !query.taskIds.includes(trace.taskId ?? '')
  ) {
    return false;
  }
  if (
    query.actorIds
    && !query.actorIds.includes(trace.actorId ?? '')
  ) {
    return false;
  }
  if (
    query.traceIds
    && !query.traceIds.includes(trace.traceId)
  ) {
    return false;
  }
  return true;
}

export function listRuns(
  core: CatsCoreState,
  query: CoreRunListQuery = {},
): CoreRunRecord[] {
  return core.runs
    .filter((run) => matchesRunQuery(run, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listTraces(
  core: CatsCoreState,
  query: CoreTraceListQuery = {},
): CoreTraceRecord[] {
  return core.traces
    .filter((trace) => matchesTraceQuery(trace, query))
    .sort(compareByCreatedAt)
    .slice(0, query.limit);
}
