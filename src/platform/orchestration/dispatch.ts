import type { CompanionBoxStore } from '../../products/chat/state/companionBoxStore.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import { upsertCoreTask } from '../../core/model.js';
import type { CatsMemoryService } from '../memory/index.js';
import type { RuntimeClient } from '../runtime/client.js';
import { buildChannelView } from '../../products/chat/state/model.js';
import { routeChannelMessage } from '../../products/chat/state/runtimeActions.js';
import type {
  OrchestratorDispatchResponse,
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

interface DispatchOrchestratorTurnInput extends OrchestratorPlanRequest {
  chatStore: ChatStore;
  runtimeClient: RuntimeClient;
  now?: Date;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
}

async function persistPendingApprovalDispatch(
  input: DispatchOrchestratorTurnInput,
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

export async function dispatchOrchestratorTurn(
  input: DispatchOrchestratorTurnInput,
): Promise<OrchestratorDispatchResponse> {
  const now = input.now ?? new Date();
  const stateBefore = await input.chatStore.read();
  const coreBefore = await input.chatStore.readCore();
  const plan = buildOrchestratorTurnPlan(stateBefore, coreBefore, input);

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
      operator: resolveOrchestratorOperatorSeams(coreAfter, input.channelId),
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
      ),
    };
  }

  const messageCountBefore = buildChannelView(stateBefore, input.channelId).messages.length;
  const routed = await routeChannelMessage(
    stateBefore,
    input.channelId,
    {
      body: input.body,
      senderName: input.senderName,
    },
    input.runtimeClient,
    now,
    {
      transport: input.transport === 'telegram' ? 'telegram' : 'web',
      companionStore: input.companionStore,
      memoryService: input.memoryService,
    },
  );
  const persisted = await input.chatStore.write(routed.state);
  const coreAfter = await input.chatStore.readCore();
  const persistedChannel = buildChannelView(persisted, input.channelId);
  const sourceMessage = persistedChannel.messages[messageCountBefore] ?? null;
  const executionLoop = buildOrchestratorExecutionLoopSnapshot(
    persisted,
    coreAfter,
    input.channelId,
    {
      turnId: routed.results.find((result) => result.turnId)?.turnId ?? null,
    },
  );

  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(coreAfter, input.channelId),
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
