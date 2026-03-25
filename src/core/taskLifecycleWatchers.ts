import {
  appendCoreActivity,
  upsertCoreRun,
  upsertCoreTask,
} from './model/index.js';
import type {
  CoreActivityRecord,
  CoreRunRecord,
  CoreTaskRecord,
} from './types.js';
import type { CoreStore } from './store.js';
import type {
  RuntimeClient,
  RuntimeObservedSessionPayload,
} from '../platform/runtime/client.js';
import {
  buildTerminalTaskMessage,
  cloneMetadata,
  cloneRunInput,
  cloneTaskInput,
  isTerminalCoreRunStatus,
  mapCoreRunStatusToTaskStatus,
  mapRuntimeRunStatusToCoreStatus,
  mergeObservedExecutionMetadata,
  mergeTaskLifecycleMetadata,
  readNullableString,
  readObservedExecutionMetadata,
  readObservedInspection,
  readString,
  resolveActorName,
  asRecord,
} from './taskLifecycleShared.js';

const activeTaskRunWatchers = new Map<string, Promise<void>>();

export interface StartTaskRunWatcherInput {
  coreStore: CoreStore;
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'streamSession'>;
  taskId: string;
  runId: string;
  sessionId: string;
  actorId: string;
  now?: () => Date;
}

async function reconcileObservedTaskRun(
  input: StartTaskRunWatcherInput,
): Promise<void> {
  const now = input.now?.() ?? new Date();
  const observed = await input.runtimeClient.observeSession(input.sessionId);
  const inspection = readObservedInspection(observed);
  const observedRun = inspection.currentRun ?? inspection.lastRun;
  if (!observedRun) {
    return;
  }

  const runtimeRunStatus = readString(observedRun.status);
  const nextRunStatus = mapRuntimeRunStatusToCoreStatus(runtimeRunStatus, inspection.state);
  const startedAt = readString(observedRun.startedAt) ?? now.toISOString();
  const endedAt = readNullableString(observedRun.endedAt);
  const resultSummary = readNullableString(observedRun.resultSummary);
  const error = readNullableString(observedRun.error);
  const usage = asRecord(observedRun.usage);
  const observedExecution = readObservedExecutionMetadata(observed);

  const coreBefore = await input.coreStore.readCore();
  const taskBefore = coreBefore.tasks.find((candidate) => candidate.id === input.taskId);
  const runBefore = coreBefore.runs.find((candidate) => candidate.id === input.runId);
  if (!taskBefore || !runBefore) {
    return;
  }
  const observedAt = now.toISOString();
  const executionMetadata = mergeObservedExecutionMetadata(
    runBefore.metadata?.execution,
    observedExecution,
    observedAt,
  );

  const runWrite = upsertCoreRun(
    coreBefore,
    {
      ...cloneRunInput(runBefore),
      status: nextRunStatus,
      startedAt,
      completedAt: isTerminalCoreRunStatus(nextRunStatus) ? endedAt ?? observedAt : runBefore.completedAt,
      summary: resultSummary ?? error ?? runBefore.summary,
      metadata: {
        ...cloneMetadata(runBefore.metadata),
        source: 'task-lifecycle',
        sessionId: input.sessionId,
        actorId: input.actorId,
        runtimeState: inspection.state,
        runtimeRunStatus,
        ...(executionMetadata ? { execution: executionMetadata } : {}),
        ...(usage ? { usage } : {}),
        ...(error ? { error } : {}),
      },
    },
    now,
  );

  const nextTaskStatus = mapCoreRunStatusToTaskStatus(nextRunStatus);
  const taskWrite = upsertCoreTask(
    runWrite.core,
    {
      ...cloneTaskInput(taskBefore),
      status: nextTaskStatus,
      metadata: mergeTaskLifecycleMetadata(taskBefore.metadata, {
        actorId: input.actorId,
        sessionId: input.sessionId,
        runId: input.runId,
        observedAt,
        runtimeState: inspection.state,
        runtimeRunStatus,
        completedAt: isTerminalCoreRunStatus(nextRunStatus) ? endedAt ?? observedAt : null,
        ...(executionMetadata ? { execution: executionMetadata } : {}),
      }),
    },
    now,
  );

  let nextCore = taskWrite.core;
  if (taskBefore.status !== nextTaskStatus || runBefore.status !== nextRunStatus) {
    const actorName = resolveActorName(nextCore, input.actorId);
    nextCore = appendCoreActivity(
      nextCore,
      {
        kind: 'status_change',
        actorId: input.actorId,
        conversationId: taskWrite.task.conversationId,
        taskId: taskWrite.task.id,
        runId: input.runId,
        message: buildTerminalTaskMessage(taskWrite.task, actorName, nextRunStatus),
        metadata: {
          source: 'task-lifecycle',
          sessionId: input.sessionId,
          runtimeState: inspection.state,
          runtimeRunStatus,
        },
      },
      now,
    ).core;
  }

  await input.coreStore.writeCore(nextCore);
}

export function startTaskRunWatcher(input: StartTaskRunWatcherInput): boolean {
  const watcherKey = `${input.taskId}:${input.runId}:${input.sessionId}`;
  if (activeTaskRunWatchers.has(watcherKey)) {
    return false;
  }

  const watcher = (async () => {
    try {
      const initialObserve = await input.runtimeClient.observeSession(input.sessionId);
      if (initialObserve.stream?.available) {
        try {
          await input.runtimeClient.streamSession(input.sessionId, async () => {});
        } catch {
          // Reconciliation falls back to observe even if the live stream disappears.
        }
      }
      await reconcileObservedTaskRun(input);
    } finally {
      activeTaskRunWatchers.delete(watcherKey);
    }
  })();

  activeTaskRunWatchers.set(watcherKey, watcher);
  return true;
}
