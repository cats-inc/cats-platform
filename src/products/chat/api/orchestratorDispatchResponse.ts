import type {
  ChannelDispatchAcknowledgement,
  ChannelDispatchOrchestratorSummary,
  ChannelDispatchResult,
} from './contracts.js';
import type { BegunChannelMessageDispatch } from '../state/runtime-dispatch/routing.js';
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
    initialTargets: plan.routing.initialTargets.map((target) => ({
      targetKind: target.targetKind,
      targetId: target.targetId,
      targetName: target.targetName,
      laneId: target.laneId,
      sessionId: target.sessionId,
      trigger: target.trigger,
      plannedDepth: target.plannedDepth,
    })),
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

export function buildChannelDispatchOrchestratorSummaryFromBegun(
  channelId: string,
  begun: BegunChannelMessageDispatch,
): ChannelDispatchOrchestratorSummary {
  const preparedTurn = begun.preparedTurn;
  const trigger = preparedTurn?.initialResolution.trigger ?? 'room_default';
  return {
    planId:
      preparedTurn?.providerAgentObservation?.observationId
      ?? (
        typeof begun.userMessage.metadata.orchestratorPlanId === 'string'
          ? begun.userMessage.metadata.orchestratorPlanId
          : `chat-deterministic:${channelId}:${begun.userMessage.id}`
      ),
    planner:
      typeof begun.userMessage.metadata.orchestratorPlanner === 'string'
        ? begun.userMessage.metadata.orchestratorPlanner
        : preparedTurn?.providerAgentObservation
          ? 'provider_agent_observation'
          : 'chat_deterministic_router',
    loopMode:
      typeof begun.userMessage.metadata.orchestratorLoopMode === 'string'
        ? begun.userMessage.metadata.orchestratorLoopMode
        : 'agent_driven',
    dispatchBoundary:
      typeof begun.userMessage.metadata.orchestratorDispatchBoundary === 'string'
        ? begun.userMessage.metadata.orchestratorDispatchBoundary
        : 'supervised_runtime_boundary',
    runtimeToolBoundary:
      typeof begun.userMessage.metadata.orchestratorRuntimeToolBoundary === 'string'
        ? begun.userMessage.metadata.orchestratorRuntimeToolBoundary
        : 'runtime_mcp_facade',
    initialTargets: (preparedTurn?.initialResolution.targets ?? []).map((target) => {
      const targetStatus = preparedTurn?.activeTurn.targetStatuses.find((candidate) =>
        candidate.participant.participantKind === target.participantKind
        && candidate.participant.participantId === target.participantId
        && candidate.laneId === (target.laneId ?? null));
      return {
        targetKind: target.participantKind,
        targetId: target.participantId,
        targetName: target.participantName,
        laneId: target.laneId,
        sessionId: target.sessionId,
        trigger: targetStatus?.trigger ?? trigger,
        plannedDepth: targetStatus?.depth ?? 0,
      };
    }),
  };
}

export function buildChannelDispatchAcknowledgementFromBegun(input: {
  channelId: string;
  begun: BegunChannelMessageDispatch;
}): ChannelDispatchAcknowledgement {
  return {
    channelId: input.channelId,
    results: input.begun.results,
    orchestrator: buildChannelDispatchOrchestratorSummaryFromBegun(
      input.channelId,
      input.begun,
    ),
  };
}
