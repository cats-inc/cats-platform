import type {
  CoreApprovalDecisionAction,
  CoreApprovalRecord,
  CoreApprovalStatus,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectiveBudgetPolicy,
  CoreEffectiveDeliveryPolicy,
  CoreEffectivePolicySource,
  CoreGovernanceSummary,
  CoreOperatorActionKind,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreRunStatus,
  CoreRuntimeDeliveryAction,
  CoreRuntimeDeliveryManifestSummary,
  CoreTaskRecord,
  CoreWorkflowBranchStatusCounts,
  CoreWorkflowSummary,
} from './types.js';

const CORE_DELIVERY_MODES = new Set<string>([
  'artifact_only',
  'commit_only',
  'push_branch',
  'pr_with_checks',
  'deploy_preview',
]);

const CORE_DELIVERY_GATES = new Set<string>([
  'manual_review_required',
  'owner_approval_required',
  'publish_artifact_required',
]);

const CORE_EFFECTIVE_POLICY_SOURCES = new Set<string>([
  'chat_default',
  'task_override',
  'room_tightening',
  'approved_exception',
]);

const CORE_BUDGET_ALERT_LEVELS = new Set<string>([
  'normal',
  'warning',
  'blocked',
]);

const CORE_BUDGET_ALERT_SOURCES = new Set<string>([
  'runtime_usage',
  'rate_limit_incident',
  'guardrail_state',
]);

const CORE_OPERATOR_ACTIONS = new Set<string>([
  'retry',
  'acknowledge',
]);

const CORE_RUNTIME_DELIVERY_ACTIONS = new Set<string>([
  'prepare_artifact',
  'create_commit',
  'push_branch',
  'open_pull_request',
  'wait_for_checks',
  'publish_preview',
]);

const CORE_RUN_STATUSES = new Set<string>([
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);

const CORE_APPROVAL_STATUSES = new Set<string>([
  'not_requested',
  'pending',
  'approved',
  'rejected',
]);

const CORE_APPROVAL_DECISION_ACTIONS = new Set<string>([
  'approve',
  'reroute',
  'reject',
]);

const CORE_WORKFLOW_TARGET_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
  'cancelled',
  'waiting_for_converge',
] as const satisfies ReadonlyArray<keyof CoreWorkflowBranchStatusCounts>;

type WorkflowBranchStatus = typeof CORE_WORKFLOW_TARGET_STATUSES[number];

interface WorkflowSummaryInput {
  runStatus: CoreRunStatus | null;
  stageId: string | null;
  shape: string | null;
  reviewRequired: boolean;
  lastCheckpointId: string | null;
  convergeTargetId: string | null;
  continuationCount: number | null;
  dispatchCount: number | null;
  targetCount: number | null;
  branchStates?: Array<{ status?: string | null }>;
}

interface RuntimeDeliveryManifestInput {
  deliveryMode: CoreDeliveryMode;
  deliveryGates: CoreDeliveryGate[];
  channelId: string | null;
  containerId: string | null;
  conversationId: string | null;
  taskId: string | null;
  roomMode: string | null;
  transport: string | null;
  workflowStageId: string | null;
  workflowShape: string | null;
}

function asRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readEnum<T extends string>(value: unknown, allowed: ReadonlySet<string>): T | null {
  const normalized = readString(value);
  return normalized && allowed.has(normalized) ? normalized as T : null;
}

function readOperatorAction(metadata: CoreRecordMetadata | null): CoreGovernanceSummary['latestOperatorAction'] {
  if (!metadata) {
    return null;
  }

  const kind = readEnum<CoreOperatorActionKind>(metadata.operatorLastAction, CORE_OPERATOR_ACTIONS);
  const at = readString(metadata.operatorLastActionAt);
  const by = readString(metadata.operatorLastActionBy);
  const notes = readString(metadata.operatorLastActionNotes);
  return kind || at || by || notes
    ? {
        kind,
        at,
        by,
        notes,
      }
    : null;
}

function branchStatusCounts(
  branchStates: Array<{ status?: string | null }> | undefined,
): CoreWorkflowBranchStatusCounts {
  const counts: CoreWorkflowBranchStatusCounts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    waiting_for_converge: 0,
  };

  for (const branch of branchStates ?? []) {
    const status = readString(branch.status) as WorkflowBranchStatus | null;
    if (status && CORE_WORKFLOW_TARGET_STATUSES.includes(status)) {
      counts[status] += 1;
    }
  }

  return counts;
}

