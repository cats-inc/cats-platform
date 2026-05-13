import { upsertCoreTask } from '../../../core/model/index.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorChatStore,
  OrchestratorDispatchRequest,
  OrchestratorDispatchResponse,
  OrchestratorPlannerSurface,
  OrchestratorStateView,
} from '../../../platform/orchestration/contracts.js';
import {
  ORCHESTRATOR_CONTRACT_VERSION,
} from '../../../platform/orchestration/contracts.js';
import {
  buildPendingOrchestratorDispatchRequest,
  writePendingOrchestratorDispatchMetadata,
} from '../../../platform/orchestration/pendingDispatch.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
  type OrchestratorDispatchReplayTrigger,
} from '../../../platform/orchestration/dispatchReplay.js';
import {
  persistOrchestratorReplayActivity,
} from '../../../platform/orchestration/replayActivity.js';
import {
  buildOrchestratorExecutionLoopSnapshot,
  buildOrchestratorExecutionLoopResponse,
  buildOrchestratorTurnPlan,
  resolveOrchestratorOperatorSeams,
} from './orchestratorPlan.js';

interface DispatchOrchestratorTurnInput<
  TCompanionStore = unknown,
  TState extends OrchestratorStateView = OrchestratorStateView,
> extends OrchestratorDispatchRequest {
  chatStore: OrchestratorChatStore<TState>;
  channelRouter: OrchestratorChannelRouter<TCompanionStore, TState>;
  plannerSurface: OrchestratorPlannerSurface<TState>;
  runtimeClient: RuntimeClient;
  now?: Date;
  companionStore?: TCompanionStore;
  memoryService?: CatsMemoryService;
}

async function persistDispatchReplayMetadata<TCompanionStore, TState extends OrchestratorStateView>(
  input: DispatchOrchestratorTurnInput<TCompanionStore, TState>,
  taskId: string,
  now: Date,
  options: {
    replayTrigger: OrchestratorDispatchReplayTrigger;
    replayState?: 'ready' | 'in_progress' | 'failed';
    replayAttemptAt?: string | null;
    replayError?: string | null;
    sourceMessageId?: string | null;
    keepPendingApprovalRequest?: boolean;
  } = {
    replayTrigger: 'dispatch',
  },
): Promise<void> {
  await input.chatStore.updateCore((core) => {
    const task = core.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return core;
    }

    const replayRequest = buildOrchestratorDispatchReplayRequest({
      channelId: input.channelId,
      body: input.body,
      senderName: input.senderName,
      transport: input.transport,
      recordedAt: now.toISOString(),
    });
    let metadata = writeOrchestratorDispatchReplayMetadata(
      task.metadata,
      replayRequest,
      {
        replayState: options.replayState,
        replayTrigger: options.replayTrigger,
        replayAttemptAt: options.replayAttemptAt ?? null,
        replayError: options.replayError ?? null,
        sourceMessageId: options.sourceMessageId ?? null,
      },
    );

    if (options.keepPendingApprovalRequest) {
      metadata = writePendingOrchestratorDispatchMetadata(
        metadata,
        buildPendingOrchestratorDispatchRequest({
          channelId: input.channelId,
          body: input.body,
          senderName: input.senderName,
          transport: input.transport,
          blockedAt: now.toISOString(),
        }),
      );
    }

    return upsertCoreTask(
      core,
      {
        id: task.id,
        title: task.title,
        status: task.status,
        conversationId: task.conversationId,
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
  });
}

async function persistPendingApprovalDispatch<TCompanionStore, TState extends OrchestratorStateView>(
  input: DispatchOrchestratorTurnInput<TCompanionStore, TState>,
  taskId: string,
  now: Date,
): Promise<void> {
  await persistDispatchReplayMetadata(input, taskId, now, {
    replayTrigger: 'dispatch',
    replayState: 'ready',
    keepPendingApprovalRequest: true,
  });

  try {
    const core = await input.chatStore.readCore();
    const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
    if (!task) {
      return;
    }
    await persistOrchestratorReplayActivity(
      input.chatStore,
      core,
      {
        task,
        actorId: task.orchestratorActorId,
        phase: 'pending_dispatch_stored',
      },
      now,
    );
  } catch {
    // Replay inspectability is additive; do not block dispatch persistence.
  }
}

export async function dispatchOrchestratorTurn<TCompanionStore, TState extends OrchestratorStateView>(
  input: DispatchOrchestratorTurnInput<TCompanionStore, TState>,
): Promise<OrchestratorDispatchResponse> {
  const now = input.now ?? new Date();
  const stateBefore = await input.chatStore.read();
  const coreBefore = await input.chatStore.readCore();
  const plan = buildOrchestratorTurnPlan(
    stateBefore,
    coreBefore,
    input,
    input.plannerSurface,
  );

  if (plan.execution.approval.status === 'pending') {
    await persistPendingApprovalDispatch(
      input,
      plan.execution.approval.taskId,
      now,
    );
    const coreAfter = await input.chatStore.readCore();
    return {
      contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
      surface: 'direct_product_api',
      operator: resolveOrchestratorOperatorSeams(
        coreAfter,
        input.channelId,
        input.plannerSurface,
      ),
      plan,
      dispatch: {
        channelId: input.channelId,
        status: 'blocked',
        blockedReason: 'approval_pending',
        sourceMessageId: null,
        results: [],
      },
      executionLoop: buildOrchestratorExecutionLoopSnapshot(
        stateBefore,
        coreAfter,
        input.channelId,
        input.plannerSurface,
      ),
    };
  }

  const messageCountBefore = input.channelRouter.buildChannelView(
    stateBefore,
    input.channelId,
  ).messages.length;
  const routed = await input.channelRouter.routeChannelMessage({
    state: stateBefore,
    channelId: input.channelId,
    body: input.body,
    senderName: input.senderName,
    runtimeClient: input.runtimeClient,
    now,
    transport: input.transport === 'telegram' ? 'telegram' : 'web',
    companionStore: input.companionStore,
    memoryService: input.memoryService,
    chatStore: input.chatStore,
    orchestratorPlan: plan,
    choiceResponse: input.choiceResponse,
  });
  const persisted = await input.chatStore.write(routed.state);
  const persistedChannel = input.channelRouter.buildChannelView(
    persisted,
    input.channelId,
  );
  const sourceMessage = persistedChannel.messages[messageCountBefore] ?? null;
  await persistDispatchReplayMetadata(input, plan.execution.approval.taskId, now, {
    replayTrigger: 'dispatch',
    replayState: 'ready',
    sourceMessageId: sourceMessage?.id ?? null,
  });
  const coreAfter = await input.chatStore.readCore();
  const executionLoop = buildOrchestratorExecutionLoopSnapshot(
    persisted,
    coreAfter,
    input.channelId,
    input.plannerSurface,
    {
      turnId: routed.results.find((result) => result.turnId)?.turnId ?? null,
    },
  );

  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(
      coreAfter,
      input.channelId,
      input.plannerSurface,
    ),
    plan,
    dispatch: {
      channelId: input.channelId,
      status: 'dispatched',
      blockedReason: null,
      sourceMessageId: sourceMessage?.id ?? null,
      results: routed.results,
    },
    executionLoop,
  };
}

export { buildOrchestratorExecutionLoopResponse };
