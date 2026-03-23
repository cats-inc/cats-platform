import type { CompanionBoxStore } from '../../products/chat/state/companionBoxStore.js';
import type { ChatStore } from '../../products/chat/state/store.js';
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
  buildOrchestratorExecutionLoopSnapshot,
  buildOrchestratorTurnPlan,
  buildOrchestratorExecutionLoopResponse,
} from './planner.js';
import { buildApprovalQueue } from '../../core/model.js';

interface DispatchOrchestratorTurnInput extends OrchestratorPlanRequest {
  chatStore: ChatStore;
  runtimeClient: RuntimeClient;
  now?: Date;
  companionStore?: CompanionBoxStore;
}

export async function dispatchOrchestratorTurn(
  input: DispatchOrchestratorTurnInput,
): Promise<OrchestratorDispatchResponse> {
  const now = input.now ?? new Date();
  const stateBefore = await input.chatStore.read();
  const coreBefore = await input.chatStore.readCore();
  const messageCountBefore = buildChannelView(stateBefore, input.channelId).messages.length;
  const plan = buildOrchestratorTurnPlan(stateBefore, coreBefore, input);
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
    },
  );
  const persisted = await input.chatStore.write(routed.state);
  const coreAfter = await input.chatStore.readCore();
  const persistedChannel = buildChannelView(persisted, input.channelId);
  const sourceMessage = persistedChannel.messages[messageCountBefore] ?? null;
  const executionLoop = buildOrchestratorExecutionLoopSnapshot(
    coreAfter,
    input.channelId,
    routed.results.find((result) => result.turnId)?.turnId ?? null,
  );
  const operatorView = executionLoop.operator;

  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: {
      conversationId: operatorView?.conversationId ?? `conversation-channel-${input.channelId}`,
      taskId: operatorView?.task?.id ?? `task-channel-${input.channelId}`,
      approvalsPath: '/api/core/approvals',
      operatorActionsPath: '/api/core/operator-actions',
      executionLoopPath: `/api/orchestrator/channels/${input.channelId}/execution-loop`,
      latestApprovalId: operatorView?.latestApproval?.id ?? buildApprovalQueue(coreAfter)[0]?.id ?? null,
      latestRunId: operatorView?.latestRun?.id ?? null,
    },
    plan,
    dispatch: {
      channelId: input.channelId,
      sourceMessageId: sourceMessage?.id ?? null,
      results: routed.results,
    },
    executionLoop,
  };
}

export { buildOrchestratorExecutionLoopResponse };
