import type {
  CatsCoreState,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
} from './types.js';
import type { RuntimeObservedSessionPayload } from '../platform/runtime/client.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function cloneMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): CoreRecordMetadata {
  return metadata ? structuredClone(metadata) : {};
}

export function cloneTaskInput(task: CoreTaskRecord): {
  id: string;
  title: string;
  status: CoreTaskRecord['status'];
  conversationId: string | null;
  parentTaskId?: string | null;
  ownerActorId: string;
  orchestratorActorId: string | null;
  assignedActorIds: string[];
  summary: string | null;
  approval: CoreTaskRecord['approval'];
  createdAt: string;
  metadata: CoreRecordMetadata;
} {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    conversationId: task.conversationId,
    parentTaskId: task.parentTaskId ?? null,
    ownerActorId: task.ownerActorId,
    orchestratorActorId: task.orchestratorActorId,
    assignedActorIds: [...task.assignedActorIds],
    summary: task.summary,
    approval: structuredClone(task.approval),
    createdAt: task.createdAt,
    metadata: cloneMetadata(task.metadata),
  };
}

export function cloneRunInput(run: CoreRunRecord): {
  id: string;
  title: string;
  status: CoreRunRecord['status'];
  conversationId: string | null;
  taskId: string | null;
  parentRunId: string | null;
  orchestratorActorId: string | null;
  traceId: string | null;
  summary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  metadata: CoreRecordMetadata;
} {
  return {
    id: run.id,
    title: run.title,
    status: run.status,
    conversationId: run.conversationId,
    taskId: run.taskId,
    parentRunId: run.parentRunId,
    orchestratorActorId: run.orchestratorActorId,
    traceId: run.traceId,
    summary: run.summary,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    metadata: cloneMetadata(run.metadata),
  };
}

export function isDispatchableTaskStatus(status: CoreTaskRecord['status']): boolean {
  return status === 'approved' || status === 'in_progress';
}

export function resolveActorName(core: CatsCoreState, actorId: string): string {
  return core.actors.find((candidate) => candidate.id === actorId)?.name ?? actorId;
}

export function mergeTaskLifecycleMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  patch: Record<string, unknown>,
): CoreRecordMetadata {
  const next = cloneMetadata(metadata);
  const current = asRecord(next.taskLifecycle) ?? {};
  next.taskLifecycle = {
    ...current,
    ...patch,
  };
  return next;
}

export function mapRuntimeRunStatusToCoreStatus(
  runtimeRunStatus: string | null,
  runtimeState: string | null,
): CoreRunRecord['status'] {
  switch (runtimeRunStatus) {
    case 'running':
      return 'running';
    case 'succeeded':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'cancelled';
    case 'blocked':
    case 'cooldown':
      return 'blocked';
    default:
      return runtimeState === 'running' ? 'running' : 'queued';
  }
}

export function mapCoreRunStatusToTaskStatus(
  status: CoreRunRecord['status'],
): CoreTaskRecord['status'] {
  switch (status) {
    case 'running':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
    case 'queued':
    default:
      return 'approved';
  }
}

export function readObservedInspection(
  payload: RuntimeObservedSessionPayload,
): {
  state: string | null;
  currentRun: Record<string, unknown> | null;
  lastRun: Record<string, unknown> | null;
} {
  const session = asRecord(payload.session);
  const inspection = asRecord(session?.inspection);
  return {
    state: readString(inspection?.state),
    currentRun: asRecord(inspection?.currentRun),
    lastRun: asRecord(inspection?.lastRun),
  };
}

export interface ObservedRuntimeExecutionMetadata {
  requestedStrategy?: string;
  effectiveStrategy?: string;
  acceptanceCriteria?: string;
  strategyContext?: Record<string, unknown>;
  correlation?: Record<string, unknown>;
  strategyState?: Record<string, unknown>;
}

function readObservedStrategyRequest(
  inspectionStrategy: Record<string, unknown> | null,
  sessionStrategy: Record<string, unknown> | null,
  session: Record<string, unknown> | null,
): {
  requestedStrategy: string | null;
  acceptanceCriteria: string | null;
  strategyContext: Record<string, unknown> | null;
  correlation: Record<string, unknown> | null;
} {
  const inspectionStrategyState = asRecord(inspectionStrategy?.state);
  const inspectionRequest = asRecord(inspectionStrategyState?.request);
  const sessionRequest = asRecord(sessionStrategy?.request);

  // Runtime nested strategy state is canonical. Flat inspection/session fields
  // are compatibility projections and only backfill missing values.
  return {
    requestedStrategy: readString(inspectionRequest?.requestedStrategy)
      ?? readString(sessionRequest?.requestedStrategy)
      ?? readString(inspectionStrategy?.requestedStrategy)
      ?? readString(session?.requestedStrategy),
    acceptanceCriteria: readString(inspectionRequest?.acceptanceCriteria)
      ?? readString(sessionRequest?.acceptanceCriteria)
      ?? readString(inspectionStrategy?.acceptanceCriteria)
      ?? readString(session?.acceptanceCriteria),
    strategyContext: asRecord(inspectionRequest?.strategyContext)
      ?? asRecord(sessionRequest?.strategyContext)
      ?? asRecord(inspectionStrategy?.strategyContext)
      ?? asRecord(session?.strategyContext),
    correlation: asRecord(inspectionRequest?.correlation)
      ?? asRecord(sessionRequest?.correlation)
      ?? asRecord(inspectionStrategy?.correlation)
      ?? asRecord(session?.correlation),
  };
}

