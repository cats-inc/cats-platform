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
  handleCoreError,
  readEnumValue,
  readNullableString,
  readObjectBody,
} from './shared.js';
import { CORE_OPERATOR_ACTIONS } from './constants.js';
import type {
  CoreOperatorActionKind,
  CoreRecordMetadata,
} from '../types.js';
import type { CoreApiRouteContext } from './types.js';
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
    const now = new Date();
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

    if (taskId) {
      const task = core.tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        throw new CoreValidationError(`taskId not found: ${taskId}`, 'task_not_found');
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
    const persisted = await context.dependencies.coreStore.writeCore(activity.core);
    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === activity.activity.id,
    ) ?? activity.activity;
    const persistedTask = resolvedTaskId
      ? persisted.tasks.find((candidate) => candidate.id === resolvedTaskId) ?? null
      : null;
    const persistedRun = resolvedRunId
      ? persisted.runs.find((candidate) => candidate.id === resolvedRunId) ?? null
      : null;
    const persistedCheckpoint = checkpointId
      ? persisted.checkpoints.find((candidate) => candidate.id === checkpointId) ?? null
      : null;
    const persistedOutcome = outcomeId
      ? persisted.outcomes.find((candidate) => candidate.id === outcomeId) ?? null
      : null;

    sendJson(context.response, 200, {
      action,
      task: persistedTask,
      run: persistedRun,
      checkpoint: persistedCheckpoint,
      outcome: persistedOutcome,
      activity: persistedActivity,
      governanceSummary: deriveCoreGovernanceSummary(
        persistedTask,
        persistedRun,
      ),
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
