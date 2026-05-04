import { taskExecutionProductLabel } from '../../../core/taskHandoff.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type WorkPresentationI18n = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultWorkPresentationI18n = createTranslator('en');

const WORK_TOKEN_LABEL_KEYS: Record<string, MessageKey> = {
  acknowledge: messageKeys.workExecutionActionAcknowledge,
  approve: messageKeys.workExecutionActionApprove,
  artifact_only: messageKeys.workExecutionDeliveryModeArtifactOnly,
  commit_only: messageKeys.workExecutionDeliveryModeCommitOnly,
  complete: messageKeys.workExecutionActionComplete,
  create_commit: messageKeys.workExecutionActionCreateCommit,
  deploy_preview: messageKeys.workExecutionDeliveryModeDeployPreview,
  dispatch: messageKeys.workExecutionActionDispatch,
  open_pull_request: messageKeys.workExecutionActionOpenPullRequest,
  pdca: messageKeys.workExecutionStrategyPdca,
  plan_and_execute: messageKeys.workExecutionStrategyPlanAndExecute,
  pr_with_checks: messageKeys.workExecutionDeliveryModePrWithChecks,
  publish_preview: messageKeys.workExecutionActionPublishPreview,
  push_branch: messageKeys.workExecutionDeliveryModePushBranch,
  react: messageKeys.workExecutionStrategyReact,
  reflexion: messageKeys.workExecutionStrategyReflexion,
  reject: messageKeys.workExecutionActionReject,
  request_review: messageKeys.workExecutionActionRequestReview,
  retry: messageKeys.workExecutionActionRetry,
  reroute: messageKeys.workExecutionActionReroute,
  wait: messageKeys.workExecutionActionWait,
  wait_for_checks: messageKeys.workExecutionActionWaitForChecks,
};

function normalizeWorkToken(value: string): string {
  return value.trim().toLowerCase().replace(/-/gu, '_');
}

function formatWorkToken(
  value: string | null | undefined,
  fallback: string,
  t: WorkPresentationI18n,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const key = WORK_TOKEN_LABEL_KEYS[normalizeWorkToken(trimmed)];
  if (key) {
    return t(key);
  }

  return trimmed
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function formatWorkTokenList(
  values: readonly string[] | null | undefined,
  fallback: string,
): string;
export function formatWorkTokenList(
  values: readonly string[] | null | undefined,
  t?: WorkPresentationI18n,
  fallback?: string,
): string;
export function formatWorkTokenList(
  values: readonly string[] | null | undefined,
  t: WorkPresentationI18n | string = defaultWorkPresentationI18n,
  fallback?: string,
): string {
  const translate = typeof t === 'function' ? t : defaultWorkPresentationI18n;
  const resolvedFallback = typeof t === 'string'
    ? t
    : fallback ?? translate(messageKeys.workWarRoomMetaValueNone);
  const formatted = (values ?? [])
    .map((value) => formatWorkToken(value, '', translate))
    .filter((value) => value.length > 0);
  return formatted.length > 0 ? formatted.join(', ') : resolvedFallback;
}

export function formatWorkExecutionProduct(
  product: string | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  if (!product?.trim()) {
    return t(messageKeys.workWarRoomMetaValueUnassigned);
  }

  return product === 'chat' || product === 'work' || product === 'code'
    ? taskExecutionProductLabel(product)
    : formatWorkToken(product, product, t);
}

export function formatWorkExecutionStrategy(
  strategy: string | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  return formatWorkToken(strategy, t(messageKeys.workWarRoomMetaValueNotSpecified), t);
}

export function formatWorkDeliveryMode(
  mode: string | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  return formatWorkToken(mode, t(messageKeys.workWarRoomMetaValueNotSpecified), t);
}

export function formatWorkRuntimeBridgeProduct(
  product: string | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  return product?.trim()
    ? formatWorkExecutionProduct(product, t)
    : t(messageKeys.workWarRoomMetaValueNoRuntimeBridge);
}

export function formatWorkCorrelation(
  input: {
    product?: string | null;
    workItemId?: string | null;
    conversationId?: string | null;
  } | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  const parts = [
    input?.product ? formatWorkExecutionProduct(input.product, t) : null,
    input?.workItemId?.trim() || null,
    input?.conversationId?.trim() || null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(' | ') : t(messageKeys.workWarRoomMetaValueNotRecorded);
}
