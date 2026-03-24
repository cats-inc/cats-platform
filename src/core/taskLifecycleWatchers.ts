import {
  appendCoreActivity,
  upsertCoreRun,
  upsertCoreTask,
} from './model.js';
import type {
  CoreActivityRecord,
  CoreRunRecord,
  CoreTaskRecord,
} from './types.js';
import type { ChatStore } from '../products/chat/state/store.js';
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
  mergeTaskLifecycleMetadata,
  readNullableString,
  readObservedInspection,
  readString,
  resolveActorName,
  asRecord,
} from './taskLifecycleShared.js';

const activeTaskRunWatchers = new Map<string, Promise<void>>();

export interface StartTaskRunWatcherInput {
  chatStore: Pick<ChatStore, 'readCore' | 'writeCore'>;
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

  const coreBefore = await input.chatStore.readCore();
  const taskBefore = coreBefore.tasks.find((candidate) => candidate.id === input.taskId);
  const runBefore = coreBefore.runs.find((candidate) => candidate.id === input.runId);
  if (!taskBefore || !runBefore) {
    return;
  }

  const runWrite = upsertCoreRun(
    coreBefore,
    {
      ...cloneRunInput(runBefore),
      status: nextRunStatus,
      startedAt,
      completedAt: isTerminalCoreRunStatus(nextRunStatus) ? endedAt ?? now.toISOString() : runBefore.completedAt,
      summary: resultSummary ?? error ?? runBefore.summary,
      metadata: {
        ...cloneMetadata(runBefore.metadata),
        source: 'task-lifecycle',
        sessionId: input.sessionId,
        actorId: input.actorId,
        runtimeState: inspection.state,
        runtimeRunStatus,
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
        observedAt: now.toISOString(),
        runtimeState: inspection.state,
        runtimeRunStatus,
        completedAt: isTerminalCoreRunStatus(nextRunStatus) ? endedAt ?? now.toISOString() : null,
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

  await input.chatStore.writeCore(nextCore);
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
