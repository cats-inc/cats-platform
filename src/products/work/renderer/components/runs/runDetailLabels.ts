import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from "../../../../../shared/i18n/index.js";

type WorkRunDetailTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const TRACE_KIND_LABEL_KEYS: Record<string, MessageKey> = {
  approval: messageKeys.sharedOperatorTraceKindApproval,
  checkpoint: messageKeys.sharedOperatorTraceKindCheckpoint,
  dispatch: messageKeys.sharedOperatorTraceKindDispatch,
  error: messageKeys.sharedOperatorTraceKindError,
  outcome: messageKeys.sharedOperatorTraceKindOutcome,
  status: messageKeys.sharedOperatorTraceKindStatus,
  note: messageKeys.sharedOperatorTraceKindNote,
};

const OUTCOME_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  succeeded: messageKeys.sharedOperatorOutcomeStatusSucceeded,
  blocked: messageKeys.sharedOperatorOutcomeStatusBlocked,
  failed: messageKeys.sharedOperatorOutcomeStatusFailed,
  cancelled: messageKeys.sharedOperatorOutcomeStatusCancelled,
};

const ARTIFACT_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  draft: messageKeys.workRunArtifactStatusDraft,
  ready: messageKeys.workRunArtifactStatusReady,
  published: messageKeys.workRunArtifactStatusPublished,
  archived: messageKeys.workRunArtifactStatusArchived,
};

function formatUnknownToken(token: string): string {
  return token
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

export function formatRunTraceKindLabel(
  kind: string,
  t: WorkRunDetailTranslate,
): string {
  const key = TRACE_KIND_LABEL_KEYS[kind];
  return key
    ? t(key)
    : t(messageKeys.workRunTraceKindUnknown, {
        kind: formatUnknownToken(kind),
      });
}

export function formatRunOutcomeStatusLabel(
  status: string,
  t: WorkRunDetailTranslate,
): string {
  const key = OUTCOME_STATUS_LABEL_KEYS[status];
  return key
    ? t(key)
    : t(messageKeys.workObjectStatusUnknown, {
        status: formatUnknownToken(status),
      });
}

export function formatRunArtifactStatusLabel(
  status: string,
  t: WorkRunDetailTranslate,
): string {
  const key = ARTIFACT_STATUS_LABEL_KEYS[status];
  return key
    ? t(key)
    : t(messageKeys.workObjectStatusUnknown, {
        status: formatUnknownToken(status),
      });
}
