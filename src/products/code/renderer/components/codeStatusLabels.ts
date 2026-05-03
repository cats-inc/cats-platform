import { messageKeys, type MessageKey } from '../../../../shared/i18n/index.js';
import type { useI18n } from '../../../../app/renderer/i18n/index.js';

type CodeTranslator = ReturnType<typeof useI18n>['t'];

const WORKSPACE_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  active: messageKeys.codeWorkspaceStatusActive,
  ready: messageKeys.codeWorkspaceStatusReady,
  draft: messageKeys.codeWorkspaceStatusDraft,
  archived: messageKeys.codeWorkspaceStatusArchived,
};

const ARTIFACT_KIND_LABEL_KEYS: Record<string, MessageKey> = {
  attachment: messageKeys.codeArtifactKindAttachmentLabel,
  build: messageKeys.codeArtifactKindBuildLabel,
  dataset: messageKeys.codeArtifactDatasetLabel,
  document: messageKeys.codeArtifactKindDocumentLabel,
  preview: messageKeys.codeArtifactKindPreviewLabel,
  report: messageKeys.codeArtifactKindReportLabel,
  transcript_export: messageKeys.codeArtifactKindTranscriptLabel,
};

const ARTIFACT_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  draft: messageKeys.codeArtifactStatusDraft,
  ready: messageKeys.codeArtifactStatusReady,
  published: messageKeys.codeArtifactStatusPublished,
};

const CONVERSATION_KIND_LABEL_KEYS: Record<string, MessageKey> = {
  chat_channel: messageKeys.codeConversationKindChatChannel,
  chat_root: messageKeys.codeConversationKindChatRoot,
  code_thread: messageKeys.codeConversationKindCodeThread,
  direct_message: messageKeys.codeConversationKindDirectMessage,
  parallel_group: messageKeys.codeConversationKindParallelGroup,
  work_thread: messageKeys.codeConversationKindWorkThread,
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

export function labelCodeArtifactKindForLocale(
  kind: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    kind,
    t,
    ARTIFACT_KIND_LABEL_KEYS,
    messageKeys.codeArtifactKindUnknownLabel,
  );
}

export function labelCodeConversationKindForLocale(
  kind: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    kind,
    t,
    CONVERSATION_KIND_LABEL_KEYS,
    messageKeys.codeConversationKindUnknown,
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