function deliveryActionsForMode(mode: CoreDeliveryMode): CoreRuntimeDeliveryAction[] {
  switch (mode) {
    case 'commit_only':
      return ['create_commit'];
    case 'push_branch':
      return ['create_commit', 'push_branch'];
    case 'pr_with_checks':
      return ['create_commit', 'push_branch', 'open_pull_request', 'wait_for_checks'];
    case 'deploy_preview':
      return ['create_commit', 'push_branch', 'publish_preview'];
    case 'artifact_only':
    default:
      return ['prepare_artifact'];
  }
}

export function buildCoreWorkflowSummary(
  input: WorkflowSummaryInput,
): CoreWorkflowSummary {
  return {
    runStatus: input.runStatus,
    stageId: input.stageId,
    shape: input.shape,
    reviewRequired: input.reviewRequired,
    lastCheckpointId: input.lastCheckpointId,
    convergeTargetId: input.convergeTargetId,
    continuationCount: input.continuationCount,
    dispatchCount: input.dispatchCount,
    targetCount: input.targetCount,
    branchStatusCounts: branchStatusCounts(input.branchStates),
  };
}

export function buildRuntimeDeliveryManifestSummary(
  input: RuntimeDeliveryManifestInput,
): CoreRuntimeDeliveryManifestSummary {
  return {
    requestedActions: deliveryActionsForMode(input.deliveryMode),
    gates: [...input.deliveryGates],
    context: {
      channelId: input.channelId,
      containerId: input.containerId,
      conversationId: input.conversationId,
      taskId: input.taskId,
      roomMode: input.roomMode,
      transport: input.transport,
      workflowStageId: input.workflowStageId,
      workflowShape: input.workflowShape,
    },
    strict:
      input.deliveryGates.length > 0
      || input.deliveryMode === 'pr_with_checks'
      || input.deliveryMode === 'deploy_preview',
  };
}

export function buildCoreGovernanceSummary(input: {
  approval: CoreApprovalRecord | null;
  delivery: CoreEffectiveDeliveryPolicy | null;
  budget: CoreEffectiveBudgetPolicy | null;
  runtimeDeliveryManifest: CoreRuntimeDeliveryManifestSummary | null;
  operatorMetadata?: CoreRecordMetadata | null;
}): CoreGovernanceSummary {
  return {
    delivery: input.delivery,
    budget: input.budget,
    runtimeDeliveryManifest: input.runtimeDeliveryManifest,
    approval: {
      status: input.approval?.status ?? null,
      requiresOwnerDecision:
        input.approval?.status === 'pending'
        || Boolean(input.delivery?.gates.includes('owner_approval_required')),
      pending: input.approval?.status === 'pending',
      latestDecisionAction: input.approval?.decisionAction ?? null,
      notes: input.approval?.notes ?? null,
    },
    latestOperatorAction: readOperatorAction(input.operatorMetadata ?? null),
  };
}

export function readCoreEffectiveDeliveryPolicy(
  metadata: CoreRecordMetadata | null | undefined,
): CoreEffectiveDeliveryPolicy | null {
  const summary = asRecord(metadata?.effectiveDeliveryPolicy);
  if (summary) {
    const mode = readEnum<CoreDeliveryMode>(summary.mode, CORE_DELIVERY_MODES);
    const source = readEnum<CoreEffectivePolicySource>(summary.source, CORE_EFFECTIVE_POLICY_SOURCES);
    if (mode && source) {
      return {
        mode,
        gates: readStringArray(summary.gates).filter((gate): gate is CoreDeliveryGate =>
          CORE_DELIVERY_GATES.has(gate),
        ),
        source,
        rationale: readString(summary.rationale),
      };
    }
  }

  const mode = readEnum<CoreDeliveryMode>(metadata?.effectiveDeliveryMode, CORE_DELIVERY_MODES);
  const source = readEnum<CoreEffectivePolicySource>(
    metadata?.effectiveDeliverySource,
    CORE_EFFECTIVE_POLICY_SOURCES,
  );
  if (!mode || !source) {
    return null;
  }

  return {
    mode,
    gates: readStringArray(metadata?.effectiveDeliveryGates).filter((gate): gate is CoreDeliveryGate =>
      CORE_DELIVERY_GATES.has(gate),
    ),
    source,
    rationale: readString(metadata?.effectiveDeliveryRationale),
  };
}

