import type { RoutingTarget } from '../mentionRouter.js';
import type { ChatStore } from '../store.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { CatsCoreState, CoreTaskRecord } from '../../../../core/types.js';
import {
  buildTaskRuntimeExecutionRequest,
  type TaskRuntimeExecutionRequest,
} from '../../../../shared/taskExecutionBridge.js';
import {
  checkoutTaskExecution,
  startTaskRunWatcher,
} from '../../../../core/taskLifecycle.js';
import { resolveActorIdForTarget } from './state.js';

export interface ChannelTaskExecutionContext {
  core: CatsCoreState;
  task: CoreTaskRecord;
  actorId: string;
  executionRequest: TaskRuntimeExecutionRequest;
}

export async function resolveChannelTaskExecutionRequest(
  chatStore: Pick<ChatStore, 'readCore' | 'writeCore'> | undefined,
  channelId: string,
  target: RoutingTarget,
): Promise<ChannelTaskExecutionContext | undefined> {
  if (!chatStore) {
    return undefined;
  }

  const core = await chatStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
  if (!task) {
    return undefined;
  }

  const actorId = resolveActorIdForTarget(target);
  if (!task.assignedActorIds.includes(actorId)) {
    return undefined;
  }

  if (task.status !== 'approved' && task.status !== 'in_progress') {
    return undefined;
  }

  return {
    core,
    task,
    actorId,
    executionRequest: buildTaskRuntimeExecutionRequest({
      core,
      task,
      fallbackProduct: 'chat',
    }),
  };
}

export async function maybeAutoCheckoutChannelTask(
  chatStore: Pick<ChatStore, 'readCore' | 'writeCore'> | undefined,
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'streamSession'>,
  channelId: string,
  target: RoutingTarget,
  now: Date,
  taskExecutionContext?: ChannelTaskExecutionContext,
): Promise<void> {
  if (
    !chatStore
    || !target.sessionId
    || !taskExecutionContext
    || taskExecutionContext.task.status !== 'approved'
  ) {
    return;
  }

  const checkout = checkoutTaskExecution({
    core: taskExecutionContext.core,
    taskId: taskExecutionContext.task.id,
    actorId: taskExecutionContext.actorId,
    sessionId: target.sessionId,
    executionRequest: taskExecutionContext.executionRequest,
    now,
  });
  const persisted = await chatStore.writeCore(checkout.core);
  const persistedTask = persisted.tasks.find((candidate) => candidate.id === checkout.task.id)
    ?? checkout.task;
  const persistedRun = persisted.runs.find((candidate) => candidate.id === checkout.run.id)
    ?? checkout.run;
  startTaskRunWatcher({
    coreStore: chatStore,
    runtimeClient,
    taskId: persistedTask.id,
    runId: persistedRun.id,
    sessionId: target.sessionId,
    actorId: taskExecutionContext.actorId,
  });
}
