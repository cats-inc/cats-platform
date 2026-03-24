import type {
  ChatChannelView,
  RoomRoutingCheckpointKind,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowEvent,
  RoomWorkflowShape,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTargetStatus,
  RoomWorkflowTurn,
} from '../../shared/app-shell.js';
import type { CatsCoreState } from '../../core/types.js';
import type {
  OrchestratorActionEnvelope,
  OrchestratorApprovalGate,
  OrchestratorDispatchTargetPlan,
  OrchestratorExecutionCheckpoint,
  OrchestratorExecutionPlan,
  OrchestratorExecutionState,
  OrchestratorExecutionStep,
  OrchestratorExecutionStepKind,
  OrchestratorExecutionStepStatus,
  OrchestratorExecutionTargetRef,
  OrchestratorNextAction,
  OrchestratorOperatorActionContract,
  OrchestratorRunInspectorView,
  OrchestratorOperatorSeams,
  OrchestratorRecoveryLoop,
  OrchestratorRuntimeToolPlane,
} from './contracts.js';
import {
  ORCHESTRATOR_RUNTIME_TOOL_SCHEMA_VERSION,
} from './contracts.js';
import { buildRoomWorkflowRunId } from './runIds.js';
import { ORCHESTRATOR_RUNTIME_MCP_TOOLS } from './toolIntent.js';

const RUNTIME_MCP_METHODS: OrchestratorRuntimeToolPlane['methods'] = [
  'initialize',
  'tools/list',
  'tools/call',
  'notifications/initialized',
];

const CHECKPOINT_KINDS = new Set<RoomRoutingCheckpointKind>([
  'turn_started',
  'fan_out',
  'continuation',
  'loop_guard',
  'anti_ping_pong',
  'no_targets',
  'completed',
  'runtime_error',
]);

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

interface ExecutionSelection {
  runId?: string | null;
  turnId?: string | null;
}

function mapApprovalStatus(
  value: unknown,
): OrchestratorApprovalGate['status'] {
  switch (value) {
    case 'pending':
    case 'approved':
    case 'rejected':
      return value;
    default:
      return 'not_requested';
  }
}

function mapStepStatusFromTarget(
  status: RoomWorkflowTargetStatus,
): OrchestratorExecutionStepStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'skipped';
    case 'waiting_for_converge':
    case 'pending':
    default:
      return 'pending';
  }
}

function mapStepStatusFromWorkflow(
  status: RoomWorkflowStatus,
): OrchestratorExecutionStepStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    case 'idle':
    case 'pending':
    default:
      return 'pending';
  }
}

function mapExecutionState(
  value: RoomWorkflowStatus | null,
  approval: OrchestratorApprovalGate,
): OrchestratorExecutionState {
  if (approval.status === 'pending') {
    return 'awaiting_approval';
  }

  switch (value) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    default:
      return 'planned';
  }
}

function readCheckpointKind(value: unknown): RoomRoutingCheckpointKind | null {
  return typeof value === 'string' && CHECKPOINT_KINDS.has(value as RoomRoutingCheckpointKind)
    ? value as RoomRoutingCheckpointKind
    : null;
}

function buildActionEnvelope(
  path: string,
  body: Record<string, unknown>,
): OrchestratorActionEnvelope {
  return {
    method: 'POST',
    path,
    body,
  };
}

function buildRuntimeToolPlane(): OrchestratorRuntimeToolPlane {
  return {
    boundary: 'runtime_mcp_facade',
    productSurfacePath: '/api/runtime/mcp',
    runtimeSurfacePath: '/mcp',
    protocol: 'jsonrpc_2_0_http',
    schemaVersion: ORCHESTRATOR_RUNTIME_TOOL_SCHEMA_VERSION,
    methods: [...RUNTIME_MCP_METHODS],
    tools: ORCHESTRATOR_RUNTIME_MCP_TOOLS.map((name) => ({
      name,
      source: 'cats-runtime' as const,
    })),
  };
}

function resolveParticipantSessionId(
  channel: ChatChannelView,
  participant: RoomRoutingParticipantRef | null,
): string | null {
  if (!participant) {
    return null;
  }

  if (participant.participantKind === 'orchestrator') {
    return channel.orchestratorLease.sessionId;
  }

  return channel.assignedCats.find((cat) => cat.catId === participant.participantId)
    ?.execution.lease.sessionId ?? null;
}

