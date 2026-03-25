import type {
  CatsCoreState,
  CoreConversationKind,
  CoreTaskRecord,
} from '../core/types.js';
import {
  readTaskPlanningMetadataFromTask,
  resolveEffectiveTaskStrategy,
  type TaskExecutionProduct,
} from './taskPlanning.js';

export interface TaskExecutionCorrelation {
  taskId?: string;
  conversationId?: string;
  workItemId?: string;
  product?: TaskExecutionProduct;
}

export interface TaskRuntimeExecutionRequest {
  requestedStrategy?: string;
  acceptanceCriteria?: string;
  strategyContext?: Record<string, unknown>;
  correlation?: TaskExecutionCorrelation;
}

export interface ResolveTaskExecutionProductInput {
  core?: Pick<CatsCoreState, 'conversations'> | null;
  task: Pick<CoreTaskRecord, 'conversationId' | 'metadata'>;
  product?: TaskExecutionProduct | null;
}

export interface BuildTaskRuntimeExecutionRequestInput {
  core?: Pick<CatsCoreState, 'conversations' | 'workItems'> | null;
  task: Pick<CoreTaskRecord, 'id' | 'conversationId' | 'metadata'>;
  product?: TaskExecutionProduct | null;
  workItemId?: string | null;
}

function readNonEmptyString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mapConversationKindToProduct(
  kind: CoreConversationKind | null | undefined,
): TaskExecutionProduct | null {
  switch (kind) {
    case 'work_thread':
      return 'work';
    case 'code_thread':
      return 'code';
    case 'chat_channel':
    case 'direct_message':
    case 'external_transport':
    case 'private_escalation':
      return 'chat';
    default:
      return null;
  }
}

function resolveTaskWorkItemId(
  core: Pick<CatsCoreState, 'workItems'> | null | undefined,
  taskId: string,
): string | null {
  if (!core) {
    return null;
  }

  return [...core.workItems]
    .filter((workItem) => workItem.taskId === taskId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    ?.id ?? null;
}

function hasCorrelation(
  correlation: TaskExecutionCorrelation | null | undefined,
): boolean {
  return Boolean(
    correlation?.taskId
    || correlation?.conversationId
    || correlation?.workItemId
    || correlation?.product,
  );
}

function cloneNonEmptyRecord(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  return value && Object.keys(value).length > 0
    ? structuredClone(value)
    : undefined;
}

export function cloneTaskExecutionCorrelation(
  correlation: TaskExecutionCorrelation | null | undefined,
): TaskExecutionCorrelation | undefined {
  if (!correlation) {
    return undefined;
  }

  const next: TaskExecutionCorrelation = {
    ...(readNonEmptyString(correlation.taskId) ? { taskId: readNonEmptyString(correlation.taskId)! } : {}),
    ...(readNonEmptyString(correlation.conversationId)
      ? { conversationId: readNonEmptyString(correlation.conversationId)! }
      : {}),
    ...(readNonEmptyString(correlation.workItemId)
      ? { workItemId: readNonEmptyString(correlation.workItemId)! }
      : {}),
    ...(correlation.product ? { product: correlation.product } : {}),
  };

  return hasCorrelation(next)
    ? next
    : undefined;
}

export function resolveTaskExecutionProduct(
  input: ResolveTaskExecutionProductInput,
): TaskExecutionProduct | null {
  if (input.product) {
    return input.product;
  }

  const planning = readTaskPlanningMetadataFromTask(input.task);
  // Product-owned planning handoff is authoritative when present. Conversation
  // kind only backfills product selection for legacy/no-planning flows.
  if (planning.productHint) {
    return planning.productHint;
  }
  if (planning.transfer?.suggestedProduct) {
    return planning.transfer.suggestedProduct;
  }

  if (!input.core || !input.task.conversationId) {
    return null;
  }

  const conversation = input.core.conversations.find(
    (candidate) => candidate.id === input.task.conversationId,
  );
  return mapConversationKindToProduct(conversation?.kind);
}

export function cloneTaskRuntimeExecutionRequest(
  request: TaskRuntimeExecutionRequest | null | undefined,
): TaskRuntimeExecutionRequest | undefined {
  if (!request) {
    return undefined;
  }

  const requestedStrategy = readNonEmptyString(request.requestedStrategy);
  const acceptanceCriteria = readNonEmptyString(request.acceptanceCriteria);
  const strategyContext = cloneNonEmptyRecord(request.strategyContext);
  const correlation = cloneTaskExecutionCorrelation(request.correlation);
  const next: TaskRuntimeExecutionRequest = {
    ...(requestedStrategy ? { requestedStrategy } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    ...(strategyContext ? { strategyContext } : {}),
    ...(correlation ? { correlation } : {}),
  };

  return Object.keys(next).length > 0
    ? next
    : undefined;
}

export function appendTaskRuntimeExecutionRequestFields(
  payload: Record<string, unknown>,
  request: TaskRuntimeExecutionRequest | null | undefined,
): void {
  const serialized = serializeTaskRuntimeExecutionRequest(request);
  if (!serialized) {
    return;
  }

  Object.assign(payload, serialized);
}

export function serializeTaskRuntimeExecutionRequest(
  request: TaskRuntimeExecutionRequest | null | undefined,
): Record<string, unknown> | null {
  const cloned = cloneTaskRuntimeExecutionRequest(request);
  return cloned ? cloned as Record<string, unknown> : null;
}

export function buildTaskRuntimeExecutionRequest(
  input: BuildTaskRuntimeExecutionRequestInput,
): TaskRuntimeExecutionRequest {
  const planning = readTaskPlanningMetadataFromTask(input.task);
  const product = resolveTaskExecutionProduct({
    core: input.core,
    task: input.task,
    product: input.product,
  });
  const workItemId = input.workItemId
    ?? resolveTaskWorkItemId(input.core, input.task.id);
  const requestedStrategy = resolveEffectiveTaskStrategy(product, planning);
  const correlation: TaskExecutionCorrelation = {
    taskId: input.task.id,
    ...(input.task.conversationId
      ? { conversationId: input.task.conversationId }
      : {}),
    ...(workItemId ? { workItemId } : {}),
    ...(product ? { product } : {}),
  };

  return {
    ...(requestedStrategy ? { requestedStrategy } : {}),
    ...(planning.acceptanceCriteria
      ? { acceptanceCriteria: planning.acceptanceCriteria }
      : {}),
    ...(planning.strategyContext
      ? { strategyContext: structuredClone(planning.strategyContext) }
      : {}),
    ...(hasCorrelation(correlation) ? { correlation } : {}),
  };
}
