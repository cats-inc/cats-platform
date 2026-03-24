import { createCatActorId, GLOBAL_ORCHESTRATOR_ACTOR_ID } from './actors.js';
import type {
  CatsCoreState,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
} from './types.js';
import type {
  ChatChannelState,
  ChatState,
} from '../products/chat/api/contracts.js';
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

export function resolveConversationChannel(
  core: CatsCoreState,
  chat: ChatState,
  task: CoreTaskRecord,
): ChatChannelState | null {
  if (!task.conversationId) {
    return null;
  }

  const conversation = core.conversations.find((candidate) => candidate.id === task.conversationId);
  if (!conversation?.sourceChannelId) {
    return null;
  }

  return chat.channels.find((candidate) => candidate.id === conversation.sourceChannelId) ?? null;
}

export function resolveActorSessionId(
  channel: ChatChannelState | null,
  actorId: string,
): string | null {
  if (!channel) {
    return null;
  }

  if (actorId === GLOBAL_ORCHESTRATOR_ACTOR_ID) {
    return channel.orchestratorLease.sessionId;
  }

  const assignment = channel.catAssignments.find((candidate) =>
    candidate.status === 'active' && createCatActorId(candidate.catId) === actorId);
  return assignment?.execution.lease.sessionId ?? null;
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
