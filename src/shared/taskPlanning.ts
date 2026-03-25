import type {
  CoreRecordMetadata,
  CoreTaskRecord,
} from '../core/types.js';

export const TASK_PLANNING_METADATA_KEY = 'planning';

export type TaskExecutionProduct = 'chat' | 'work' | 'code';

export interface TaskPlanningTransfer {
  suggestedProduct: TaskExecutionProduct | null;
  rationale: string | null;
}

export interface TaskPlanningMetadata {
  strategyHint: string | null;
  acceptanceCriteria: string | null;
  strategyContext: Record<string, unknown> | null;
  dependsOnTaskIds: string[];
  productHint: TaskExecutionProduct | null;
  transfer: TaskPlanningTransfer | null;
}

export interface TaskPlanningTransferInput {
  suggestedProduct?: TaskExecutionProduct | null;
  rationale?: string | null;
}

export interface TaskPlanningMetadataInput {
  strategyHint?: string | null;
  acceptanceCriteria?: string | null;
  strategyContext?: Record<string, unknown> | null;
  dependsOnTaskIds?: string[] | null;
  productHint?: TaskExecutionProduct | null;
  transfer?: TaskPlanningTransferInput | null;
}

const DEFAULT_TASK_STRATEGY_BY_PRODUCT: Record<TaskExecutionProduct, string> = {
  chat: 'react',
  work: 'pdca',
  code: 'reflexion',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTaskExecutionProduct(value: unknown): TaskExecutionProduct | null {
  return value === 'chat' || value === 'work' || value === 'code'
    ? value
    : null;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => readNonEmptyString(value))
    .filter((value, index, list): value is string =>
      Boolean(value) && list.indexOf(value) === index,
    );
}

function normalizeStrategyContext(value: unknown): Record<string, unknown> | null {
  const context = asRecord(value);
  if (!context) {
    return null;
  }

  return Object.keys(context).length > 0
    ? structuredClone(context)
    : null;
}

function normalizeTransfer(value: unknown): TaskPlanningTransfer | null {
  const transfer = asRecord(value);
  if (!transfer) {
    return null;
  }

  const normalized: TaskPlanningTransfer = {
    suggestedProduct: normalizeTaskExecutionProduct(transfer.suggestedProduct),
    rationale: readNonEmptyString(transfer.rationale),
  };

  return normalized.suggestedProduct || normalized.rationale
    ? normalized
    : null;
}

function createEmptyTaskPlanningMetadata(): TaskPlanningMetadata {
  return {
    strategyHint: null,
    acceptanceCriteria: null,
    strategyContext: null,
    dependsOnTaskIds: [],
    productHint: null,
    transfer: null,
  };
}

function normalizeTaskPlanningMetadata(value: unknown): TaskPlanningMetadata {
  const planning = asRecord(value);
  if (!planning) {
    return createEmptyTaskPlanningMetadata();
  }

  return {
    strategyHint: readNonEmptyString(planning.strategyHint),
    acceptanceCriteria: readNonEmptyString(planning.acceptanceCriteria),
    strategyContext: normalizeStrategyContext(planning.strategyContext),
    dependsOnTaskIds: normalizeStringArray(planning.dependsOnTaskIds),
    productHint: normalizeTaskExecutionProduct(planning.productHint),
    transfer: normalizeTransfer(planning.transfer),
  };
}

function writeNormalizedTaskPlanningMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  planning: TaskPlanningMetadata,
): CoreRecordMetadata {
  const next: CoreRecordMetadata = metadata
    ? structuredClone(metadata)
    : {};

  if (!hasTaskPlanningMetadata(planning)) {
    delete next[TASK_PLANNING_METADATA_KEY];
    return next;
  }

  next[TASK_PLANNING_METADATA_KEY] = {
    ...(planning.strategyHint ? { strategyHint: planning.strategyHint } : {}),
    ...(planning.acceptanceCriteria
      ? { acceptanceCriteria: planning.acceptanceCriteria }
      : {}),
    ...(planning.strategyContext
      ? { strategyContext: structuredClone(planning.strategyContext) }
      : {}),
    ...(planning.dependsOnTaskIds.length > 0
      ? { dependsOnTaskIds: [...planning.dependsOnTaskIds] }
      : {}),
    ...(planning.productHint ? { productHint: planning.productHint } : {}),
    ...(planning.transfer
      ? {
          transfer: {
            ...(planning.transfer.suggestedProduct
              ? { suggestedProduct: planning.transfer.suggestedProduct }
              : {}),
            ...(planning.transfer.rationale
              ? { rationale: planning.transfer.rationale }
              : {}),
          },
        }
      : {}),
  };
  return next;
}

export function hasTaskPlanningMetadata(
  planning: TaskPlanningMetadata | null | undefined,
): boolean {
  return Boolean(
    planning?.strategyHint
    || planning?.acceptanceCriteria
    || planning?.strategyContext
    || planning?.dependsOnTaskIds.length
    || planning?.productHint
    || planning?.transfer,
  );
}

export function readTaskPlanningMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): TaskPlanningMetadata {
  return normalizeTaskPlanningMetadata(metadata?.[TASK_PLANNING_METADATA_KEY]);
}

export function readTaskPlanningMetadataFromTask(
  task: Pick<CoreTaskRecord, 'metadata'>,
): TaskPlanningMetadata {
  return readTaskPlanningMetadata(task.metadata);
}

export function writeTaskPlanningMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  planning: TaskPlanningMetadataInput | null | undefined,
): CoreRecordMetadata {
  return writeNormalizedTaskPlanningMetadata(
    metadata,
    normalizeTaskPlanningMetadata(planning),
  );
}

export function patchTaskPlanningMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  patch: TaskPlanningMetadataInput,
): CoreRecordMetadata {
  const current = readTaskPlanningMetadata(metadata);
  const next: TaskPlanningMetadata = {
    strategyHint:
      patch.strategyHint === undefined
        ? current.strategyHint
        : readNonEmptyString(patch.strategyHint),
    acceptanceCriteria:
      patch.acceptanceCriteria === undefined
        ? current.acceptanceCriteria
        : readNonEmptyString(patch.acceptanceCriteria),
    strategyContext:
      patch.strategyContext === undefined
        ? current.strategyContext
        : normalizeStrategyContext(patch.strategyContext),
    dependsOnTaskIds:
      patch.dependsOnTaskIds === undefined
        ? current.dependsOnTaskIds
        : normalizeStringArray(patch.dependsOnTaskIds),
    productHint:
      patch.productHint === undefined
        ? current.productHint
        : normalizeTaskExecutionProduct(patch.productHint),
    transfer:
      patch.transfer === undefined
        ? current.transfer
        : normalizeTransfer(patch.transfer),
  };

  return writeNormalizedTaskPlanningMetadata(metadata, next);
}

export function resolveDefaultTaskStrategy(
  product: TaskExecutionProduct,
): string {
  return DEFAULT_TASK_STRATEGY_BY_PRODUCT[product];
}

export function resolveEffectiveTaskStrategy(
  product: TaskExecutionProduct | null | undefined,
  planning: Pick<TaskPlanningMetadata, 'strategyHint'> | null | undefined,
): string | null {
  const strategyHint = readNonEmptyString(planning?.strategyHint);
  if (strategyHint) {
    return strategyHint;
  }

  return product ? resolveDefaultTaskStrategy(product) : null;
}
