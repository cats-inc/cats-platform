import type { CoreStore } from '../../core/store.js';
import type { CoreRunRecord } from '../../core/types.js';
import { upsertCoreRun } from '../../core/model/index.js';
import {
  ADDRESSABLE_TARGET_KIND_VALUES,
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type AddressableTarget,
  type AsyncLifecycleRequestResult,
  type BudgetEnvelope,
  type LifecycleRequestRef,
  type RunRef,
  type SupervisedToolManifest,
} from './contracts.js';
import { deriveChildBudgetEnvelope } from './budget.js';
import { deriveRunState, writeRunStateMetadata } from './runState.js';
import type {
  SupervisedToolExecutor,
} from './toolBoundary.js';
import type { SupervisedToolRegistry } from './toolRegistry.js';

export const SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL = 'cats.lifecycle.run.spawn' as const;

export interface SupervisedLifecycleRunSpawnInput {
  title: string;
  target: AddressableTarget;
  parentRunId?: string;
  conversationId?: string | null;
  taskId?: string | null;
  requestedBudget?: BudgetEnvelope;
  summary?: string | null;
}

export interface SupervisedLifecycleTools {
  manifests: SupervisedToolManifest[];
  executors: {
    [SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL]: SupervisedToolExecutor<
      SupervisedLifecycleRunSpawnInput,
      RunRef | LifecycleRequestRef
    >;
  };
  register(registry: SupervisedToolRegistry): void;
}

export function createSupervisedLifecycleTools(input: {
  coreStore: CoreStore;
  now?: () => Date;
}): SupervisedLifecycleTools {
  const manifests = createSupervisedLifecycleToolManifests();

  return {
    manifests,
    executors: {
      [SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL]: createRunSpawnExecutor(input),
    },
    register(registry) {
      for (const manifest of manifests) {
        registry.register(manifest);
      }
    },
  };
}

export function createSupervisedLifecycleToolManifests(): SupervisedToolManifest[] {
  return [
    {
      schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
      name: SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL,
      manifestVersion: '1.0',
      description: 'Spawn a managed child run under the supervision lifecycle scheduler.',
      sideEffect: 'local_state',
      preflight: 'required',
      blocking: 'async',
      cancellation: 'cooperative',
      approval: 'policy',
      evidence: 'summary',
      failureCodes: ['E_TOOL_SCOPE_DENIED', 'E_PRECHECK_FAILED', 'E_BUDGET_EXCEEDED'],
      inputSchema: {
        id: `${SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL}.input`,
        version: '1.0',
        format: 'json_schema',
      },
      outputSchema: {
        id: `${SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL}.output`,
        version: '1.0',
        format: 'json_schema',
      },
    },
  ];
}

function createRunSpawnExecutor(input: {
  coreStore: CoreStore;
  now?: () => Date;
}): SupervisedToolExecutor<SupervisedLifecycleRunSpawnInput, RunRef | LifecycleRequestRef> {
  return async (toolInput, context): Promise<AsyncLifecycleRequestResult> => {
    if (!isRunSpawnInput(toolInput)) {
      return rejected('E_PRECHECK_FAILED', 'Invalid lifecycle run spawn input.');
    }

    const now = input.now?.() ?? new Date();
    const evaluatedAt = now.toISOString();
    const core = await input.coreStore.readCore();
    const parentRunId = toolInput.parentRunId ?? context.runId;
    const parentRun = core.runs.find((candidate) => candidate.id === parentRunId) ?? null;

    if (!parentRun) {
      return rejected('E_PRECHECK_FAILED', `Parent run not found: ${parentRunId}`);
    }

    const parentBudget = readRunBudget(parentRun);
    if (!parentBudget) {
      return rejected(
        'E_BUDGET_EXCEEDED',
        `Parent run has no supervision budget: ${parentRunId}`,
      );
    }

    const budget = deriveChildBudgetEnvelope({
      parent: parentBudget,
      requested: toolInput.requestedBudget,
      defaults: {
        hardStop: true,
      },
    });
    const runState = deriveRunState({ lifecycle: 'queued' });
    const next = upsertCoreRun(
      core,
      {
        title: toolInput.title,
        status: 'queued',
        conversationId: toolInput.conversationId ?? parentRun.conversationId,
        taskId: toolInput.taskId === undefined ? null : toolInput.taskId,
        parentRunId: parentRun.id,
        orchestratorActorId: context.actorRef,
        summary: toolInput.summary ?? 'Queued supervised child run.',
        createdAt: evaluatedAt,
        metadata: writeRunStateMetadata({
          metadata: {
            supervision: {
              source: 'supervised_lifecycle_run_spawn',
              parentRunId: parentRun.id,
              parentActionId: context.actionId,
              target: toolInput.target,
              budget,
              budgetSource: 'parent_run_cap',
            },
          },
          evaluation: runState,
          evaluatedAt,
        }),
      },
      now,
    );
    const persisted = await input.coreStore.writeCore(next.core);
    const childRun = persisted.runs.find((candidate) => candidate.id === next.run.id) ?? next.run;

    return {
      status: 'applied',
      result: {
        kind: 'run',
        runId: childRun.id,
        parentRunId: parentRun.id,
      },
    };
  };
}

function readRunBudget(run: CoreRunRecord): BudgetEnvelope | undefined {
  const metadata = asRecord(run.metadata);
  const supervision = asRecord(metadata?.supervision);

  return readBudgetEnvelope(supervision?.budget) ??
    readBudgetEnvelope(metadata?.supervisionBudget);
}

function readBudgetEnvelope(value: unknown): BudgetEnvelope | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const budget: BudgetEnvelope = {
    ...readFiniteNumberProperty(record, 'maxCostUsd'),
    ...readFiniteNumberProperty(record, 'maxTokens'),
    ...readFiniteNumberProperty(record, 'maxDurationMs'),
    ...(typeof record.hardStop === 'boolean' ? { hardStop: record.hardStop } : {}),
  };

  return Object.keys(budget).length > 0 ? budget : undefined;
}

function readFiniteNumberProperty(
  record: Record<string, unknown>,
  key: 'maxCostUsd' | 'maxTokens' | 'maxDurationMs',
): Pick<BudgetEnvelope, typeof key> {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? { [key]: value } as Pick<BudgetEnvelope, typeof key>
    : {};
}

function isRunSpawnInput(value: unknown): value is SupervisedLifecycleRunSpawnInput {
  const record = asRecord(value);

  return record !== null &&
    typeof record.title === 'string' &&
    record.title.trim() !== '' &&
    isAddressableTarget(record.target) &&
    (record.parentRunId === undefined || typeof record.parentRunId === 'string') &&
    (record.conversationId === undefined ||
      record.conversationId === null ||
      typeof record.conversationId === 'string') &&
    (record.taskId === undefined || record.taskId === null || typeof record.taskId === 'string') &&
    (record.requestedBudget === undefined || readBudgetEnvelope(record.requestedBudget) !== undefined) &&
    (record.summary === undefined || record.summary === null || typeof record.summary === 'string');
}

function isAddressableTarget(value: unknown): value is AddressableTarget {
  const record = asRecord(value);

  return record !== null &&
    typeof record.kind === 'string' &&
    ADDRESSABLE_TARGET_KIND_VALUES.includes(record.kind as AddressableTarget['kind']);
}

function rejected(
  code: 'E_PRECHECK_FAILED' | 'E_BUDGET_EXCEEDED',
  message: string,
): AsyncLifecycleRequestResult {
  return {
    status: 'rejected',
    error: {
      code,
      message,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
