import { upsertCoreTask } from '../../core/model.js';
import type { CatsMemoryService } from '../memory/index.js';
import type { RuntimeClient } from '../runtime/client.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorChatStore,
  OrchestratorDispatchResponse,
  OrchestratorPlannerSurface,
  OrchestratorPlanRequest,
} from './contracts.js';
import {
  ORCHESTRATOR_CONTRACT_VERSION,
} from './contracts.js';
import {
  buildPendingOrchestratorDispatchRequest,
  writePendingOrchestratorDispatchMetadata,
} from './pendingDispatch.js';
import {
  buildOrchestratorExecutionLoopSnapshot,
  buildOrchestratorExecutionLoopResponse,
  buildOrchestratorTurnPlan,
  resolveOrchestratorOperatorSeams,
} from './planner.js';

interface DispatchOrchestratorTurnInput<TCompanionStore = unknown> extends OrchestratorPlanRequest {
  chatStore: OrchestratorChatStore;
  channelRouter: OrchestratorChannelRouter<TCompanionStore>;
  plannerSurface: OrchestratorPlannerSurface;
  runtimeClient: RuntimeClient;
  now?: Date;
  companionStore?: TCompanionStore;
  memoryService?: CatsMemoryService;
}

async function persistPendingApprovalDispatch<TCompanionStore>(
  input: DispatchOrchestratorTurnInput<TCompanionStore>,
  taskId: string,
  now: Date,
): Promise<void> {
  const core = await input.chatStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return;
  }

  const next = upsertCoreTask(
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
      metadata: writePendingOrchestratorDispatchMetadata(
        task.metadata,
        buildPendingOrchestratorDispatchRequest({
          channelId: input.channelId,
          body: input.body,
          senderName: input.senderName,
          transport: input.transport,
          blockedAt: now.toISOString(),
        }),
      ),
    },
    now,
  );
  await input.chatStore.writeCore(next.core);
}

export async function dispatchOrchestratorTurn<TCompanionStore>(
  input: DispatchOrchestratorTurnInput<TCompanionStore>,
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
  });
  const persisted = await input.chatStore.write(routed.state);
  const coreAfter = await input.chatStore.readCore();
  const persistedChannel = input.channelRouter.buildChannelView(
    persisted,
    input.channelId,
  );
  const sourceMessage = persistedChannel.messages[messageCountBefore] ?? null;
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