export function readCoreEffectiveBudgetPolicy(
  metadata: CoreRecordMetadata | null | undefined,
): CoreEffectiveBudgetPolicy | null {
  const summary = asRecord(metadata?.effectiveBudgetPolicy);
  if (summary) {
    const alertLevel = readEnum<CoreBudgetAlertLevel>(summary.alertLevel, CORE_BUDGET_ALERT_LEVELS);
    if (alertLevel) {
      return {
        alertLevel,
        source: readEnum<CoreBudgetAlertSource>(summary.source, CORE_BUDGET_ALERT_SOURCES),
        rationale: readString(summary.rationale),
      };
    }
  }

  const alertLevel = readEnum<CoreBudgetAlertLevel>(
    metadata?.effectiveBudgetAlertLevel,
    CORE_BUDGET_ALERT_LEVELS,
  );
  if (!alertLevel) {
    return null;
  }

  return {
    alertLevel,
    source: readEnum<CoreBudgetAlertSource>(
      metadata?.effectiveBudgetAlertSource,
      CORE_BUDGET_ALERT_SOURCES,
    ),
    rationale: readString(metadata?.effectiveBudgetRationale),
  };
}

export function readCoreRuntimeDeliveryManifestSummary(
  metadata: CoreRecordMetadata | null | undefined,
): CoreRuntimeDeliveryManifestSummary | null {
  const summary = asRecord(metadata?.runtimeDeliveryManifest);
  if (!summary) {
    return null;
  }

  return {
    requestedActions: readStringArray(summary.requestedActions).filter(
      (action): action is CoreRuntimeDeliveryAction => CORE_RUNTIME_DELIVERY_ACTIONS.has(action),
    ),
    gates: readStringArray(summary.gates).filter((gate): gate is CoreDeliveryGate =>
      CORE_DELIVERY_GATES.has(gate),
    ),
    context: {
      channelId: readString(asRecord(summary.context)?.channelId),
      containerId: readString(asRecord(summary.context)?.containerId),
      conversationId: readString(asRecord(summary.context)?.conversationId),
      taskId: readString(asRecord(summary.context)?.taskId),
      roomMode: readString(asRecord(summary.context)?.roomMode),
      transport: readString(asRecord(summary.context)?.transport),
      workflowStageId: readString(asRecord(summary.context)?.workflowStageId),
      workflowShape: readString(asRecord(summary.context)?.workflowShape),
    },
    strict: readBoolean(summary.strict),
  };
}

export function readCoreWorkflowSummary(
  metadata: CoreRecordMetadata | null | undefined,
  fallbackRunStatus: CoreRunStatus | null = null,
): CoreWorkflowSummary | null {
  const summary = asRecord(metadata?.workflowSummary);
  if (summary) {
    return {
      runStatus: readEnum<CoreRunStatus>(summary.runStatus, CORE_RUN_STATUSES) ?? fallbackRunStatus,
      stageId: readString(summary.stageId),
      shape: readString(summary.shape),
      reviewRequired: readBoolean(summary.reviewRequired),
      lastCheckpointId: readString(summary.lastCheckpointId),
      convergeTargetId: readString(summary.convergeTargetId),
      continuationCount: readNumber(summary.continuationCount),
      dispatchCount: readNumber(summary.dispatchCount),
      targetCount: readNumber(summary.targetCount),
      branchStatusCounts: {
        pending: readNumber(asRecord(summary.branchStatusCounts)?.pending) ?? 0,
        running: readNumber(asRecord(summary.branchStatusCounts)?.running) ?? 0,
        completed: readNumber(asRecord(summary.branchStatusCounts)?.completed) ?? 0,
        failed: readNumber(asRecord(summary.branchStatusCounts)?.failed) ?? 0,
        blocked: readNumber(asRecord(summary.branchStatusCounts)?.blocked) ?? 0,
        cancelled: readNumber(asRecord(summary.branchStatusCounts)?.cancelled) ?? 0,
        waiting_for_converge:
          readNumber(asRecord(summary.branchStatusCounts)?.waiting_for_converge) ?? 0,
      },
    };
  }

  const hasLegacyWorkflow =
    readString(metadata?.workflowStageId)
    || readString(metadata?.workflowShape)
    || readNumber(metadata?.dispatchCount) !== null
    || readNumber(metadata?.continuationCount) !== null
    || readNumber(metadata?.targetCount) !== null;
  if (!hasLegacyWorkflow && !fallbackRunStatus) {
    return null;
  }

  const branchStates = Array.isArray(metadata?.branchStates)
    ? metadata?.branchStates.map((item) => asRecord(item) ?? {})
    : [];
  return buildCoreWorkflowSummary({
    runStatus: fallbackRunStatus,
    stageId: readString(metadata?.workflowStageId),
    shape: readString(metadata?.workflowShape),
    reviewRequired: readBoolean(metadata?.workflowReviewRequired),
    lastCheckpointId: readString(metadata?.workflowLastCheckpointId),
    convergeTargetId: readString(metadata?.workflowConvergeTargetId),
    continuationCount: readNumber(metadata?.continuationCount),
    dispatchCount: readNumber(metadata?.dispatchCount),
    targetCount: readNumber(metadata?.targetCount),
    branchStates,
  });
}

