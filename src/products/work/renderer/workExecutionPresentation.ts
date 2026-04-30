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

function formatWorkToken(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function formatWorkTokenList(
  values: readonly string[] | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
  fallback?: string,
): string {
  const resolvedFallback = fallback ?? t(messageKeys.workWarRoomMetaValueNone);
  const formatted = (values ?? [])
    .map((value) => formatWorkToken(value, ''))
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
    : formatWorkToken(product, product);
}

export function formatWorkExecutionStrategy(
  strategy: string | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  return formatWorkToken(strategy, t(messageKeys.workWarRoomMetaValueNotSpecified));
}

export function formatWorkDeliveryMode(
  mode: string | null | undefined,
  t: WorkPresentationI18n = defaultWorkPresentationI18n,
): string {
  return formatWorkToken(mode, t(messageKeys.workWarRoomMetaValueNotSpecified));
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
