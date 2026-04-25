import type {
  ChannelDispatchAcknowledgement,
  ChannelDispatchOrchestratorSummary,
  ChannelDispatchResult,
} from './contracts.js';
import type { OrchestratorTurnPlan } from '../../../platform/orchestration/contracts.js';

export function buildChannelDispatchOrchestratorSummary(
  plan: OrchestratorTurnPlan,
): ChannelDispatchOrchestratorSummary {
  return {
    planId: plan.planId,
    planner: plan.execution.planner,
    loopMode: plan.execution.loopMode,
    dispatchBoundary: plan.executionLoop.dispatchBoundary,
    runtimeToolBoundary: plan.runtimeToolPlane.boundary,
    initialTargets: plan.routing.initialTargets,
  };
}

export function buildChannelDispatchAcknowledgement(input: {
  channelId: string;
  results: ChannelDispatchResult[];
  plan: OrchestratorTurnPlan;
}): ChannelDispatchAcknowledgement {
  return {
    channelId: input.channelId,
    results: input.results,
    orchestrator: buildChannelDispatchOrchestratorSummary(input.plan),
  };
}
