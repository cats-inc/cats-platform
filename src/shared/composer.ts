export interface ComposerKeyDecisionInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

export function normalizeComposerBusy(busy: string | null | undefined): string {
  return typeof busy === 'string' ? busy : '';
}

export const DRAFT_COMPOSER_BUSY_SCOPE = 'draft';

const MESSAGE_PREPARE_PREFIX = 'message:prepare';
const MESSAGE_ACK_PREFIX = 'message:ack';
const MESSAGE_SEND_PREFIX = 'message:send';
const MESSAGE_STOP_PREFIX = 'message:stop';

function hasScopedBusyPrefix(normalizedBusy: string, prefix: string): boolean {
  return normalizedBusy === prefix || normalizedBusy.startsWith(`${prefix}:`);
}

function readScopedBusyValue(normalizedBusy: string, prefix: string): string | null {
  if (!normalizedBusy.startsWith(`${prefix}:`)) {
    return null;
  }

  const scope = normalizedBusy.slice(prefix.length + 1).trim();
  return scope.length > 0 ? scope : null;
}

export function shouldSubmitComposerOnKeyDown(input: ComposerKeyDecisionInput): boolean {
  return (
    input.key === 'Enter' &&
    !input.shiftKey &&
    !input.ctrlKey &&
    !input.metaKey &&
    !input.altKey &&
    !input.isComposing
  );
}

export function isComposerBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    hasScopedBusyPrefix(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    || hasScopedBusyPrefix(normalizedBusy, MESSAGE_ACK_PREFIX)
    || normalizedBusy === 'parallelChat:ack'
    || hasScopedBusyPrefix(normalizedBusy, MESSAGE_SEND_PREFIX)
    || normalizedBusy === 'parallelChat:dispatch'
    || normalizedBusy === 'parallelChat:relay'
    || hasScopedBusyPrefix(normalizedBusy, MESSAGE_STOP_PREFIX)
    || normalizedBusy === 'parallelChat:stop'
  );
}

export function isComposerAckBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    hasScopedBusyPrefix(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    || hasScopedBusyPrefix(normalizedBusy, MESSAGE_ACK_PREFIX)
    || normalizedBusy === 'parallelChat:ack'
  );
}

export function isComposerDispatchBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return hasScopedBusyPrefix(normalizedBusy, MESSAGE_SEND_PREFIX)
    || normalizedBusy === 'parallelChat:dispatch';
}

export function isComposerStopBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return hasScopedBusyPrefix(normalizedBusy, MESSAGE_STOP_PREFIX)
    || normalizedBusy === 'parallelChat:stop';
}

export function isComposerSelectionBlocked(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    hasScopedBusyPrefix(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    || hasScopedBusyPrefix(normalizedBusy, MESSAGE_ACK_PREFIX)
    || normalizedBusy === 'parallelChat:ack'
    || hasScopedBusyPrefix(normalizedBusy, MESSAGE_STOP_PREFIX)
    || normalizedBusy === 'parallelChat:stop'
  );
}

export function getComposerBusyScope(busy: string | null | undefined): string | null {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    readScopedBusyValue(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    ?? readScopedBusyValue(normalizedBusy, MESSAGE_ACK_PREFIX)
    ?? readScopedBusyValue(normalizedBusy, MESSAGE_SEND_PREFIX)
    ?? readScopedBusyValue(normalizedBusy, MESSAGE_STOP_PREFIX)
  );
}

export function getComposerBusyChannelId(busy: string | null | undefined): string | null {
  const scope = getComposerBusyScope(busy);
  return scope && scope !== DRAFT_COMPOSER_BUSY_SCOPE ? scope : null;
}

export function getComposerDispatchChannelId(busy: string | null | undefined): string | null {
  const scope = readScopedBusyValue(normalizeComposerBusy(busy), MESSAGE_SEND_PREFIX);
  return scope && scope !== DRAFT_COMPOSER_BUSY_SCOPE ? scope : null;
}

function isComposerScopedBusy(
  normalizedBusy: string,
  prefix: string,
  scope: string | null | undefined,
): boolean {
  const normalizedScope = scope?.trim() || null;
  if (!normalizedScope) {
    return false;
  }

  return normalizedBusy === `${prefix}:${normalizedScope}`;
}

export function isComposerAckBusyForChannel(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return isComposerScopedBusy(normalizedBusy, MESSAGE_PREPARE_PREFIX, channelId)
    || isComposerScopedBusy(normalizedBusy, MESSAGE_ACK_PREFIX, channelId);
}

export function isComposerDispatchBusyForChannel(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return isComposerScopedBusy(normalizeComposerBusy(busy), MESSAGE_SEND_PREFIX, channelId);
}

export function isComposerStopBusyForChannel(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return isComposerScopedBusy(normalizeComposerBusy(busy), MESSAGE_STOP_PREFIX, channelId);
}

export function isComposerBusyForChannel(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return isComposerAckBusyForChannel(busy, channelId)
    || isComposerDispatchBusyForChannel(busy, channelId)
    || isComposerStopBusyForChannel(busy, channelId);
}

export function isComposerAckBusyForDraft(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return isComposerScopedBusy(normalizedBusy, MESSAGE_PREPARE_PREFIX, DRAFT_COMPOSER_BUSY_SCOPE)
    || isComposerScopedBusy(normalizedBusy, MESSAGE_ACK_PREFIX, DRAFT_COMPOSER_BUSY_SCOPE);
}

export function isComposerBusyForDraft(busy: string | null | undefined): boolean {
  return isComposerAckBusyForDraft(busy);
}

export function doesComposerSelectionBlockChannelRoute(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  if (!channelId || !isComposerSelectionBlocked(normalizedBusy)) {
    return false;
  }

  return getComposerBusyChannelId(normalizedBusy) === channelId;
}
