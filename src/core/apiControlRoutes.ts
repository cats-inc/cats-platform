import {
  appendCoreActivity,
  buildApprovalQueue,
  patchOwnerProfile,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from './model.js';
import { deriveCoreGovernanceSummary } from './governance.js';
import { applyTaskAssignmentLifecycle } from './taskLifecycle.js';
import type { OrchestratorDispatchResponse } from '../platform/orchestration/contracts.js';
import {
  readPendingOrchestratorDispatch,
  writePendingOrchestratorDispatchMetadata,
} from '../platform/orchestration/pendingDispatch.js';
import { CoreValidationError } from './errors.js';
import {
  handleCoreError,
  readEnumValue,
  readNullableString,
  readObjectBody,
  readOptionalString,
  readRequiredString,
  readStringArray,
} from './apiShared.js';
import {
  CORE_APPROVAL_ACTIONS,
  CORE_APPROVAL_STATUSES,
  CORE_OPERATOR_ACTIONS,
  CORE_TASK_STATUSES,
} from './apiConstants.js';
import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalStatus,
  CoreOperatorActionKind,
  CoreRecordMetadata,
} from './types.js';
import type {
  CoreApiRouteContext,
  CoreOrchestratorAutoResumeSummary,
} from './apiTypes.js';
import { sendJson, sendMethodNotAllowed } from '../shared/http.js';

