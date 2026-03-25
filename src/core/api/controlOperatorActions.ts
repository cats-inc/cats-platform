import {
  appendCoreActivity,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
} from '../model/index.js';
import { deriveCoreGovernanceSummary } from '../governance.js';
import { CoreValidationError } from '../errors.js';
import {
  readOrchestratorDispatchReplay,
  writeOrchestratorDispatchReplayMetadata,
} from '../../platform/orchestration/dispatchReplay.js';
import {
  persistOrchestratorReplayActivity,
} from '../../platform/orchestration/replayActivity.js';
import {
  handleCoreError,
  readEnumValue,
  readNullableString,
  readObjectBody,
} from './shared.js';
import { CORE_OPERATOR_ACTIONS } from './constants.js';
import type {
  CatsCoreState,
  CoreOperatorActionKind,
  CoreRecordMetadata,
} from '../types.js';
import type {
  CoreApiRouteContext,
  CoreOrchestratorAutoResumeSummary,
} from './types.js';
import {
  buildOrchestratorReplayFailureSummary,
  persistTaskMetadata,
  summarizeOrchestratorReplayDispatch,
} from './orchestratorReplay.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

function mergeOperatorActionMetadata(
  metadata: CoreRecordMetadata,
  action: CoreOperatorActionKind,
  actorId: string | null,
  nowIso: string,
  notes: string | null,
): CoreRecordMetadata {
  const nextMetadata: CoreRecordMetadata = {
    ...structuredClone(metadata),
    operatorLastAction: action,
    operatorLastActionAt: nowIso,
    operatorLastActionBy: actorId,
    operatorLastActionNotes: notes,
  };
  delete nextMetadata.operatorAcknowledgeNotes;

  if (action === 'acknowledge') {
    nextMetadata.operatorAcknowledgedAt = nowIso;
    nextMetadata.operatorAcknowledgedBy = actorId;
    nextMetadata.operatorAcknowledgedNotes = notes;
  }

  if (action === 'retry') {
    nextMetadata.operatorRetryRequestedAt = nowIso;
    nextMetadata.operatorRetryRequestedBy = actorId;
    nextMetadata.operatorRetryNotes = notes;
  }

  return nextMetadata;
}

