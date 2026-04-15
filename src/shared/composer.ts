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
const MESSAGE_ACK_PREFIX = 'message:ack:';
const MESSAGE_SEND_PREFIX = 'message:send:';
const MESSAGE_STOP_PREFIX = 'message:stop:';

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
    || normalizedBusy.startsWith(MESSAGE_ACK_PREFIX)
    || normalizedBusy === 'parallelChat:ack'
    || normalizedBusy.startsWith(MESSAGE_SEND_PREFIX)
    || normalizedBusy === 'parallelChat:dispatch'
    || normalizedBusy === 'parallelChat:relay'
    || normalizedBusy.startsWith(MESSAGE_STOP_PREFIX)
    || normalizedBusy === 'parallelChat:stop'
  );
}

export function isComposerAckBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    hasScopedBusyPrefix(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    || normalizedBusy.startsWith(MESSAGE_ACK_PREFIX)
    || normalizedBusy === 'parallelChat:ack'
  );
}

export function isComposerDispatchBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return normalizedBusy.startsWith('message:send') || normalizedBusy === 'parallelChat:dispatch';
}

export function isComposerStopBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return normalizedBusy.startsWith(MESSAGE_STOP_PREFIX) || normalizedBusy === 'parallelChat:stop';
}

export function isComposerSelectionBlocked(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    hasScopedBusyPrefix(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    || normalizedBusy.startsWith(MESSAGE_ACK_PREFIX)
    || normalizedBusy === 'parallelChat:ack'
    || normalizedBusy.startsWith(MESSAGE_STOP_PREFIX)
    || normalizedBusy === 'parallelChat:stop'
  );
}

export function getComposerBusyScope(busy: string | null | undefined): string | null {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    readScopedBusyValue(normalizedBusy, MESSAGE_PREPARE_PREFIX)
    ?? readScopedBusyValue(normalizedBusy, 'message:ack')
    ?? readScopedBusyValue(normalizedBusy, 'message:send')
    ?? readScopedBusyValue(normalizedBusy, 'message:stop')
  );
}

export function getComposerBusyChannelId(busy: string | null | undefined): string | null {
  const scope = getComposerBusyScope(busy);
  return scope && scope !== DRAFT_COMPOSER_BUSY_SCOPE ? scope : null;
}

export function getComposerDispatchChannelId(busy: string | null | undefined): string | null {
  const scope = readScopedBusyValue(normalizeComposerBusy(busy), 'message:send');
  return scope && scope !== DRAFT_COMPOSER_BUSY_SCOPE ? scope : null;
}

function isComposerScopedBusy(
  busy: string | null | undefined,
  prefix: string,
  scope: string | null | undefined,
): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
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
  return normalizedBusy === MESSAGE_PREPARE_PREFIX
    || isComposerScopedBusy(normalizedBusy, MESSAGE_PREPARE_PREFIX, channelId)
    || isComposerScopedBusy(normalizedBusy, 'message:ack', channelId);
}

export function isComposerDispatchBusyForChannel(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return isComposerScopedBusy(busy, 'message:send', channelId);
}

export function isComposerStopBusyForChannel(
  busy: string | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return isComposerScopedBusy(busy, 'message:stop', channelId);
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
  return normalizedBusy === MESSAGE_PREPARE_PREFIX
    || isComposerScopedBusy(normalizedBusy, MESSAGE_PREPARE_PREFIX, DRAFT_COMPOSER_BUSY_SCOPE)
    || isComposerScopedBusy(normalizedBusy, 'message:ack', DRAFT_COMPOSER_BUSY_SCOPE);
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

  if (normalizedBusy === MESSAGE_PREPARE_PREFIX) {
    return true;
  }

  return getComposerBusyChannelId(normalizedBusy) === channelId;
}
