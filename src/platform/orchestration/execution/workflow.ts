import type {
  RoomWorkflowEvent,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../shared/roomRouting.js';
import type { CatsCoreState } from '../../../core/types.js';
import type {
  OrchestratorChannelView,
  OrchestratorExecutionCheckpoint,
  OrchestratorExecutionPlan,
  OrchestratorExecutionStep,
  OrchestratorExecutionStepKind,
  OrchestratorExecutionTargetRef,
  OrchestratorOperatorSeams,
  OrchestratorRunInspectorView,
} from '../contracts.js';
import { buildRoomWorkflowRunId } from '../runIds.js';
import {
  buildApprovalGate,
  buildNextActions,
  buildRecoveryLoop,
  mapExecutionState,
  mapStepStatusFromTarget,
  mapStepStatusFromWorkflow,
  mapWorkflowTargetToExecutionRef,
  readCheckpointKind,
  resolveApprovalStep,
  resolveParticipantExecutionLease,
} from './shared.js';

interface ExecutionSelection {
  runId?: string | null;
  turnId?: string | null;
}

function readEventTargetIdentities(
  event: RoomWorkflowEvent,
): Array<{
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  laneId: string | null;
  sessionId: string | null;
}> {
  const rawTargetIdentities = event.metadata.targetIdentities;
  if (!Array.isArray(rawTargetIdentities)) {
    return [];
  }

  return rawTargetIdentities.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const participantKind = record.participantKind === 'orchestrator'
      || record.participantKind === 'cat'
      ? record.participantKind
      : null;
    const participantId = typeof record.participantId === 'string'
      && record.participantId.trim().length > 0
      ? record.participantId.trim()
      : null;
    if (!participantKind || !participantId) {
      return [];
    }

    return [{
      participantKind,
      participantId,
      laneId: typeof record.laneId === 'string' && record.laneId.trim().length > 0
        ? record.laneId.trim()
        : null,
      sessionId: typeof record.sessionId === 'string' && record.sessionId.trim().length > 0
        ? record.sessionId.trim()
        : null,
    }];
  });
}

function resolveWorkflowTurn(
  channel: OrchestratorChannelView,
  selection: ExecutionSelection = {},
): RoomWorkflowTurn | null {
  const workflow = channel.roomRouting?.workflow;
  if (!workflow) {
    return null;
  }

  const turns = [
    ...(workflow.activeTurn ? [workflow.activeTurn] : []),
    ...workflow.turnHistory,
  ];

  if (selection.turnId) {
    return turns.find((turn) => turn.id === selection.turnId) ?? null;
  }

  if (selection.runId) {
    return turns.find((turn) => buildRoomWorkflowRunId(channel.id, turn.id) === selection.runId)
      ?? null;
  }

  return workflow.activeTurn ?? workflow.turnHistory[0] ?? null;
}

function buildCheckpointSummary(
  event: RoomWorkflowEvent,
): OrchestratorExecutionCheckpoint {
  return {
    checkpointId: event.checkpointId,
    checkpointKind: readCheckpointKind(event.metadata.checkpointKind),
    message: event.message,
    createdAt: event.createdAt,
    actor: event.actor,
    targets: [...event.targets],
  };
}

function buildRootWorkflowStep(
  turn: RoomWorkflowTurn,
  channel: OrchestratorChannelView,
): OrchestratorExecutionStep {
  return {
    id: `dispatch-group-${turn.id}`,
    phase: 'dispatch',
    kind: turn.workflowShape === 'concurrent' ? 'concurrent_fan_out' : 'dispatch_group',
    status: mapStepStatusFromWorkflow(turn.status),
    title: turn.workflowShape === 'concurrent'
      ? 'Concurrent room execution'
      : 'Room execution stage',
    summary: turn.workflowShape === 'concurrent'
      ? `This turn fanned out to ${turn.targetStatuses.length} concurrent branch(es).`
      : turn.dispatchCount === 0
        ? 'This turn has not dispatched any work yet.'
        : `This turn routed work through ${turn.dispatchCount} dispatch(es).`,
    stageId: turn.stageId,
    workflowShape: turn.workflowShape,
    parentStepId: null,
    participant: null,
    targets: turn.targetStatuses.map((target) => mapWorkflowTargetToExecutionRef(channel, target)),
    checkpointId: turn.lastCheckpointId,
    outcomeId: null,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    retryable: turn.status === 'blocked' || turn.status === 'failed',
  };
}

function buildTargetStep(
  turn: RoomWorkflowTurn,
  channel: OrchestratorChannelView,
  target: RoomWorkflowTargetState,
): OrchestratorExecutionStep {
  const mappedTarget = mapWorkflowTargetToExecutionRef(channel, target);
  return {
    id: `dispatch-target-${target.id}`,
    phase: target.depth === 0 ? 'dispatch' : 'execute',
    kind: 'dispatch_target',
    status: mapStepStatusFromTarget(target.status),
    title: `Dispatch ${target.participant.participantName}`,
    summary: target.error
      ? `${target.participant.participantName} failed during ${target.depth === 0 ? 'dispatch' : 'handoff'} execution.`
      : `${target.participant.participantName} handled depth ${target.depth} of the room workflow.`,
    stageId: turn.stageId,
    workflowShape: turn.workflowShape,
    parentStepId: `dispatch-group-${turn.id}`,
    participant: mappedTarget,
    targets: [mappedTarget],
    checkpointId: target.parentCheckpointId,
    outcomeId: null,
    startedAt: target.startedAt ?? target.queuedAt,
    completedAt: target.completedAt,
    retryable: target.status === 'blocked' || target.status === 'failed',
  };
}

