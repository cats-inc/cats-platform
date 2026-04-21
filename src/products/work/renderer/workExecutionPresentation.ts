import { taskExecutionProductLabel } from '../../../core/taskHandoff.js';

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
  fallback = 'None',
): string {
  const formatted = (values ?? [])
    .map((value) => formatWorkToken(value, ''))
    .filter((value) => value.length > 0);
  return formatted.length > 0 ? formatted.join(', ') : fallback;
}

export function formatWorkExecutionProduct(product: string | null | undefined): string {
  if (!product?.trim()) {
    return 'Unassigned';
  }

  return product === 'chat' || product === 'work' || product === 'code'
    ? taskExecutionProductLabel(product)
    : formatWorkToken(product, product);
}

export function formatWorkExecutionStrategy(strategy: string | null | undefined): string {
  return formatWorkToken(strategy, 'Not specified');
}

export function formatWorkDeliveryMode(mode: string | null | undefined): string {
  return formatWorkToken(mode, 'Not specified');
}

export function formatWorkRuntimeBridgeProduct(product: string | null | undefined): string {
  return product?.trim() ? formatWorkExecutionProduct(product) : 'No runtime bridge';
}

export function formatWorkCorrelation(input: {
  product?: string | null;
  workItemId?: string | null;
  conversationId?: string | null;
} | null | undefined): string {
  const parts = [
    input?.product ? formatWorkExecutionProduct(input.product) : null,
    input?.workItemId?.trim() || null,
    input?.conversationId?.trim() || null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(' | ') : 'Not recorded';
}
