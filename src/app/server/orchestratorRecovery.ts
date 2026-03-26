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
  readWorkflowContinuationReplay,
  writeWorkflowContinuationReplayMetadata,
} from '../../platform/orchestration/workflowContinuationReplay.js';
import {
  appendOrchestratorReplayActivity,
} from '../../platform/orchestration/replayActivity.js';
import {
  canResumeWorkflowContinuationReplay,
} from '../../products/chat/state/runtime-dispatch/replay.js';
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

async function writeSynchronizedCoreState(
  dependencies: ResolvedServerDependencies,
  core: CatsCoreState,
): Promise<void> {
  await dependencies.shared.coreStore.writeCore(core);
  const chatStore = dependencies.chat?.chatStore;
  if (chatStore && dependencies.shared.coreStore !== chatStore) {
    await chatStore.writeCore(core);
  }
}

async function appendReplayActivityAndSync(
  dependencies: ResolvedServerDependencies,
  taskId: string,
  input: {
    source: 'workflow-continuation-replay' | 'orchestrator-startup-recovery';
    phase: 'replay_started' | 'replay_dispatched' | 'replay_blocked' | 'replay_failed' | 'startup_recovered';
    error?: string | null;
    resumeReason?: 'target_recovered' | null;
    blockedReason?: string | null;
    resultCount?: number | null;
    pendingDispatchRecovered?: boolean;
    dispatchReplayRecovered?: boolean;
  },
  now: Date,
): Promise<void> {
  const latestCore = await dependencies.shared.coreStore.readCore();
  const task = latestCore.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return;
  }

  const nextCore = appendOrchestratorReplayActivity(
    latestCore,
    {
      task,
      ...input,
    },
    now,
  ).core;
  await writeSynchronizedCoreState(dependencies, nextCore);
}

function shouldAutoResumeReadyContinuationReplay(
  replay: ReturnType<typeof readWorkflowContinuationReplay>,
): replay is NonNullable<ReturnType<typeof readWorkflowContinuationReplay>> {
  return Boolean(
    replay
    && replay.replayState === 'ready'
    && replay.blockedReason === 'no_valid_targets'
    && replay.workflowRecommendation,
  );
}

async function autoResumeRecoveredContinuationReplaysOnStartup(
  dependencies: ResolvedServerDependencies,
  now: Date,
): Promise<number> {
  if (!dependencies.chat?.chatStore) {
    return 0;
  }

  const core = await dependencies.shared.coreStore.readCore();
  let resumedCount = 0;

  for (const task of core.tasks) {
    const replay = readWorkflowContinuationReplay(task.metadata);
    if (!shouldAutoResumeReadyContinuationReplay(replay)) {
      continue;
    }

    const chatState = await dependencies.chat.chatStore.read();
    if (!canResumeWorkflowContinuationReplay(replay, chatState)) {
      continue;
    }

    await appendReplayActivityAndSync(
      dependencies,
      task.id,
      {
        source: 'workflow-continuation-replay',
        phase: 'replay_started',
        resumeReason: 'target_recovered',
      },
      now,
    );

    try {
      const result = await dependencies.shared.resumeWorkflowContinuationDispatch(
        replay,
        {
          trigger: 'retry',
        },
      );
      if (dependencies.shared.coreStore !== dependencies.chat.chatStore) {
        await dependencies.shared.coreStore.writeCore(
          await dependencies.chat.chatStore.readCore(),
        );
      }
      await appendReplayActivityAndSync(
        dependencies,
        task.id,
        {
          source: 'workflow-continuation-replay',
          phase: result.status === 'dispatched'
            ? 'replay_dispatched'
            : 'replay_blocked',
          resumeReason: 'target_recovered',
          blockedReason: result.blockedReason,
          resultCount: result.results.length,
        },
        now,
      );
    } catch (error) {
      if (dependencies.shared.coreStore !== dependencies.chat.chatStore) {
        await dependencies.shared.coreStore.writeCore(
          await dependencies.chat.chatStore.readCore(),
        );
      }
      await appendReplayActivityAndSync(
        dependencies,
        task.id,
        {
          source: 'workflow-continuation-replay',
          phase: 'replay_failed',
          resumeReason: 'target_recovered',
          error: error instanceof Error ? error.message : 'Unknown startup recovery error.',
        },
        now,
      );
    }

    resumedCount += 1;
  }

  return resumedCount;
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
    const continuationReplay = readWorkflowContinuationReplay(task.metadata, {
      includeInProgress: true,
    });
    const recoverPendingDispatch = pendingDispatch?.replayState === 'in_progress';
    const recoverReplay = replay?.replayState === 'in_progress';
    const recoverContinuationReplay = continuationReplay?.replayState === 'in_progress';
    if (!recoverPendingDispatch && !recoverReplay && !recoverContinuationReplay) {
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
    if (recoverContinuationReplay && continuationReplay) {
      metadata = writeWorkflowContinuationReplayMetadata(
        metadata,
        continuationReplay,
        {
          replayState: 'failed',
          replayTrigger: continuationReplay.replayTrigger,
          replayAttemptAt: continuationReplay.replayAttemptAt ?? nowIso,
          replayError: continuationReplay.replayError ?? INTERRUPTED_REPLAY_ERROR,
        },
      );
    }

    nextCore = overwriteTaskMetadata(nextCore, task, metadata, now);
    nextCore = appendOrchestratorReplayActivity(
      nextCore,
      {
        task,
        source: recoverContinuationReplay
          ? 'workflow-continuation-replay'
          : 'orchestrator-startup-recovery',
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
    return autoResumeRecoveredContinuationReplaysOnStartup(dependencies, now);
  }

  await writeSynchronizedCoreState(dependencies, nextCore);
  return recoveredCount + await autoResumeRecoveredContinuationReplaysOnStartup(dependencies, now);
}
