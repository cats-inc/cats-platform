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

const RELAY_MODE_LABEL_KEYS: Record<string, MessageKey> = {
  build: messageKeys.codeRelayModeBuild,
  discover: messageKeys.codeRelayModeDiscover,
  document: messageKeys.codeRelayModeDocument,
  fit: messageKeys.codeRelayModeFit,
  human_verify: messageKeys.codeRelayModeHumanVerify,
  repair: messageKeys.codeRelayModeRepair,
  review: messageKeys.codeRelayModeReview,
  shape: messageKeys.codeRelayModeShape,
};

const RELAY_ROLE_LABEL_KEYS: Record<string, MessageKey> = {
  critic: messageKeys.codeRelayRoleCritic,
  drafter: messageKeys.codeRelayRoleDrafter,
  idle: messageKeys.codeRelayRoleIdle,
  main_coder: messageKeys.codeRelayRoleMainCoder,
  reviewer: messageKeys.codeRelayRoleReviewer,
  summarizer: messageKeys.codeRelayRoleSummarizer,
};

const DELIVERY_MODE_LABEL_KEYS: Record<string, MessageKey> = {
  artifact_only: messageKeys.codeExecutionDeliveryModeArtifactOnly,
  commit_only: messageKeys.codeExecutionDeliveryModeCommitOnly,
  deploy_preview: messageKeys.codeExecutionDeliveryModeDeployPreview,
  pr_with_checks: messageKeys.codeExecutionDeliveryModePrWithChecks,
  push_branch: messageKeys.codeExecutionDeliveryModePushBranch,
};

const TASK_STRATEGY_LABEL_KEYS: Record<string, MessageKey> = {
  pdca: messageKeys.codeExecutionStrategyPdca,
  react: messageKeys.codeExecutionStrategyReact,
  reflexion: messageKeys.codeExecutionStrategyReflexion,
};

const BLOCKED_REASON_LABEL_KEYS: Record<string, MessageKey> = {
  anti_ping_pong: messageKeys.codeExecutionBlockedReasonAntiPingPong,
  approval_pending: messageKeys.codeExecutionBlockedReasonApprovalPending,
  max_dispatches: messageKeys.codeExecutionBlockedReasonMaxDispatches,
  no_valid_targets: messageKeys.codeExecutionBlockedReasonNoValidTargets,
  startup_recovery: messageKeys.codeExecutionBlockedReasonStartupRecovery,
  user_cancelled: messageKeys.codeExecutionBlockedReasonUserCancelled,
};

const DELIVERY_DECISION_LABEL_KEYS: Record<string, MessageKey> = {
  approve: messageKeys.codeDeliveryDecisionApprove,
  complete: messageKeys.codeDeliveryDecisionComplete,
  reject: messageKeys.codeDeliveryDecisionReject,
  reroute: messageKeys.codeDeliveryDecisionReroute,
  wait: messageKeys.codeDeliveryDecisionWait,
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

function labelOptionalControlValue(
  value: string | null | undefined,
  t: CodeTranslator,
  labels: Record<string, MessageKey>,
): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const key = labels[normalized];
  return key ? t(key) : value!.trim();
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

export function labelCodeRelayModeForLocale(
  mode: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    mode,
    t,
    RELAY_MODE_LABEL_KEYS,
    messageKeys.codeRelayStatusUnknown,
  );
}

export function labelCodeRelayRoleForLocale(
  role: string,
  t: CodeTranslator,
): string {
  return labelStatus(
    role,
    t,
    RELAY_ROLE_LABEL_KEYS,
    messageKeys.codeRelayStatusUnknown,
  );
}

export function labelCodeDeliveryModeForLocale(
  mode: string | null | undefined,
  t: CodeTranslator,
): string | null {
  return labelOptionalControlValue(mode, t, DELIVERY_MODE_LABEL_KEYS);
}

export function labelCodeTaskStrategyForLocale(
  strategy: string | null | undefined,
  t: CodeTranslator,
): string | null {
  return labelOptionalControlValue(strategy, t, TASK_STRATEGY_LABEL_KEYS);
}

export function labelCodeBlockedReasonForLocale(
  reason: string | null | undefined,
  t: CodeTranslator,
): string | null {
  return labelOptionalControlValue(reason, t, BLOCKED_REASON_LABEL_KEYS);
}

export function labelCodeDeliveryDecisionForLocale(
  decision: string | null | undefined,
  t: CodeTranslator,
): string | null {
  return labelOptionalControlValue(decision, t, DELIVERY_DECISION_LABEL_KEYS);
}
