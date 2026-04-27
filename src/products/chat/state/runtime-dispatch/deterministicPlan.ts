import type { OrchestratorTurnPlan } from '../../../../platform/orchestration/contracts.js';
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
}

export interface DeterministicChatRoutingPlan {
  planId: string;
  channelId: string;
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
      })),
    },
  };
}
