import type { OrchestratorTurnPlan } from '../../../../platform/orchestration/contracts.js';
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

export function toDeterministicChatRoutingPlan(
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
