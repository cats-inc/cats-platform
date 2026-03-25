import { upsertCoreTask } from '../model/index.js';
import type { CatsCoreState, CoreRecordMetadata } from '../types.js';
import type { OrchestratorDispatchResponse } from '../../platform/orchestration/contracts.js';
import type { OrchestratorDispatchReplayTrigger } from '../../platform/orchestration/dispatchReplay.js';
import type {
  CoreApiRouteContext,
  CoreOrchestratorAutoResumeSummary,
} from './types.js';

function overwriteTaskMetadata(
  core: CatsCoreState,
  taskId: string,
  metadata: CoreRecordMetadata,
  now: Date,
): {
  core: CatsCoreState;
  task: CatsCoreState['tasks'][number];
} | null {
  const task = core.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return null;
  }
  const next = upsertCoreTask(
    core,
    {
      id: task.id,
      title: task.title,
      status: task.status,
      conversationId: task.conversationId,
      parentTaskId: task.parentTaskId ?? null,
      ownerActorId: task.ownerActorId,
      orchestratorActorId: task.orchestratorActorId,
      assignedActorIds: task.assignedActorIds,
      summary: task.summary,
      approval: task.approval,
      createdAt: task.createdAt,
      metadata,
    },
    now,
  );

  return {
    core: next.core,
    task: next.task,
  };
}

export function summarizeOrchestratorReplayDispatch(
  trigger: OrchestratorDispatchReplayTrigger,
  dispatch: OrchestratorDispatchResponse,
): CoreOrchestratorAutoResumeSummary {
  return {
    trigger,
    status: dispatch.dispatch.status === 'dispatched' ? 'dispatched' : 'blocked',
    blockedReason: dispatch.dispatch.blockedReason,
    sourceMessageId: dispatch.dispatch.sourceMessageId,
    resultCount: dispatch.dispatch.results.length,
    executionState: dispatch.executionLoop.execution.state,
  };
}

export function buildOrchestratorReplayFailureSummary(
  trigger: OrchestratorDispatchReplayTrigger,
  error: unknown,
): CoreOrchestratorAutoResumeSummary {
  return {
    trigger,
    status: 'failed',
    blockedReason: null,
    sourceMessageId: null,
    resultCount: 0,
    executionState: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

export async function persistTaskMetadata(
  context: CoreApiRouteContext,
  core: CatsCoreState,
  taskId: string,
  metadata: CoreRecordMetadata,
  now: Date,
): Promise<{
  core: CatsCoreState;
  task: CatsCoreState['tasks'][number] | null;
}> {
  const updated = overwriteTaskMetadata(core, taskId, metadata, now);
  if (!updated) {
    return {
      core,
      task: core.tasks.find((candidate) => candidate.id === taskId) ?? null,
    };
  }

  const persisted = await context.dependencies.coreStore.writeCore(updated.core);
  return {
    core: persisted,
    task: persisted.tasks.find((candidate) => candidate.id === taskId) ?? updated.task,
  };
}