function findLatestRunForTask(
  core: CatsCoreState,
  taskId: string | null,
) {
  if (!taskId) {
    return null;
  }

  return core.runs
    .filter((candidate) => candidate.taskId === taskId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    ?? null;
}

async function maybeAutoResumeRetryDispatch(
  context: CoreApiRouteContext,
  taskId: string,
  now: Date,
  actorId: string | null,
): Promise<{
  core: CatsCoreState;
  task: CatsCoreState['tasks'][number] | null;
  autoResume?: CoreOrchestratorAutoResumeSummary;
}> {
  const initialCore = await context.dependencies.coreStore.readCore();
  const task = initialCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const replay = readOrchestratorDispatchReplay(task?.metadata);
  if (!task || !replay || !context.dependencies.resumePendingOrchestratorDispatch) {
    return {
      core: initialCore,
      task,
    };
  }

  const replayAttemptAt = now.toISOString();
  let persistedBeforeReplay: {
    core: CatsCoreState;
    task: CatsCoreState['tasks'][number] | null;
  } = {
    core: initialCore,
    task,
  };

  try {
    persistedBeforeReplay = await persistTaskMetadata(
      context,
      initialCore,
      taskId,
      writeOrchestratorDispatchReplayMetadata(
        task.metadata,
        {
          channelId: replay.channelId,
          body: replay.body,
          senderName: replay.senderName,
          transport: replay.transport,
          recordedAt: replay.recordedAt,
        },
        {
          replayState: 'in_progress',
          replayTrigger: 'retry',
          replayAttemptAt,
          replayError: null,
          sourceMessageId: replay.sourceMessageId,
        },
      ),
      now,
    );
    if (persistedBeforeReplay.task) {
      try {
        const replayActivity = await persistOrchestratorReplayActivity(
          context.dependencies.coreStore,
          persistedBeforeReplay.core,
          {
            task: persistedBeforeReplay.task,
            actorId,
            phase: 'replay_started',
            trigger: 'retry',
          },
          now,
        );
        persistedBeforeReplay = {
          core: replayActivity.core,
          task: replayActivity.core.tasks.find((candidate) => candidate.id === taskId)
            ?? persistedBeforeReplay.task,
        };
      } catch {
        // Replay inspectability is additive; keep the main replay path running.
      }
    }

    const dispatch = await context.dependencies.resumePendingOrchestratorDispatch(
      {
        channelId: replay.channelId,
        body: replay.body,
        senderName: replay.senderName,
        transport: replay.transport,
        blockedAt: replay.recordedAt,
        blockedReason: 'approval_pending',
      },
      { trigger: 'retry' },
    );
    const latestCore = await context.dependencies.coreStore.readCore();
    const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const autoResume = summarizeOrchestratorReplayDispatch('retry', dispatch);

    const replayMetadata = writeOrchestratorDispatchReplayMetadata(
      latestTask?.metadata,
      {
        channelId: replay.channelId,
        body: replay.body,
        senderName: replay.senderName,
        transport: replay.transport,
        recordedAt: latestTask?.updatedAt ?? replay.recordedAt,
      },
      {
        replayState: dispatch.dispatch.status === 'dispatched' ? 'ready' : 'failed',
        replayTrigger: 'retry',
        replayAttemptAt,
        replayError: dispatch.dispatch.status === 'dispatched'
          ? null
          : dispatch.dispatch.blockedReason,
        sourceMessageId: dispatch.dispatch.sourceMessageId,
      },
    );

    try {
      const persisted = await persistTaskMetadata(
        context,
        latestCore,
        taskId,
        replayMetadata,
        now,
      );
      if (persisted.task) {
        try {
          const replayActivity = await persistOrchestratorReplayActivity(
            context.dependencies.coreStore,
            persisted.core,
            {
              task: persisted.task,
              actorId,
              phase: dispatch.dispatch.status === 'dispatched'
                ? 'replay_dispatched'
                : 'replay_blocked',
              trigger: 'retry',
              blockedReason: dispatch.dispatch.blockedReason,
              resultCount: dispatch.dispatch.results.length,
            },
            now,
          );
          return {
            core: replayActivity.core,
            task: replayActivity.core.tasks.find((candidate) => candidate.id === taskId)
              ?? persisted.task,
            autoResume,
          };
        } catch {
          return {
            ...persisted,
            autoResume,
          };
        }
      }
      return {
        ...persisted,
        autoResume,
      };
    } catch {
      return {
        core: latestCore,
        task: latestTask ?? persistedBeforeReplay.task,
        autoResume,
      };
    }
  } catch (error) {
    const autoResume = buildOrchestratorReplayFailureSummary('retry', error);
    const latestCore = await context.dependencies.coreStore.readCore();
    const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId) ?? null;

    try {
      const failed = await persistTaskMetadata(
        context,
        latestCore,
        taskId,
        writeOrchestratorDispatchReplayMetadata(
          latestTask?.metadata,
          {
            channelId: replay.channelId,
            body: replay.body,
            senderName: replay.senderName,
            transport: replay.transport,
            recordedAt: latestTask?.updatedAt ?? replay.recordedAt,
          },
          {
            replayState: 'failed',
            replayTrigger: 'retry',
            replayAttemptAt,
            replayError: autoResume.error ?? null,
            sourceMessageId: replay.sourceMessageId,
          },
        ),
        now,
      );
      if (failed.task) {
        try {
          const replayActivity = await persistOrchestratorReplayActivity(
            context.dependencies.coreStore,
            failed.core,
            {
              task: failed.task,
              actorId,
              phase: 'replay_failed',
              trigger: 'retry',
              error: autoResume.error ?? null,
            },
            now,
          );
          return {
            core: replayActivity.core,
            task: replayActivity.core.tasks.find((candidate) => candidate.id === taskId)
              ?? failed.task,
            autoResume,
          };
        } catch {
          return {
            ...failed,
            autoResume,
          };
        }
      }
      return {
        ...failed,
        autoResume,
      };
    } catch {
      return {
        core: latestCore,
        task: latestTask ?? persistedBeforeReplay.task,
        autoResume,
      };
    }
  }
}