function reportCoreMemorySyncFailure(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-memory-sync] owner-profile: ${message}\n`);
}

async function handleCoreApprovals(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { approvals: buildApprovalQueue(core) });
}

function buildApprovalActivityMessage(
  action: CoreApprovalDecisionAction | null,
  status: CoreApprovalStatus,
  taskTitle: string,
): string {
  if (status === 'pending') {
    return `Owner approval requested for "${taskTitle}".`;
  }

  switch (action) {
    case 'approve':
      return `Owner approved "${taskTitle}".`;
    case 'reroute':
      return `Owner requested a reroute for "${taskTitle}".`;
    case 'reject':
    default:
      return `Owner rejected "${taskTitle}".`;
  }
}

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

function summarizeAutoResumeDispatch(
  trigger: 'approve' | 'reroute',
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

function buildAutoResumeFailureSummary(
  trigger: 'approve' | 'reroute',
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

async function persistTaskMetadata(
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

  const persisted = await context.dependencies.chatStore.writeCore(updated.core);
  return {
    core: persisted,
    task: persisted.tasks.find((candidate) => candidate.id === taskId) ?? updated.task,
  };
}

async function maybeAutoResumePendingDispatch(
  context: CoreApiRouteContext,
  taskId: string,
  trigger: 'approve' | 'reroute',
  now: Date,
): Promise<{
  core: CatsCoreState;
  task: CatsCoreState['tasks'][number] | null;
  autoResume?: CoreOrchestratorAutoResumeSummary;
}> {
  const initialCore = await context.dependencies.chatStore.readCore();
  const task = initialCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const pendingDispatch = readPendingOrchestratorDispatch(task?.metadata);
  if (!task || !pendingDispatch || !context.dependencies.resumePendingOrchestratorDispatch) {
    return {
      core: initialCore,
      task,
    };
  }

  const replayAttemptAt = now.toISOString();
  let persistedBeforeDispatch: {
    core: CatsCoreState;
    task: CatsCoreState['tasks'][number] | null;
  } = {
    core: initialCore,
    task,
  };
  try {
    persistedBeforeDispatch = await persistTaskMetadata(
      context,
      initialCore,
      taskId,
      writePendingOrchestratorDispatchMetadata(
        task.metadata,
        pendingDispatch,
        {
          replayState: 'in_progress',
          replayTrigger: trigger,
          replayAttemptAt,
          replayError: null,
        },
      ),
      now,
    );
    const dispatch = await context.dependencies.resumePendingOrchestratorDispatch(
      pendingDispatch,
      { trigger },
    );
    const latestCore = await context.dependencies.chatStore.readCore();
    const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const autoResume = summarizeAutoResumeDispatch(trigger, dispatch);

    if (dispatch.dispatch.status !== 'dispatched') {
      try {
        const failed = await persistTaskMetadata(
          context,
          latestCore,
          taskId,
          writePendingOrchestratorDispatchMetadata(
            latestTask?.metadata,
            pendingDispatch,
            {
              replayState: 'failed',
              replayTrigger: trigger,
              replayAttemptAt,
              replayError: dispatch.dispatch.blockedReason,
            },
          ),
          now,
        );
        return {
          ...failed,
          autoResume,
        };
      } catch {
        return {
          core: latestCore,
          task: latestTask ?? persistedBeforeDispatch.task,
          autoResume,
        };
      }
    }

    try {
      const cleared = await persistTaskMetadata(
        context,
        latestCore,
        taskId,
        writePendingOrchestratorDispatchMetadata(
          latestTask?.metadata,
          null,
        ),
        now,
      );
      return {
        ...cleared,
        autoResume,
      };
    } catch {
      return {
        core: latestCore,
        task: latestTask ?? persistedBeforeDispatch.task,
        autoResume,
      };
    }
  } catch (error) {
    const autoResume = buildAutoResumeFailureSummary(trigger, error);
    const latestCore = await context.dependencies.chatStore.readCore();
    const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId) ?? null;

    try {
      const failed = await persistTaskMetadata(
        context,
        latestCore,
        taskId,
        writePendingOrchestratorDispatchMetadata(
          latestTask?.metadata,
          pendingDispatch,
          {
            replayState: 'failed',
            replayTrigger: trigger,
            replayAttemptAt,
            replayError: autoResume.error ?? null,
          },
        ),
        now,
      );
      return {
        ...failed,
        autoResume,
      };
    } catch {
      return {
        core: latestCore,
        task: latestTask ?? persistedBeforeDispatch.task,
        autoResume,
      };
    }
  }
}

async function handleCoreApprovalWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const approval = await readObjectBody(context);
    const now = context.dependencies.now?.() ?? new Date();
    let nextCore = await context.dependencies.chatStore.readCore();
    const taskId = readRequiredString(approval.taskId, 'taskId');
    const previousTask = nextCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const next = writeApprovalDecision(
      nextCore,
      {
        taskId,
        status:
          readEnumValue(approval.status, 'status', CORE_APPROVAL_STATUSES)
          ?? 'pending',
        action: readEnumValue(approval.action, 'action', CORE_APPROVAL_ACTIONS),
        requestedByActorId: readNullableString(
          approval.requestedByActorId,
          'requestedByActorId',
        ),
        decidedByActorId: readNullableString(
          approval.decidedByActorId,
          'decidedByActorId',
        ),
        notes: readNullableString(approval.notes, 'notes'),
        taskStatus: readEnumValue(approval.taskStatus, 'taskStatus', CORE_TASK_STATUSES),
      },
      now,
    );
    nextCore = next.core;
    const activity = appendCoreActivity(
      nextCore,
      {
        kind: next.task.approval.status === 'pending'
          ? 'approval_requested'
          : 'approval_decided',
        actorId: next.task.approval.status === 'pending'
          ? next.task.orchestratorActorId
          : next.task.approval.decidedByActorId,
        conversationId: next.task.conversationId,
        taskId: next.task.id,
        runId: null,
        message: buildApprovalActivityMessage(
          next.task.approval.decisionAction,
          next.task.approval.status,
          next.task.title,
        ),
        metadata: {
          source: 'core-approvals',
          action: next.task.approval.decisionAction,
          taskStatus: next.task.status,
        },
      },
      now,
    );
    let persisted = await context.dependencies.chatStore.writeCore(activity.core);
    let persistedTask = persisted.tasks.find((candidate) => candidate.id === next.task.id);
    let autoResume: CoreOrchestratorAutoResumeSummary | undefined;
    if (
      next.task.approval.decisionAction === 'approve'
      || next.task.approval.decisionAction === 'reroute'
    ) {
      const resumed = await maybeAutoResumePendingDispatch(
        context,
        next.task.id,
        next.task.approval.decisionAction,
        now,
      );
      persisted = resumed.core;
      persistedTask = resumed.task ?? persistedTask;
      autoResume = resumed.autoResume;
    }
    let wakeups = [] as Array<{ request: { id: string }; coalesced: boolean }>;
    let lifecycleActivities = [] as Array<{ id: string }>;
    if (context.dependencies.runtimeClient && persistedTask) {
      const lifecycle = await applyTaskAssignmentLifecycle({
        core: persisted,
        previousTask,
        task: persistedTask,
        chat: await context.dependencies.chatStore.read(),
        runtimeClient: context.dependencies.runtimeClient,
        now,
      });
      persisted = await context.dependencies.chatStore.writeCore(lifecycle.core);
      persistedTask = persisted.tasks.find((candidate) => candidate.id === lifecycle.task.id)
        ?? lifecycle.task;
      wakeups = lifecycle.wakeups;
      lifecycleActivities = lifecycle.activities;
    }
    const queueItem = buildApprovalQueue(persisted).find(
      (candidate) => candidate.taskId === next.task.id,
    ) ?? null;
    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === activity.activity.id,
    ) ?? activity.activity;
    const persistedLifecycleActivities = lifecycleActivities.map((candidate) =>
      persisted.activities.find((activityRecord) => activityRecord.id === candidate.id)
      ?? candidate);
    const latestRun = findLatestRunForTask(
      persisted,
      (persistedTask ?? next.task).id,
    );

    sendJson(context.response, 200, {
      task: persistedTask ?? next.task,
      approval: (persistedTask ?? next.task).approval,
      queueItem,
      activity: persistedActivity,
      governanceSummary: deriveCoreGovernanceSummary(
        persistedTask ?? next.task,
        latestRun,
      ),
      ...(wakeups.length > 0 ? { wakeups } : {}),
      ...(persistedLifecycleActivities.length > 0 ? { activities: persistedLifecycleActivities } : {}),
      ...(autoResume ? { autoResume } : {}),
    });
  } catch (error) {
    handleCoreError(context, error);
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
    const now = new Date();
    const nowIso = now.toISOString();
    let core = await context.dependencies.chatStore.readCore();

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
    const persisted = await context.dependencies.chatStore.writeCore(activity.core);
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

async function handleOwnerProfile(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { ownerProfile: core.ownerProfile });
}

async function handleOwnerProfileWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const next = patchOwnerProfile(
      await context.dependencies.chatStore.readCore(),
      {
        displayName: readOptionalString(body.displayName, 'displayName'),
        avatarColor: readNullableString(body.avatarColor, 'avatarColor'),
        summary: readNullableString(body.summary, 'summary'),
        communicationPreferences: readStringArray(
          body.communicationPreferences,
          'communicationPreferences',
        ),
        decisionPreferences: readStringArray(
          body.decisionPreferences,
          'decisionPreferences',
        ),
        escalationPreferences: readStringArray(
          body.escalationPreferences,
          'escalationPreferences',
        ),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    if (context.dependencies.memoryService) {
      try {
        await context.dependencies.memoryService.flushOwnerProfile({
          reason: 'owner_profile_sync',
        });
      } catch (error) {
        reportCoreMemorySyncFailure(error);
      }
    }
    sendJson(context.response, 200, {
      ownerProfile: persisted.ownerProfile,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreControlApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/approvals') {
    if (context.method === 'GET') {
      await handleCoreApprovals(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreApprovalWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/operator-actions') {
    if (context.method === 'POST') {
      await handleCoreOperatorActionWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/owner-profile') {
    if (context.method === 'GET') {
      await handleOwnerProfile(context);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleOwnerProfileWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  return false;
}
