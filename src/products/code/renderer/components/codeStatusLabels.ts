import { messageKeys, type MessageKey } from '../../../../shared/i18n/index.js';
import type { useI18n } from '../../../../app/renderer/i18n/index.js';

type CodeTranslator = ReturnType<typeof useI18n>['t'];

const WORKSPACE_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  active: messageKeys.codeWorkspaceStatusActive,
  ready: messageKeys.codeWorkspaceStatusReady,
  draft: messageKeys.codeWorkspaceStatusDraft,
  archived: messageKeys.codeWorkspaceStatusArchived,
};

const ARTIFACT_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  draft: messageKeys.codeArtifactStatusDraft,
  ready: messageKeys.codeArtifactStatusReady,
  published: messageKeys.codeArtifactStatusPublished,
};

const RECORD_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  archived: messageKeys.codeRecordStatusArchived,
  blocked: messageKeys.codeRecordStatusBlocked,
  cancelled: messageKeys.codeRecordStatusCancelled,
  completed: messageKeys.codeRecordStatusCompleted,
  draft: messageKeys.codeRecordStatusDraft,
  failed: messageKeys.codeRecordStatusFailed,
  in_progress: messageKeys.codeRecordStatusInProgress,
  open: messageKeys.codeRecordStatusOpen,
  pending: messageKeys.codeRecordStatusPending,
  pending_approval: messageKeys.codeRecordStatusPendingApproval,
  ready: messageKeys.codeRecordStatusReady,
  running: messageKeys.codeRecordStatusRunning,
};

function labelStatus(
  status: string,
  t: CodeTranslator,
  labels: Record<string, MessageKey>,
  fallbackKey: MessageKey,
): string {
  const normalized = status.trim().toLowerCase();
  const key = labels[normalized];
  if (key) {
    return t(key);
  }
  return status.trim() || t(fallbackKey);
}

export function labelCodeWorkspaceStatusForLocale(
  status: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    status,
    t,
    WORKSPACE_STATUS_LABEL_KEYS,
    messageKeys.codeWorkspaceStatusUnknown,
  );
}

export function labelCodeArtifactStatusForLocale(
  status: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    status,
    t,
    ARTIFACT_STATUS_LABEL_KEYS,
    messageKeys.codeArtifactStatusUnknown,
  );
}

export function labelCodeRecordStatusForLocale(
  status: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    status,
    t,
    RECORD_STATUS_LABEL_KEYS,
    messageKeys.codeRecordStatusUnknown,
  );
}