function buildEventStep(
  turn: RoomWorkflowTurn,
  channel: OrchestratorChannelView,
  event: RoomWorkflowEvent,
): OrchestratorExecutionStep | null {
  const rawShape = event.metadata.workflowShape === 'parallel'
    ? 'concurrent'
    : event.metadata.workflowShape;
  const workflowShape = (
    rawShape === 'concurrent'
    || rawShape === 'sequential'
    || rawShape === 'converge'
  )
    ? rawShape
    : turn.workflowShape;
  const stageId = typeof event.metadata.workflowStageId === 'string'
    ? event.metadata.workflowStageId
    : turn.stageId;
  const eventTargetIdentities = readEventTargetIdentities(event);
  const eventTargets = event.targets.map((target, targetIndex) => {
    const lease = resolveParticipantExecutionLease(channel, target);
    const indexedIdentity = eventTargetIdentities[targetIndex] ?? null;
    const targetIdentity = (
      indexedIdentity?.participantKind === target.participantKind
      && indexedIdentity.participantId === target.participantId
    )
      ? indexedIdentity
      : eventTargetIdentities.find((candidate) =>
      candidate.participantKind === target.participantKind
      && candidate.participantId === target.participantId,
    ) ?? null;
    return {
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
      laneId: targetIdentity?.laneId ?? lease?.laneId ?? null,
      sessionId: targetIdentity?.sessionId ?? lease?.sessionId ?? null,
      trigger: null,
      plannedDepth: 0,
      dispatchId: event.dispatchId,
      response: null,
      branchStrategy: null,
      handoffReason: null,
      mentionNames: [],
      sourceParticipant: event.actor,
      sourceMessageId: event.sourceMessageId,
      error: null,
    } satisfies OrchestratorExecutionTargetRef;
  });

  let kind: OrchestratorExecutionStepKind | null = null;
  let phase: OrchestratorExecutionStep['phase'] = 'execute';
  let retryable = false;

  if (event.kind === 'fan_out') {
    kind = 'concurrent_fan_out';
    phase = 'dispatch';
  } else if (event.kind === 'guard_blocked') {
    kind = 'recovery';
    phase = 'recover';
    retryable = true;
  } else if (event.kind === 'outcome') {
    kind = 'report_outcome';
    phase = 'report';
  } else if (event.kind === 'checkpoint') {
    const checkpointKind = readCheckpointKind(event.metadata.checkpointKind);
    if (checkpointKind === 'continuation') {
      kind = 'continuation_handoff';
    } else if (
      checkpointKind === 'loop_guard'
      || checkpointKind === 'anti_ping_pong'
      || checkpointKind === 'runtime_error'
    ) {
      kind = 'recovery';
      phase = 'recover';
      retryable = true;
    } else if (checkpointKind === 'completed') {
      kind = 'report_outcome';
      phase = 'report';
    }
  }

  if (!kind) {
    return null;
  }

  return {
    id: `workflow-event-${event.id}`,
    phase,
    kind,
    status: mapStepStatusFromWorkflow(event.status),
    title: kind === 'concurrent_fan_out'
      ? 'Concurrent fan-out'
      : kind === 'continuation_handoff'
        ? 'Continuation handoff'
        : kind === 'report_outcome'
          ? 'Outcome report'
          : 'Recovery checkpoint',
    summary: event.message,
    stageId,
    workflowShape,
    parentStepId: `dispatch-group-${turn.id}`,
    participant: null,
    targets: eventTargets,
    checkpointId: event.checkpointId,
    outcomeId: event.outcomeId,
    startedAt: event.createdAt,
    completedAt: event.createdAt,
    retryable,
  };
}

export function buildExecutionPlanFromChannel(input: {
  channel: OrchestratorChannelView;
  core: CatsCoreState;
  operatorSeams: OrchestratorOperatorSeams;
  runInspector: OrchestratorRunInspectorView | null;
  selection?: ExecutionSelection;
}): OrchestratorExecutionPlan {
  const approval = buildApprovalGate(input.core, input.operatorSeams);
  const approvalStep = resolveApprovalStep(approval);
  const recovery = buildRecoveryLoop(input.runInspector, input.operatorSeams);
  const turn = resolveWorkflowTurn(input.channel, input.selection);
  const state = mapExecutionState(turn?.status ?? null, approval);

  if (!turn) {
    return {
      planner: 'dynamic_room_workflow',
      loopMode: 'checkpoint_driven',
      state,
      stageId: null,
      workflowShape: null,
      sourceTurnId: null,
      sourceMessageId: null,
      steps: approvalStep ? [approvalStep] : [],
      checkpoints: [],
      nextActions: buildNextActions({
        state,
        approval,
        recovery,
        canDispatch: false,
        dispatchAction: null,
      }),
      approval,
      recovery,
    };
  }

  const rootStep = buildRootWorkflowStep(turn, input.channel);
  const steps: OrchestratorExecutionStep[] = [];
  if (approvalStep) {
    steps.push(approvalStep);
  }
  steps.push(rootStep);
  steps.push(...turn.targetStatuses.map((target) => buildTargetStep(turn, input.channel, target)));
  steps.push(
    ...turn.events
      .map((event) => buildEventStep(turn, input.channel, event))
      .filter((event): event is OrchestratorExecutionStep => event !== null),
  );

  return {
    planner: 'dynamic_room_workflow',
    loopMode: 'checkpoint_driven',
    state,
    stageId: turn.stageId,
    workflowShape: turn.workflowShape,
    sourceTurnId: turn.id,
    sourceMessageId: turn.sourceMessageId,
    steps,
    checkpoints: turn.events
      .filter((event) => event.kind === 'checkpoint')
      .map((event) => buildCheckpointSummary(event)),
    nextActions: buildNextActions({
      state,
      approval,
      recovery,
      canDispatch: false,
      dispatchAction: null,
    }),
    approval,
    recovery,
  };
}
