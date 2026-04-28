import type {
  RunLoopApprovalRecord,
  RunLoopDecisionConfidence,
  RunLoopPlanRecord,
  RunLoopToolRequestRecord,
  ToolBoundaryEvidenceEvent,
} from '../supervision/index.js';
import type {
  ProviderAgentSemanticPlanDecision,
  ProviderAgentSemanticPlanStep,
} from './providerAgentDecision.js';

export interface ProviderAgentPlanRecordStepInput {
  stepId: string;
  action: ProviderAgentSemanticPlanStep['action'];
  toolName?: string;
  requiresApproval?: boolean;
}

export interface CreateProviderAgentRunLoopPlanRecordInput {
  planId: string;
  decisionId: string;
  actionId: string;
  confidence: RunLoopDecisionConfidence;
  recordedAt: string;
  steps: ProviderAgentPlanRecordStepInput[];
}

export function createProviderAgentRunLoopPlanRecord(
  input: CreateProviderAgentRunLoopPlanRecordInput,
): RunLoopPlanRecord {
  return {
    planId: input.planId,
    decisionId: input.decisionId,
    actionId: input.actionId,
    confidence: input.confidence,
    recordedAt: input.recordedAt,
    stepCount: input.steps.length,
    executableStepCount: input.steps.filter((step) =>
      step.action === 'call_tool' || step.action === 'delegate_run').length,
    toolNames: uniqueSortedStrings(
      input.steps
        .map((step) => step.toolName)
        .filter((toolName): toolName is string => Boolean(toolName?.trim())),
    ),
    approvalStepIds: input.steps
      .filter((step) => step.requiresApproval || step.action === 'request_approval')
      .map((step) => step.stepId)
      .sort(),
  };
}

export function createProviderAgentRunLoopPlanRecordFromDecision(input: {
  decision: ProviderAgentSemanticPlanDecision;
  actionId: string;
  recordedAt: string;
}): RunLoopPlanRecord {
  return createProviderAgentRunLoopPlanRecord({
    planId: input.decision.planId,
    decisionId: input.decision.decisionId,
    actionId: input.actionId,
    confidence: input.decision.confidence,
    recordedAt: input.recordedAt,
    steps: input.decision.steps.map((step) => ({
      stepId: step.stepId,
      action: step.action,
      toolName: step.toolName,
      requiresApproval: step.action === 'request_approval',
    })),
  });
}

export function createRunLoopToolRequestRecordFromEvidence(
  event: ToolBoundaryEvidenceEvent,
): RunLoopToolRequestRecord {
  return {
    requestId: `${event.runId}:${event.actionId}`,
    actionId: event.actionId,
    toolName: event.toolName,
    status: event.status,
    recordedAt: event.occurredAt,
    ...(event.approvalRequestId ? { approvalRequestId: event.approvalRequestId } : {}),
    evidenceRef: event.eventId,
  };
}

export function createRunLoopApprovalRecordFromEvidence(
  event: ToolBoundaryEvidenceEvent,
): RunLoopApprovalRecord | null {
  if (!event.approvalRequestId) {
    return null;
  }

  return {
    approvalRequestId: event.approvalRequestId,
    actionId: event.actionId,
    toolName: event.toolName,
    state: event.status === 'pending_approval' ? 'pending' : 'denied',
    recordedAt: event.occurredAt,
    evidenceRef: event.eventId,
  };
}

function uniqueSortedStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