async function handleCoreOperatorActionWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const action = readEnumValue(body.action, 'action', CORE_OPERATOR_ACTIONS);
    if (!action) {
      throw new CoreValidationError('action is required');
    }

    const actorId = readNullableString(body.actorId, 'actorId') ?? null;
    const notes = readNullableString(body.notes, 'notes') ?? null;
    const runId = readNullableString(body.runId, 'runId') ?? null;
    const checkpointId = readNullableString(body.checkpointId, 'checkpointId') ?? null;
    const outcomeId = readNullableString(body.outcomeId, 'outcomeId') ?? null;
    const taskId = readNullableString(body.taskId, 'taskId') ?? null;
    const now = context.dependencies.now?.() ?? new Date();
    const nowIso = now.toISOString();
    let core = await context.dependencies.coreStore.readCore();

    let conversationId: string | null = null;
    let resolvedTaskId: string | null = taskId;
    let resolvedRunId: string | null = runId;
    let messageSubject = 'the current incident';

    if (runId) {
      const run = core.runs.find((candidate) => candidate.id === runId);
      if (!run) {
        throw new CoreValidationError(`runId not found: ${runId}`, 'run_not_found');
      }
      const updatedRun = upsertCoreRun(
        core,
        {
          ...run,
          metadata: mergeOperatorActionMetadata(run.metadata, action, actorId, nowIso, notes),
        },
        now,
      );
      core = updatedRun.core;
      conversationId = run.conversationId;
      resolvedTaskId = resolvedTaskId ?? run.taskId;
      messageSubject = run.title;
    }

    if (checkpointId) {
      const checkpoint = core.checkpoints.find((candidate) => candidate.id === checkpointId);
      if (!checkpoint) {
        throw new CoreValidationError(
          `checkpointId not found: ${checkpointId}`,
          'checkpoint_not_found',
        );
      }
      const updatedCheckpoint = upsertCoreCheckpoint(
        core,
        {
          ...checkpoint,
          metadata: mergeOperatorActionMetadata(
            checkpoint.metadata,
            action,
            actorId,
            nowIso,
            notes,
          ),
        },
        now,
      );
      core = updatedCheckpoint.core;
      conversationId = conversationId ?? checkpoint.conversationId;
      resolvedTaskId = resolvedTaskId ?? checkpoint.taskId;
      resolvedRunId = resolvedRunId ?? checkpoint.runId;
      messageSubject = checkpoint.label;
    }

    if (outcomeId) {
      const outcome = core.outcomes.find((candidate) => candidate.id === outcomeId);
      if (!outcome) {
        throw new CoreValidationError(
          `outcomeId not found: ${outcomeId}`,
          'outcome_not_found',
        );
      }
      const updatedOutcome = upsertCoreOutcome(
        core,
        {
          ...outcome,
          metadata: mergeOperatorActionMetadata(
            outcome.metadata,
            action,
            actorId,
            nowIso,
            notes,
          ),
        },
        now,
      );
      core = updatedOutcome.core;
      conversationId = conversationId ?? outcome.conversationId;
      resolvedTaskId = resolvedTaskId ?? outcome.taskId;
      resolvedRunId = resolvedRunId ?? outcome.runId;
      messageSubject = outcome.title;
    }

    if (resolvedTaskId) {
      const task = core.tasks.find((candidate) => candidate.id === resolvedTaskId);
      if (!task) {
        throw new CoreValidationError(`taskId not found: ${resolvedTaskId}`, 'task_not_found');
      }
      const updatedTask = upsertCoreTask(
        core,
        {
          ...task,
          metadata: mergeOperatorActionMetadata(task.metadata, action, actorId, nowIso, notes),
        },
        now,
      );
      core = updatedTask.core;
      conversationId = conversationId ?? task.conversationId;
      messageSubject = task.title;
    }

    if (!runId && !checkpointId && !outcomeId && !taskId) {
      throw new CoreValidationError(
        'operator action requires at least one subject id',
        'operator_action_subject_required',
      );
    }

    const activity = appendCoreActivity(
      core,
      {
        kind: 'operator_action',
        actorId,
        conversationId,
        taskId: resolvedTaskId,
        runId: resolvedRunId,
        message: action === 'retry'
          ? `Operator requested a retry for "${messageSubject}".`
          : `Operator acknowledged "${messageSubject}".`,
        metadata: {
          source: 'core-operator-actions',
          action,
          checkpointId,
          outcomeId,
          notes,
        },
      },
      now,
    );
    let persisted = await context.dependencies.coreStore.writeCore(activity.core);
    let persistedTask = resolvedTaskId
      ? persisted.tasks.find((candidate) => candidate.id === resolvedTaskId) ?? null
      : null;
    let autoResume: CoreOrchestratorAutoResumeSummary | undefined;

    if (action === 'retry' && resolvedTaskId) {
      const resumed = await maybeAutoResumeRetryDispatch(
        context,
        resolvedTaskId,
        now,
        actorId,
      );
      persisted = resumed.core;
      persistedTask = resumed.task ?? persistedTask;
      autoResume = resumed.autoResume;
    }

    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === activity.activity.id,
    ) ?? activity.activity;
    const persistedRun = resolvedRunId
      ? persisted.runs.find((candidate) => candidate.id === resolvedRunId) ?? null
      : null;
    const persistedCheckpoint = checkpointId
      ? persisted.checkpoints.find((candidate) => candidate.id === checkpointId) ?? null
      : null;
    const persistedOutcome = outcomeId
      ? persisted.outcomes.find((candidate) => candidate.id === outcomeId) ?? null
      : null;
    const latestRun = findLatestRunForTask(persisted, persistedTask?.id ?? resolvedTaskId);

    sendJson(context.response, 200, {
      action,
      task: persistedTask,
      run: persistedRun,
      checkpoint: persistedCheckpoint,
      outcome: persistedOutcome,
      activity: persistedActivity,
      governanceSummary: deriveCoreGovernanceSummary(
        persistedTask,
        latestRun ?? persistedRun,
      ),
      ...(autoResume ? { autoResume } : {}),
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreOperatorActionsApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/core/operator-actions') {
    return false;
  }

  if (context.method === 'POST') {
    await handleCoreOperatorActionWrite(context);
    return true;
  }
  sendMethodNotAllowed(context.response, ['POST']);
  return true;
}
