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
  task: Pick<CoreTaskRecord, 'conversationId'>;
  product?: TaskExecutionProduct | null;
}

export interface BuildTaskRuntimeExecutionRequestInput {
  core?: Pick<CatsCoreState, 'conversations' | 'workItems'> | null;
  task: Pick<CoreTaskRecord, 'id' | 'conversationId' | 'metadata'>;
  product?: TaskExecutionProduct | null;
  workItemId?: string | null;
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
  correlation: TaskExecutionCorrelation,
): boolean {
  return Boolean(
    correlation.taskId
    || correlation.conversationId
    || correlation.workItemId
    || correlation.product,
  );
}

export function resolveTaskExecutionProduct(
  input: ResolveTaskExecutionProductInput,
): TaskExecutionProduct | null {
  if (input.product) {
    return input.product;
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

  const next: TaskRuntimeExecutionRequest = {};
  if (request.requestedStrategy) {
    next.requestedStrategy = request.requestedStrategy;
  }
  if (request.acceptanceCriteria) {
    next.acceptanceCriteria = request.acceptanceCriteria;
  }
  if (request.strategyContext) {
    next.strategyContext = structuredClone(request.strategyContext);
  }
  if (request.correlation && hasCorrelation(request.correlation)) {
    next.correlation = { ...request.correlation };
  }

  return Object.keys(next).length > 0
    ? next
    : undefined;
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
