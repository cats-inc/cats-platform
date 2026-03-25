import {
  upsertCoreTask,
} from '../../core/model/index.js';
import type {
  CatsCoreState,
  CoreTaskRecord,
} from '../../core/types.js';
import {
  readOrchestratorDispatchReplay,
  writeOrchestratorDispatchReplayMetadata,
} from '../../platform/orchestration/dispatchReplay.js';
import {
  readPendingOrchestratorDispatchSnapshot,
  writePendingOrchestratorDispatchMetadata,
} from '../../platform/orchestration/pendingDispatch.js';
import {
  appendOrchestratorReplayActivity,
} from '../../platform/orchestration/replayActivity.js';
import type { ResolvedServerDependencies } from './contracts.js';

const INTERRUPTED_REPLAY_ERROR = 'Cats server restarted before orchestrator replay cleanup completed.';

function overwriteTaskMetadata(
  core: CatsCoreState,
  task: CoreTaskRecord,
  metadata: CoreTaskRecord['metadata'],
  now: Date,
): CatsCoreState {
  return upsertCoreTask(
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
  ).core;
}

export async function reconcileOrchestratorRecoveryOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<number> {
  const now = dependencies.shared.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const core = await dependencies.shared.coreStore.readCore();
  let nextCore = core;
  let recoveredCount = 0;

  for (const task of core.tasks) {
    const pendingDispatch = readPendingOrchestratorDispatchSnapshot(task.metadata, {
      includeInProgress: true,
    });
    const replay = readOrchestratorDispatchReplay(task.metadata, {
      includeInProgress: true,
    });
    const recoverPendingDispatch = pendingDispatch?.replayState === 'in_progress';
    const recoverReplay = replay?.replayState === 'in_progress';
    if (!recoverPendingDispatch && !recoverReplay) {
      continue;
    }

    let metadata = structuredClone(task.metadata ?? {});
    if (recoverPendingDispatch && pendingDispatch) {
      metadata = writePendingOrchestratorDispatchMetadata(
        metadata,
        pendingDispatch,
        {
          replayState: 'failed',
          replayTrigger: pendingDispatch.replayTrigger ?? undefined,
          replayAttemptAt: pendingDispatch.replayAttemptAt ?? nowIso,
          replayError: pendingDispatch.replayError ?? INTERRUPTED_REPLAY_ERROR,
        },
      );
    }
    if (recoverReplay && replay) {
      metadata = writeOrchestratorDispatchReplayMetadata(
        metadata,
        replay,
        {
          replayState: 'failed',
          replayTrigger: replay.replayTrigger,
          replayAttemptAt: replay.replayAttemptAt ?? nowIso,
          replayError: replay.replayError ?? INTERRUPTED_REPLAY_ERROR,
          sourceMessageId: replay.sourceMessageId,
        },
      );
    }

    nextCore = overwriteTaskMetadata(nextCore, task, metadata, now);
    nextCore = appendOrchestratorReplayActivity(
      nextCore,
      {
        task,
        source: 'orchestrator-startup-recovery',
        phase: 'startup_recovered',
        error: INTERRUPTED_REPLAY_ERROR,
        pendingDispatchRecovered: recoverPendingDispatch,
        dispatchReplayRecovered: recoverReplay,
      },
      now,
    ).core;
    recoveredCount += 1;
  }

  if (recoveredCount === 0) {
    return 0;
  }

  await dependencies.shared.coreStore.writeCore(nextCore);
  return recoveredCount;
}
