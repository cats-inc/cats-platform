import type {
  RoomWorkflowShape,
} from '../../../shared/roomRouting.js';
import type { CatsCoreState } from '../../../core/types.js';
import type {
  OrchestratorDispatchTargetPlan,
  OrchestratorExecutionPlan,
  OrchestratorExecutionState,
  OrchestratorExecutionStep,
  OrchestratorOperatorSeams,
  OrchestratorRecoveryLoop,
} from '../contracts.js';
import {
  buildActionEnvelope,
  buildApprovalGate,
  buildNextActions,
  mapTargetPlanToExecutionRef,
  resolveApprovalStep,
} from './shared.js';

interface PreDispatchExecutionInput {
  planId: string;
  channelId: string;
  sourceMessageId: string | null;
  initialStageId: string;
  initialShape: RoomWorkflowShape | 'blocked';
  initialTargets: OrchestratorDispatchTargetPlan[];
  sourceBody: string;
  senderName: string;
  transport: 'telegram' | 'line' | 'web';
}

export function buildPreDispatchExecutionPlan(
  input: PreDispatchExecutionInput,
  core: CatsCoreState,
  operatorSeams: OrchestratorOperatorSeams,
): OrchestratorExecutionPlan {
  const approval = buildApprovalGate(core, operatorSeams);
  const recovery: OrchestratorRecoveryLoop = {
    guardReason: null,
    cooldownLabel: null,
    incidentActions: [],
  };
  const rootStepId = `dispatch-group-${input.planId}`;
  const canDispatch = approval.status !== 'pending' && input.initialTargets.length > 0;
  const steps: OrchestratorExecutionStep[] = [];
  const approvalStep = resolveApprovalStep(approval);
  if (approvalStep) {
    steps.push(approvalStep);
  }

  steps.push({
    id: rootStepId,
    phase: 'dispatch',
    kind: input.initialShape === 'parallel' ? 'parallel_fan_out' : 'dispatch_group',
    status: input.initialTargets.length === 0
      ? 'blocked'
      : approval.status === 'pending'
        ? 'pending'
        : 'ready',
    title: input.initialShape === 'parallel'
      ? 'Initial parallel fan-out'
      : 'Initial dispatch stage',
    summary: input.initialTargets.length === 0
      ? 'No valid initial targets were resolved for this turn.'
      : `Route the turn to ${input.initialTargets.map((target) => target.targetName).join(', ')}.`,
    stageId: input.initialStageId,
    workflowShape: input.initialShape,
    parentStepId: approvalStep?.id ?? null,
    participant: null,
    targets: input.initialTargets.map((target) => mapTargetPlanToExecutionRef(target)),
    checkpointId: null,
    outcomeId: null,
    startedAt: null,
    completedAt: null,
    retryable: false,
  });

  for (const [index, target] of input.initialTargets.entries()) {
    steps.push({
      id: `dispatch-target-${input.planId}-${index}`,
      phase: target.plannedDepth === 0 ? 'dispatch' : 'execute',
      kind: 'dispatch_target',
      status: approval.status === 'pending' ? 'pending' : 'ready',
      title: `Dispatch ${target.targetName}`,
      summary: `Wake and send the turn to ${target.targetName}.`,
      stageId: input.initialStageId,
      workflowShape: input.initialShape,
      parentStepId: rootStepId,
      participant: mapTargetPlanToExecutionRef(target),
      targets: [mapTargetPlanToExecutionRef(target)],
      checkpointId: null,
      outcomeId: null,
      startedAt: null,
      completedAt: null,
      retryable: false,
    });
  }

  steps.push({
    id: `dynamic-handoff-${input.planId}`,
    phase: 'execute',
    kind: 'continuation_handoff',
    status: input.initialTargets.length === 0 ? 'blocked' : 'pending',
    title: 'Checkpoint-driven handoff loop',
    summary: 'Normalize specialist checkpoints and continue sequential or parallel follow-up work.',
    stageId: 'continuation_handoff',
    workflowShape: input.initialShape === 'blocked' ? 'blocked' : null,
    parentStepId: rootStepId,
    participant: null,
    targets: [],
    checkpointId: null,
    outcomeId: null,
    startedAt: null,
    completedAt: null,
    retryable: false,
  });

  steps.push({
    id: `report-outcome-${input.planId}`,
    phase: 'report',
    kind: 'report_outcome',
    status: input.initialTargets.length === 0 ? 'blocked' : 'pending',
    title: 'Report outcome',
    summary: 'Persist the room outcome, checkpoints, and operator-facing run summary.',
    stageId: 'turn_completed',
    workflowShape: input.initialShape === 'blocked' ? 'blocked' : null,
    parentStepId: rootStepId,
    participant: null,
    targets: [],
    checkpointId: null,
    outcomeId: null,
    startedAt: null,
    completedAt: null,
    retryable: false,
  });

  const state: OrchestratorExecutionState = approval.status === 'pending'
    ? 'awaiting_approval'
    : input.initialTargets.length === 0
      ? 'blocked'
      : 'planned';

  return {
    planner: 'dynamic_room_workflow',
    loopMode: 'checkpoint_driven',
    state,
    stageId: input.initialStageId,
    workflowShape: input.initialShape,
    sourceTurnId: null,
    sourceMessageId: input.sourceMessageId,
    steps,
    checkpoints: [],
    nextActions: buildNextActions({
      state,
      approval,
      recovery,
      canDispatch,
      dispatchAction: canDispatch
        ? buildActionEnvelope('/api/orchestrator/dispatch', {
            channelId: input.channelId,
            body: input.sourceBody,
            senderName: input.senderName,
            transport: input.transport,
          })
        : null,
      dispatchLabel: approval.latestDecisionAction === 'reroute'
        ? 'Dispatch revised plan'
        : 'Dispatch plan',
    }),
    approval,
    recovery,
  };
}
