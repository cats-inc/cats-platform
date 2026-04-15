import type {
  RoomRoutingCheckpointKind,
  RoomRoutingParticipantRef,
  RoomWorkflowTargetState,
  RoomWorkflowTargetStatus,
  RoomWorkflowStatus,
} from '../../../shared/roomRouting.js';
import type { CatsCoreState } from '../../../core/types.js';
import type {
  OrchestratorActionEnvelope,
  OrchestratorApprovalGate,
  OrchestratorChannelView,
  OrchestratorDispatchTargetPlan,
  OrchestratorExecutionState,
  OrchestratorExecutionStep,
  OrchestratorExecutionStepStatus,
  OrchestratorExecutionTargetRef,
  OrchestratorNextAction,
  OrchestratorOperatorActionContract,
  OrchestratorOperatorSeams,
  OrchestratorRecoveryLoop,
  OrchestratorRunInspectorView,
  OrchestratorRuntimeToolPlane,
} from '../contracts.js';
import {
  ORCHESTRATOR_RUNTIME_TOOL_SCHEMA_VERSION,
} from '../contracts.js';
import { ORCHESTRATOR_RUNTIME_MCP_TOOLS } from '../toolIntent.js';

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

export function mapStepStatusFromTarget(
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

export function mapStepStatusFromWorkflow(
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

export function mapExecutionState(
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

export function readCheckpointKind(value: unknown): RoomRoutingCheckpointKind | null {
  return typeof value === 'string' && CHECKPOINT_KINDS.has(value as RoomRoutingCheckpointKind)
    ? value as RoomRoutingCheckpointKind
    : null;
}

export function buildActionEnvelope(
  path: string,
  body: Record<string, unknown>,
): OrchestratorActionEnvelope {
  return {
    method: 'POST',
    path,
    body,
  };
}

export function buildRuntimeToolPlane(): OrchestratorRuntimeToolPlane {
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

export function resolveParticipantExecutionLease(
  channel: OrchestratorChannelView,
  participant: RoomRoutingParticipantRef | null,
): OrchestratorChannelView['orchestratorLease'] | null {
  if (!participant) {
    return null;
  }

  if (participant.participantKind === 'orchestrator') {
    return channel.orchestratorLease;
  }

  return channel.assignedCats.find((cat) => cat.catId === participant.participantId)
    ?.execution.lease ?? null;
}

export function mapTargetPlanToExecutionRef(
  target: OrchestratorDispatchTargetPlan,
): OrchestratorExecutionTargetRef {
  return {
    participantKind: target.targetKind,
    participantId: target.targetId,
    participantName: target.targetName,
    laneId: target.laneId,
    sessionId: target.sessionId,
    trigger: target.trigger,
    plannedDepth: target.plannedDepth,
    dispatchId: null,
    response: null,
    branchStrategy: target.branchStrategy,
    handoffReason: target.handoffReason,
    mentionNames: [],
    sourceParticipant: null,
    sourceMessageId: null,
    error: null,
  };
}

export function mapWorkflowTargetToExecutionRef(
  channel: OrchestratorChannelView,
  target: RoomWorkflowTargetState,
): OrchestratorExecutionTargetRef {
  const lease = resolveParticipantExecutionLease(channel, target.participant);
  return {
    participantKind: target.participant.participantKind,
    participantId: target.participant.participantId,
    participantName: target.participant.participantName,
    laneId: lease?.laneId ?? null,
    sessionId: lease?.sessionId ?? null,
    trigger: target.trigger,
    plannedDepth: target.depth,
    dispatchId: target.dispatchId,
    response: target.response,
    branchStrategy: target.branchStrategy,
    handoffReason: target.handoffReason,
    mentionNames: [...target.mentionNames],
    sourceParticipant: target.source,
    sourceMessageId: target.sourceMessageId,
    error: target.error,
  };
}

export function buildApprovalGate(
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

export function buildRecoveryLoop(
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

export function buildNextActions(input: {
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

export function resolveApprovalStep(
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
