import type { SendChannelMessageInput } from '../../api/contracts.js';
import type {
  RoomRouteResolution,
  RoomRoutingTrigger,
} from '../../../../shared/roomRouting.js';

export interface DeterministicChatRoutingPlanTarget {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
  laneId: string | null;
  sessionId: string | null;
  trigger: RoomRoutingTrigger;
  plannedDepth: number;
}

export interface DeterministicChatRoutingPlan {
  planId: string;
  channelId: string;
  metadata: {
    planner: string;
    loopMode: string;
    dispatchBoundary: string;
    runtimeToolBoundary: string;
  };
  routing: {
    trigger: RoomRoutingTrigger;
    resolution: RoomRouteResolution;
    mentionNames: string[];
    unresolvedMentions: string[];
    initialTargets: DeterministicChatRoutingPlanTarget[];
  };
}

export function buildDeterministicRoutingPlanMessageMetadata(
  plan: DeterministicChatRoutingPlan | null | undefined,
): NonNullable<SendChannelMessageInput['messageMetadata']> {
  if (!plan) {
    return {};
  }

  return {
    orchestratorBoundary: 'chat_message_dispatch',
    orchestratorPlanId: plan.planId,
    orchestratorPlanner: plan.metadata.planner,
    orchestratorLoopMode: plan.metadata.loopMode,
    orchestratorDispatchBoundary: plan.metadata.dispatchBoundary,
    orchestratorRuntimeToolBoundary: plan.metadata.runtimeToolBoundary,
    orchestratorRoutingTrigger: plan.routing.trigger,
    orchestratorRoutingSelectionKind: plan.routing.resolution.selectionKind,
    orchestratorInitialTargets: plan.routing.initialTargets.map((target) => ({
      targetKind: target.participantKind,
      targetId: target.participantId,
      targetName: target.participantName,
      trigger: target.trigger,
      plannedDepth: target.plannedDepth,
    })),
  };
}