export function readCoreGovernanceSummary(
  metadata: CoreRecordMetadata | null | undefined,
): CoreGovernanceSummary | null {
  const summary = asRecord(metadata?.governanceSummary);
  if (!summary) {
    return null;
  }

  const approvalSummary = asRecord(summary.approval);

  return {
    delivery: readCoreEffectiveDeliveryPolicy({
      effectiveDeliveryPolicy: summary.delivery,
    }),
    budget: readCoreEffectiveBudgetPolicy({
      effectiveBudgetPolicy: summary.budget,
    }),
    runtimeDeliveryManifest: readCoreRuntimeDeliveryManifestSummary({
      runtimeDeliveryManifest: summary.runtimeDeliveryManifest,
    }),
    approval: {
      status: readEnum<CoreApprovalStatus>(approvalSummary?.status, CORE_APPROVAL_STATUSES),
      requiresOwnerDecision: readBoolean(approvalSummary?.requiresOwnerDecision),
      pending: readBoolean(approvalSummary?.pending),
      latestDecisionAction: readEnum<CoreApprovalDecisionAction>(
        approvalSummary?.latestDecisionAction,
        CORE_APPROVAL_DECISION_ACTIONS,
      ),
      notes: readString(approvalSummary?.notes),
    },
    latestOperatorAction: (() => {
      const operator = asRecord(summary.latestOperatorAction);
      if (!operator) {
        return null;
      }

      return {
        kind: readEnum<CoreOperatorActionKind>(operator.kind, CORE_OPERATOR_ACTIONS),
        at: readString(operator.at),
        by: readString(operator.by),
        notes: readString(operator.notes),
      };
    })(),
  };
}

export function deriveCoreGovernanceSummary(
  task: CoreTaskRecord | null,
  operatorRecord?: Pick<CoreRunRecord, 'metadata'> | Pick<CoreTaskRecord, 'metadata'> | null,
): CoreGovernanceSummary | null {
  if (!task) {
    return null;
  }

  const embedded = readCoreGovernanceSummary(task.metadata);
  const operatorMetadata = operatorRecord?.metadata ?? task.metadata;
  if (embedded) {
    return {
      ...embedded,
      latestOperatorAction:
        readOperatorAction(operatorMetadata)
        ?? embedded.latestOperatorAction,
    };
  }

  const delivery = readCoreEffectiveDeliveryPolicy(task.metadata);
  const budget = readCoreEffectiveBudgetPolicy(task.metadata);
  const runtimeDeliveryManifest =
    readCoreRuntimeDeliveryManifestSummary(task.metadata)
    ?? (delivery
      ? buildRuntimeDeliveryManifestSummary({
          deliveryMode: delivery.mode,
          deliveryGates: delivery.gates,
          channelId: readString(task.metadata.channelId),
          containerId: readString(task.metadata.containerId),
          conversationId: task.conversationId,
          taskId: task.id,
          roomMode: readString(task.metadata.roomRoutingMode),
          transport: readString(task.metadata.transport),
          workflowStageId: readString(task.metadata.workflowStageId),
          workflowShape: readString(task.metadata.workflowShape),
        })
      : null);

  return buildCoreGovernanceSummary({
    approval: task.approval,
    delivery,
    budget,
    runtimeDeliveryManifest,
    operatorMetadata,
  });
}

export function deriveCoreWorkflowSummary(
  run: CoreRunRecord | null,
): CoreWorkflowSummary | null {
  if (!run) {
    return null;
  }

  return readCoreWorkflowSummary(run.metadata, run.status);
}
