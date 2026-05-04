import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';

type WorkTimelineTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultWorkTimelineTranslate = createTranslator('en');

const EXACT_TITLE_KEYS: Record<string, MessageKey> = {
  'Approval requested': messageKeys.workTimelineTitleApprovalRequested,
  'Approval decided': messageKeys.workTimelineTitleApprovalDecided,
  'Operator action': messageKeys.workTimelineTitleOperatorAction,
  'Artifact recorded': messageKeys.workTimelineTitleArtifactRecorded,
  'Checkpoint recorded': messageKeys.workTimelineTitleCheckpointRecorded,
  'Work item updated': messageKeys.workTimelineTitleWorkItemUpdated,
  'Status changed': messageKeys.workTimelineTitleStatusChanged,
  Note: messageKeys.workTimelineTitleNote,
};

function formatTraceKind(
  kind: string,
  t: WorkTimelineTranslate,
): string {
  switch (kind) {
    case 'approval':
      return t(messageKeys.sharedOperatorTraceKindApproval);
    case 'checkpoint':
      return t(messageKeys.sharedOperatorTraceKindCheckpoint);
    case 'dispatch':
      return t(messageKeys.sharedOperatorTraceKindDispatch);
    case 'error':
      return t(messageKeys.sharedOperatorTraceKindError);
    case 'outcome':
      return t(messageKeys.sharedOperatorTraceKindOutcome);
    case 'status':
      return t(messageKeys.sharedOperatorTraceKindStatus);
    case 'note':
      return t(messageKeys.sharedOperatorTraceKindNote);
    default:
      return kind;
  }
}

function formatEvidenceSource(
  source: string,
  t: WorkTimelineTranslate,
): string {
  switch (source) {
    case 'provider-agent run loop':
      return t(messageKeys.workTimelineEvidenceProviderAgentRunLoop);
    case 'supervision evidence':
      return t(messageKeys.workTimelineEvidenceSupervision);
    default:
      return source;
  }
}

export function presentWorkTimelineTitle(
  title: string,
  t: WorkTimelineTranslate = defaultWorkTimelineTranslate,
): string {
  const exactKey = EXACT_TITLE_KEYS[title];
  if (exactKey) {
    return t(exactKey);
  }

  const approvalBindingMatch = /^Approval binding \((.+)\)$/u.exec(title);
  if (approvalBindingMatch) {
    return t(messageKeys.workTimelineTitleApprovalBinding, {
      kind: approvalBindingMatch[1],
    });
  }

  const traceMatch = /^Trace \((.+)\)$/u.exec(title);
  if (traceMatch) {
    return t(messageKeys.workTimelineTitleTrace, {
      kind: formatTraceKind(traceMatch[1] ?? '', t),
    });
  }

  const checkpointMatch = /^Checkpoint: (.+)$/u.exec(title);
  if (checkpointMatch) {
    return t(messageKeys.workTimelineTitleCheckpoint, {
      label: checkpointMatch[1],
    });
  }

  const providerPlanMatch = /^Provider-agent plan: (.+)$/u.exec(title);
  if (providerPlanMatch) {
    return t(messageKeys.workTimelineTitleProviderAgentPlan, {
      planId: providerPlanMatch[1],
    });
  }

  const evidenceMatch = /^Evidence: (.+)$/u.exec(title);
  if (evidenceMatch) {
    return t(messageKeys.workTimelineTitleEvidence, {
      source: formatEvidenceSource(evidenceMatch[1] ?? '', t),
    });
  }

  return title;
}