function readObservedEffectiveStrategy(
  inspectionStrategy: Record<string, unknown> | null,
  sessionStrategy: Record<string, unknown> | null,
  session: Record<string, unknown> | null,
): string | null {
  const inspectionStrategyState = asRecord(inspectionStrategy?.state);
  return readString(inspectionStrategyState?.effectiveStrategy)
    ?? readString(sessionStrategy?.effectiveStrategy)
    ?? readString(inspectionStrategy?.effectiveStrategy)
    ?? readString(session?.effectiveStrategy);
}

function sanitizeObservedStrategyState(
  strategyState: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!strategyState) {
    return null;
  }

  const summary = asRecord(strategyState.summary);
  const sanitized: Record<string, unknown> = {};
  const effectiveStrategy = readString(strategyState.effectiveStrategy);
  const resolutionSource = readString(strategyState.resolutionSource);
  const updatedAt = readString(strategyState.updatedAt);

  if (effectiveStrategy) {
    sanitized.effectiveStrategy = effectiveStrategy;
  }
  if (resolutionSource) {
    sanitized.resolutionSource = resolutionSource;
  }
  if (updatedAt) {
    sanitized.updatedAt = updatedAt;
  }
  if (summary) {
    sanitized.summary = structuredClone(summary);
  }

  return Object.keys(sanitized).length > 0
    ? sanitized
    : null;
}

export function readObservedExecutionMetadata(
  payload: RuntimeObservedSessionPayload,
): ObservedRuntimeExecutionMetadata | null {
  const session = asRecord(payload.session);
  const inspection = asRecord(session?.inspection);
  const inspectionStrategy = asRecord(inspection?.strategy);
  const sessionStrategy = asRecord(session?.strategy);
  const strategyRequest = readObservedStrategyRequest(
    inspectionStrategy,
    sessionStrategy,
    session,
  );
  const strategyState = sanitizeObservedStrategyState(
    asRecord(inspectionStrategy?.state) ?? sessionStrategy,
  );
  const requestedStrategy = strategyRequest.requestedStrategy;
  const effectiveStrategy = readObservedEffectiveStrategy(
    inspectionStrategy,
    sessionStrategy,
    session,
  );
  const acceptanceCriteria = strategyRequest.acceptanceCriteria;
  const strategyContext = strategyRequest.strategyContext;
  const correlation = strategyRequest.correlation;

  if (
    !requestedStrategy
    && !effectiveStrategy
    && !acceptanceCriteria
    && !strategyContext
    && !correlation
    && !strategyState
  ) {
    return null;
  }

  return {
    ...(requestedStrategy ? { requestedStrategy } : {}),
    ...(effectiveStrategy ? { effectiveStrategy } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    ...(strategyContext ? { strategyContext: structuredClone(strategyContext) } : {}),
    ...(correlation ? { correlation: structuredClone(correlation) } : {}),
    ...(strategyState ? { strategyState: structuredClone(strategyState) } : {}),
  };
}

export function mergeObservedExecutionMetadata(
  existing: unknown,
  observed: ObservedRuntimeExecutionMetadata | null | undefined,
  observedAt: string,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = asRecord(existing)
    ? structuredClone(asRecord(existing)!)
    : {};

  if (observed?.requestedStrategy) {
    next.requestedStrategy = observed.requestedStrategy;
  }
  if (observed?.effectiveStrategy) {
    next.effectiveStrategy = observed.effectiveStrategy;
  }
  if (observed?.acceptanceCriteria) {
    next.acceptanceCriteria = observed.acceptanceCriteria;
  }
  if (observed?.strategyContext) {
    next.strategyContext = structuredClone(observed.strategyContext);
  }
  if (observed?.correlation) {
    next.correlation = structuredClone(observed.correlation);
  }
  if (observed?.strategyState) {
    next.strategyState = structuredClone(observed.strategyState);
  }

  if (Object.keys(next).length === 0) {
    return undefined;
  }

  next.observedAt = observedAt;
  return next;
}

export function isTerminalCoreRunStatus(status: CoreRunRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'blocked' || status === 'cancelled';
}

export function buildTerminalTaskMessage(
  task: CoreTaskRecord,
  actorName: string,
  runStatus: CoreRunRecord['status'],
): string {
  switch (runStatus) {
    case 'completed':
      return `${actorName} completed "${task.title}".`;
    case 'failed':
      return `${actorName} failed "${task.title}".`;
    case 'cancelled':
      return `${actorName} cancelled "${task.title}".`;
    case 'blocked':
      return `${actorName} blocked "${task.title}".`;
    case 'running':
      return `${actorName} started "${task.title}".`;
    case 'queued':
    default:
      return `${actorName} queued "${task.title}".`;
  }
}
