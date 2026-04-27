import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
  OrchestratorTurnPlan,
} from '../../../platform/orchestration/contracts.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import type { WorkflowContinuationReplaySnapshot } from '../../../platform/orchestration/workflowContinuationReplay.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../shared/runtimeRecovery.js';
import { buildApprovalQueue } from '../../../core/model/index.js';
import type { CompanionBoxStore } from './companion-box/index.js';
import type { ChatState } from '../api/contracts.js';
import type { ChatStore } from './store.js';
import { buildChannelView, resolveOrchestratorDisplayName } from './model/index.js';
import { resolveMentionRoute } from './mentionRouter.js';
import { resolveRoomRoutingState } from './room-routing/index.js';
import {
  resumeWorkflowContinuationReplay,
  routeChannelMessage,
} from './runtimeActions.js';
import type { DeterministicChatRoutingPlan } from './runtime-dispatch/deterministicPlan.js';
import {
  buildChatOperatorView,
  buildRunInspectorView,
  resolveChatConversationId,
} from '../shared/operator-loop/index.js';

function toDeterministicChatRoutingPlan(
  plan: OrchestratorTurnPlan | null | undefined,
): DeterministicChatRoutingPlan | null {
  if (!plan) {
    return null;
  }

  return {
    planId: plan.planId,
    channelId: plan.channelId,
    metadata: {
      planner: plan.execution.planner,
      loopMode: plan.execution.loopMode,
      dispatchBoundary: plan.executionLoop.dispatchBoundary,
      runtimeToolBoundary: plan.runtimeToolPlane.boundary,
    },
    routing: {
      trigger: plan.routing.trigger,
      resolution: structuredClone(plan.routing.resolution),
      mentionNames: [...plan.routing.mentionNames],
      unresolvedMentions: [...plan.routing.unresolvedMentions],
      initialTargets: plan.routing.initialTargets.map((target) => ({
        participantKind: target.targetKind,
        participantId: target.targetId,
        participantName: target.targetName,
        laneId: target.laneId,
        sessionId: target.sessionId,
        trigger: target.trigger,
        plannedDepth: target.plannedDepth,
      })),
    },
  };
}

export function createChatDeterministicChannelRouter(
  options: {
    runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
    chatStatePath?: string;
    runtimeDataDir?: string;
  } = {},
): OrchestratorChannelRouter<CompanionBoxStore, ChatState> {
  return {
    buildChannelView,
    async routeChannelMessage(input) {
      return routeChannelMessage(
        input.state,
        input.channelId,
        {
          body: input.body,
          senderName: input.senderName,
        },
        input.runtimeClient,
        input.now,
        {
          transport: input.transport,
          companionStore: input.companionStore,
          memoryService: input.memoryService,
          chatStore: input.chatStore as ChatStore,
          runtimeRecovery: options.runtimeRecovery,
          chatStatePath: options.chatStatePath,
          runtimeDataDir: options.runtimeDataDir,
          deterministicRoutingPlan: toDeterministicChatRoutingPlan(input.orchestratorPlan),
        },
      );
    },
  };
}

export const chatDeterministicChannelRouter = createChatDeterministicChannelRouter();

export const chatDeterministicPlannerSurface: OrchestratorPlannerSurface<ChatState> = {
  buildChannelView,
  resolveMentionRoute,
  resolveRoomRoutingState,
  resolveOrchestratorDisplayName,
  buildOperatorView(core, channelId) {
    return buildChatOperatorView(
      {
        core,
        approvals: buildApprovalQueue(core),
      },
      channelId,
    );
  },
  buildRunInspectorView,
  resolveConversationId: resolveChatConversationId,
};

export async function resumeStoredWorkflowContinuationDispatch(input: {
  request: WorkflowContinuationReplaySnapshot;
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'writeCore'>;
  runtimeClient: RuntimeClient;
  now: Date;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  onStateWritten?: (channelId: string) => void;
}) {
  return resumeWorkflowContinuationReplay(input);
}