function mapTargetPlanToExecutionRef(
  target: OrchestratorDispatchTargetPlan,
): OrchestratorExecutionTargetRef {
  return {
    participantKind: target.targetKind,
    participantId: target.targetId,
    participantName: target.targetName,
    sessionId: target.sessionId,
    trigger: target.trigger,
    plannedDepth: target.plannedDepth,
    dispatchId: null,
    responseMessageId: null,
    branchStrategy: target.branchStrategy,
    handoffReason: target.handoffReason,
    mentionNames: [],
    sourceParticipant: null,
    sourceMessageId: null,
    error: null,
  };
}

function mapWorkflowTargetToExecutionRef(
  channel: ChatChannelView,
  target: RoomWorkflowTargetState,
): OrchestratorExecutionTargetRef {
  return {
    participantKind: target.participant.participantKind,
    participantId: target.participant.participantId,
    participantName: target.participant.participantName,
    sessionId: resolveParticipantSessionId(channel, target.participant),
    trigger: target.trigger,
    plannedDepth: target.depth,
    dispatchId: target.dispatchId,
    responseMessageId: target.responseMessageId,
    branchStrategy: target.branchStrategy,
    handoffReason: target.handoffReason,
    mentionNames: [...target.mentionNames],
    sourceParticipant: target.source,
    sourceMessageId: target.sourceMessageId,
    error: target.error,
  };
}

function buildApprovalGate(
  core: CatsCoreState,
  operatorSeams: OrchestratorOperatorSeams,
): OrchestratorApprovalGate {
  const task = core.tasks.find((candidate) => candidate.id === operatorSeams.taskId) ?? null;
  const status = mapApprovalStatus(task?.approval.status);
  const latestDecisionAction = task?.approval.decisionAction === 'approve'
    || task?.approval.decisionAction === 'reroute'
    || task?.approval.decisionAction === 'reject'
    ? task.approval.decisionAction
    : null;
  const requestAction = buildActionEnvelope(operatorSeams.approvalsPath, {
    taskId: operatorSeams.taskId,
    status: 'pending',
    requestedByActorId: task?.orchestratorActorId ?? 'actor-orchestrator-global',
  });

  return {
    taskId: operatorSeams.taskId,
    status,
    latestApprovalId: operatorSeams.latestApprovalId,
    latestDecisionAction,
    notes: task?.approval.notes ?? null,
    requestAvailable: status === 'not_requested',
    requestAction,
    decisionActions: [
      {
        kind: 'approve',
        label: 'Approve',
        disabled: status !== 'pending',
        action: buildActionEnvelope(operatorSeams.approvalsPath, {
          taskId: operatorSeams.taskId,
          status: 'approved',
          action: 'approve',
        }),
      },
      {
        kind: 'reroute',
        label: 'Reroute',
        disabled: status !== 'pending',
        action: buildActionEnvelope(operatorSeams.approvalsPath, {
          taskId: operatorSeams.taskId,
          status: 'rejected',
          action: 'reroute',
        }),
      },
      {
        kind: 'reject',
        label: 'Reject',
        disabled: status !== 'pending',
        action: buildActionEnvelope(operatorSeams.approvalsPath, {
          taskId: operatorSeams.taskId,
          status: 'rejected',
          action: 'reject',
        }),
      },
    ],
  };
}

function buildRecoveryLoop(
  runInspector: OrchestratorRunInspectorView | null,
  operatorSeams: OrchestratorOperatorSeams,
): OrchestratorRecoveryLoop {
  const incidentActions: OrchestratorOperatorActionContract[] = (
    runInspector?.incidentActions ?? []
  ).map((action) => ({
    kind: action.kind,
    label: action.label,
    disabled: action.disabled,
    statusLabel: action.statusLabel,
    action: buildActionEnvelope(operatorSeams.operatorActionsPath, {
      action: action.kind,
      taskId: action.taskId,
      runId: action.runId,
      checkpointId: action.checkpointId,
      outcomeId: action.outcomeId,
    }),
  }));

  return {
    guardReason: runInspector?.guardReason ?? null,
    cooldownLabel: runInspector?.cooldownLabel ?? null,
    incidentActions,
  };
}

