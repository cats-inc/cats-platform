import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type OperatorTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const OPERATOR_ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  'Request Retry': messageKeys.sharedOperatorActionRequestRetry,
  'Retry Again': messageKeys.sharedOperatorActionRetryAgain,
  Retrying: messageKeys.sharedOperatorActionRetrying,
  'Retry Requested': messageKeys.sharedOperatorActionRetryRequested,
  Acknowledge: messageKeys.sharedOperatorActionAcknowledge,
  Acknowledged: messageKeys.sharedOperatorActionAcknowledged,
};

const OPERATOR_ACTION_DESCRIPTION_KEYS: Record<string, MessageKey> = {
  'Retry failed. Operators can request another replay of the stored dispatch.':
    messageKeys.sharedOperatorActionRetryFailedDescription,
  'Record that the operator wants this blocked or failed run retried.':
    messageKeys.sharedOperatorActionRetryDescription,
  'Replay the stored dispatch or workflow continuation through the existing operator seam.':
    messageKeys.sharedOperatorActionReplayStoredDispatchDescription,
  'Record that the operator wants this blocked or failed task retried.':
    messageKeys.sharedOperatorActionRetryTaskDescription,
  'Record that the operator has seen the current guardrail or incident state.':
    messageKeys.sharedOperatorActionAcknowledgeDescription,
  'Record that the operator has seen the current blocked or failed state.':
    messageKeys.sharedOperatorActionAcknowledgeBlockedDescription,
};

const OPERATOR_ACTION_STATUS_KEYS: Record<string, MessageKey> = {
  'Retry in progress': messageKeys.sharedOperatorActionStatusRetryInProgress,
  'Retry failed': messageKeys.sharedOperatorActionStatusRetryFailed,
  'Retry dispatched': messageKeys.sharedOperatorActionStatusRetryDispatched,
  'Retry requested': messageKeys.sharedOperatorActionStatusRetryRequested,
  Acknowledged: messageKeys.sharedOperatorActionStatusAcknowledged,
};

const APPROVAL_ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  approve: messageKeys.sharedApprovalActionApprove,
  reroute: messageKeys.sharedApprovalActionReroute,
  reject: messageKeys.sharedApprovalActionReject,
};

const APPROVAL_ACTION_DESCRIPTION_KEYS: Record<string, MessageKey> = {
  approve: messageKeys.sharedApprovalActionApproveDescription,
  reroute: messageKeys.sharedApprovalActionRerouteDescription,
  reject: messageKeys.sharedApprovalActionRejectDescription,
};

export function resolveOperatorActionLabel(
  label: string,
  translate: OperatorTranslator,
): string {
  const key = OPERATOR_ACTION_LABEL_KEYS[label];
  return key ? translate(key) : label;
}

export function resolveOperatorActionDescription(
  description: string,
  translate: OperatorTranslator,
): string {
  const key = OPERATOR_ACTION_DESCRIPTION_KEYS[description];
  return key ? translate(key) : description;
}

export function resolveOperatorActionStatusLabel(
  statusLabel: string | null,
  translate: OperatorTranslator,
): string | null {
  if (!statusLabel) {
    return null;
  }

  const retryFailedPrefix = 'Retry failed: ';
  if (statusLabel.startsWith(retryFailedPrefix)) {
    return translate(messageKeys.sharedOperatorActionStatusRetryFailedWithError, {
      error: statusLabel.slice(retryFailedPrefix.length),
    });
  }

  const key = OPERATOR_ACTION_STATUS_KEYS[statusLabel];
  return key ? translate(key) : statusLabel;
}

export function resolveApprovalActionLabel(
  action: string,
  fallbackLabel: string,
  translate: OperatorTranslator,
): string {
  const key = APPROVAL_ACTION_LABEL_KEYS[action];
  return key ? translate(key) : fallbackLabel;
}

export function resolveApprovalActionDescription(
  action: string,
  fallbackDescription: string,
  translate: OperatorTranslator,
): string {
  const key = APPROVAL_ACTION_DESCRIPTION_KEYS[action];
  return key ? translate(key) : fallbackDescription;
}
