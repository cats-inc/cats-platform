import {
  appendCoreActivity,
  writeApprovalDecision,
} from '../model/index.js';
import { buildApprovalQueue } from '../approvalQueue.js';
import { deriveCoreGovernanceSummary } from '../governance.js';
import { applyTaskAssignmentLifecycle } from '../taskLifecycle.js';
import {
  readPendingOrchestratorDispatch,
  writePendingOrchestratorDispatchMetadata,
} from '../../platform/orchestration/pendingDispatch.js';
import { writeOrchestratorDispatchReplayMetadata } from '../../platform/orchestration/dispatchReplay.js';
import {
  persistOrchestratorReplayActivity,
} from '../../platform/orchestration/replayActivity.js';
import { buildTaskRuntimeExecutionRequest } from '../../shared/taskExecutionBridge.js';
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

async function maybeAutoResumePendingDispatch(
  context: CoreApiRouteContext,
  taskId: string,
  trigger: 'approve' | 'reroute',
  now: Date,
  actorId: string | null,
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
      writeOrchestratorDispatchReplayMetadata(
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
        {
          channelId: pendingDispatch.channelId,
          body: pendingDispatch.body,
          senderName: pendingDispatch.senderName,
          transport: pendingDispatch.transport,
          recordedAt: task.updatedAt,
        },
        {
          replayState: 'in_progress',
          replayTrigger: trigger,
          replayAttemptAt,
          replayError: null,
        },
      ),
      now,
    );
    if (persistedBeforeDispatch.task) {
      try {
        const replayActivity = await persistOrchestratorReplayActivity(
          context.dependencies.coreStore,
          persistedBeforeDispatch.core,
          {
            task: persistedBeforeDispatch.task,
            actorId,
            phase: 'replay_started',
            trigger,
          },
          now,
        );
        persistedBeforeDispatch = {
          core: replayActivity.core,
          task: replayActivity.core.tasks.find((candidate) => candidate.id === taskId)
            ?? persistedBeforeDispatch.task,
        };
      } catch {
        // Replay inspectability is additive; keep the main replay path running.
      }
    }
    const dispatch = await context.dependencies.resumePendingOrchestratorDispatch(
      pendingDispatch,
      { trigger },
    );
    const latestCore = await context.dependencies.coreStore.readCore();
    const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const autoResume = summarizeOrchestratorReplayDispatch(trigger, dispatch);

    if (dispatch.dispatch.status !== 'dispatched') {
      try {
        const failed = await persistTaskMetadata(
          context,
          latestCore,
          taskId,
          writeOrchestratorDispatchReplayMetadata(
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
            {
              channelId: pendingDispatch.channelId,
              body: pendingDispatch.body,
              senderName: pendingDispatch.senderName,
              transport: pendingDispatch.transport,
              recordedAt: latestTask?.updatedAt ?? task.updatedAt,
            },
            {
              replayState: 'failed',
              replayTrigger: trigger,
              replayAttemptAt,
              replayError: dispatch.dispatch.blockedReason,
              sourceMessageId: dispatch.dispatch.sourceMessageId,
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
                phase: 'replay_blocked',
                trigger,
                blockedReason: dispatch.dispatch.blockedReason,
                resultCount: dispatch.dispatch.results.length,
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
        writeOrchestratorDispatchReplayMetadata(
          writePendingOrchestratorDispatchMetadata(
            latestTask?.metadata,
            null,
          ),
          {
            channelId: pendingDispatch.channelId,
            body: pendingDispatch.body,
            senderName: pendingDispatch.senderName,
            transport: pendingDispatch.transport,
            recordedAt: latestTask?.updatedAt ?? task.updatedAt,
          },
          {
            replayState: 'ready',
            replayTrigger: trigger,
            replayAttemptAt,
            replayError: null,
            sourceMessageId: dispatch.dispatch.sourceMessageId,
          },
        ),
        now,
      );
      if (cleared.task) {
        try {
          const replayActivity = await persistOrchestratorReplayActivity(
            context.dependencies.coreStore,
            cleared.core,
            {
              task: cleared.task,
              actorId,
              phase: 'replay_dispatched',
              trigger,
              resultCount: dispatch.dispatch.results.length,
            },
            now,
          );
          return {
            core: replayActivity.core,
            task: replayActivity.core.tasks.find((candidate) => candidate.id === taskId)
              ?? cleared.task,
            autoResume,
          };
        } catch {
          return {
            ...cleared,
            autoResume,
          };
        }
      }
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
    const autoResume = buildOrchestratorReplayFailureSummary(trigger, error);
    const latestCore = await context.dependencies.coreStore.readCore();
    const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId) ?? null;

    try {
      const failed = await persistTaskMetadata(
        context,
        latestCore,
        taskId,
        writeOrchestratorDispatchReplayMetadata(
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
          {
            channelId: pendingDispatch.channelId,
            body: pendingDispatch.body,
            senderName: pendingDispatch.senderName,
            transport: pendingDispatch.transport,
            recordedAt: latestTask?.updatedAt ?? task.updatedAt,
          },
          {
            replayState: 'failed',
            replayTrigger: trigger,
            replayAttemptAt,
            replayError: autoResume.error ?? null,
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
              trigger,
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
        next.task.approval.decidedByActorId,
      );
      persisted = resumed.core;
      persistedTask = resumed.task ?? persistedTask;
      autoResume = resumed.autoResume;
    }
    let wakeups = [] as Array<{ request: { id: string }; coalesced: boolean }>;
    let lifecycleActivities = [] as Array<{ id: string }>;
    if (context.dependencies.runtimeClient && persistedTask) {
      const executionRequest = buildTaskRuntimeExecutionRequest({
        core: persisted,
        task: persistedTask,
      });
      const lifecycle = await applyTaskAssignmentLifecycle({
        core: persisted,
        previousTask,
        task: persistedTask,
        executionRequest,
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