function buildNextActions(input: {
  state: OrchestratorExecutionState;
  approval: OrchestratorApprovalGate;
  recovery: OrchestratorRecoveryLoop;
  canDispatch: boolean;
  dispatchAction: OrchestratorActionEnvelope | null;
  dispatchLabel?: string;
}): OrchestratorNextAction[] {
  if (input.approval.status === 'pending') {
    return input.approval.decisionActions
      .filter((action) => !action.disabled)
      .map((action) => ({
        kind: action.kind,
        label: action.label,
        blocking: true,
        action: action.action,
      }));
  }

  const recoveryActions = input.recovery.incidentActions
    .filter((action) => !action.disabled)
    .map((action) => ({
      kind: action.kind,
      label: action.label,
      blocking: false,
      action: action.action,
    } satisfies OrchestratorNextAction));

  if (input.state === 'completed') {
    return [
      {
        kind: 'complete',
        label: 'Execution complete',
        blocking: false,
        action: null,
      },
    ];
  }

  if ((input.state === 'blocked' || input.state === 'failed') && recoveryActions.length > 0) {
    return recoveryActions;
  }

  if (input.state === 'running') {
    return [
      {
        kind: 'wait',
        label: 'Execution in progress',
        blocking: false,
        action: null,
      },
      ...recoveryActions,
    ];
  }

  if (input.canDispatch && input.dispatchAction) {
    return [
      {
        kind: 'dispatch',
        label: input.dispatchLabel ?? 'Dispatch plan',
        blocking: false,
        action: input.dispatchAction,
      },
      ...recoveryActions,
    ];
  }

  return recoveryActions;
}

function resolveApprovalStep(
  approval: OrchestratorApprovalGate,
): OrchestratorExecutionStep | null {
  if (
    approval.status !== 'pending'
    && approval.status !== 'approved'
    && approval.status !== 'rejected'
  ) {
    return null;
  }

  return {
    id: `approval-gate-${approval.taskId}`,
    phase: 'approval',
    kind: 'approval_gate',
    status: approval.status === 'pending'
      ? 'blocked'
      : approval.status === 'approved'
        ? 'completed'
        : 'failed',
    title: 'Owner approval gate',
    summary: approval.status === 'pending'
      ? 'Dispatch is waiting for an owner decision.'
      : approval.status === 'approved'
        ? 'Owner approved the current orchestrator plan.'
        : approval.latestDecisionAction === 'reroute'
          ? 'Owner requested a reroute before the next dispatch.'
          : 'Owner rejected the previous orchestrator plan.',
    stageId: 'owner_approval',
    workflowShape: null,
    parentStepId: null,
    participant: null,
    targets: [],
    checkpointId: null,
    outcomeId: null,
    startedAt: null,
    completedAt: null,
    retryable: false,
  };
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

function resolveWorkflowTurn(
  channel: ChatChannelView,
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
  channel: ChatChannelView,
): OrchestratorExecutionStep {
  return {
    id: `dispatch-group-${turn.id}`,
    phase: 'dispatch',
    kind: turn.workflowShape === 'parallel' ? 'parallel_fan_out' : 'dispatch_group',
    status: mapStepStatusFromWorkflow(turn.status),
    title: turn.workflowShape === 'parallel'
      ? 'Parallel room execution'
      : 'Room execution stage',
    summary: turn.workflowShape === 'parallel'
      ? `This turn fanned out to ${turn.targetStatuses.length} parallel branch(es).`
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
  channel: ChatChannelView,
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
  channel: ChatChannelView,
  event: RoomWorkflowEvent,
): OrchestratorExecutionStep | null {
  const workflowShape = (
    event.metadata.workflowShape === 'parallel'
    || event.metadata.workflowShape === 'sequential'
    || event.metadata.workflowShape === 'converge'
  )
    ? event.metadata.workflowShape
    : turn.workflowShape;
  const stageId = typeof event.metadata.workflowStageId === 'string'
    ? event.metadata.workflowStageId
    : turn.stageId;
  const eventTargets = event.targets.map((target) => ({
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
    sessionId: resolveParticipantSessionId(channel, target),
    trigger: null,
    plannedDepth: 0,
    dispatchId: event.dispatchId,
    responseMessageId: null,
    branchStrategy: null,
    handoffReason: null,
    mentionNames: [],
    sourceParticipant: event.actor,
    sourceMessageId: event.sourceMessageId,
    error: null,
  } satisfies OrchestratorExecutionTargetRef));

  let kind: OrchestratorExecutionStepKind | null = null;
  let phase: OrchestratorExecutionStep['phase'] = 'execute';
  let retryable = false;

  if (event.kind === 'fan_out') {
    kind = 'parallel_fan_out';
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
    title: kind === 'parallel_fan_out'
      ? 'Parallel fan-out'
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
  channel: ChatChannelView;
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

export function buildOrchestratorRuntimeToolPlane(): OrchestratorRuntimeToolPlane {
  return buildRuntimeToolPlane();
}
