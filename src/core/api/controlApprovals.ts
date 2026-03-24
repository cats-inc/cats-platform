import {
  appendCoreActivity,
  buildApprovalQueue,
  upsertCoreTask,
  writeApprovalDecision,
} from '../model.js';
import { deriveCoreGovernanceSummary } from '../governance.js';
import { applyTaskAssignmentLifecycle } from '../taskLifecycle.js';
import type { OrchestratorDispatchResponse } from '../../platform/orchestration/contracts.js';
import {
  readPendingOrchestratorDispatch,
  writePendingOrchestratorDispatchMetadata,
} from '../../platform/orchestration/pendingDispatch.js';
import {
  handleCoreError,
  readEnumValue,
  readNullableString,
  readObjectBody,
  readRequiredString,
} from './shared.js';
import {
  CORE_APPROVAL_ACTIONS,
  CORE_APPROVAL_STATUSES,
  CORE_TASK_STATUSES,
} from './constants.js';
import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalStatus,
  CoreRecordMetadata,
} from '../types.js';
import type {
  CoreApiRouteContext,
  CoreOrchestratorAutoResumeSummary,
} from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

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

  const persisted = await context.dependencies.coreStore.writeCore(updated.core);
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
  const initialCore = await context.dependencies.coreStore.readCore();
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
    const latestCore = await context.dependencies.coreStore.readCore();
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
    const latestCore = await context.dependencies.coreStore.readCore();
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

async function handleCoreApprovals(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { approvals: buildApprovalQueue(core) });
}

async function handleCoreApprovalWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const approval = await readObjectBody(context);
    const now = context.dependencies.now?.() ?? new Date();
    let nextCore = await context.dependencies.coreStore.readCore();
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
    let persisted = await context.dependencies.coreStore.writeCore(activity.core);
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
        executionLocator: context.dependencies.taskExecutionLocator,
        runtimeClient: context.dependencies.runtimeClient,
        now,
      });
      persisted = await context.dependencies.coreStore.writeCore(lifecycle.core);
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

export async function routeCoreApprovalsApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/core/approvals') {
    return false;
  }

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
