import type { OrchestratorTurnPlan } from '../../../platform/orchestration/index.js';
import type { SendChannelMessageInput } from './contracts.js';

export function attachOrchestratorPlanMetadata(
  body: SendChannelMessageInput,
  plan: OrchestratorTurnPlan,
): SendChannelMessageInput {
  return {
    ...body,
    messageMetadata: {
      ...(body.messageMetadata ?? {}),
      orchestratorBoundary: 'chat_message_dispatch',
      orchestratorPlanId: plan.planId,
      orchestratorPlanner: plan.execution.planner,
      orchestratorLoopMode: plan.execution.loopMode,
      orchestratorDispatchBoundary: plan.executionLoop.dispatchBoundary,
      orchestratorRuntimeToolBoundary: plan.runtimeToolPlane.boundary,
      orchestratorRoutingTrigger: plan.routing.trigger,
      orchestratorRoutingSelectionKind: plan.routing.resolution.selectionKind,
      orchestratorInitialTargets: plan.routing.initialTargets.map((target) => ({
        targetKind: target.targetKind,
        targetId: target.targetId,
        targetName: target.targetName,
        trigger: target.trigger,
        plannedDepth: target.plannedDepth,
      })),
    },
  };
}
