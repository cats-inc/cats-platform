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
    normalizedBusy === 'message:prepare'
    || normalizedBusy.startsWith('message:ack:')
    || normalizedBusy === 'concurrent:ack'
    || normalizedBusy.startsWith('message:send:')
    || normalizedBusy === 'concurrent:dispatch'
    || normalizedBusy === 'concurrent:relay'
    || normalizedBusy.startsWith('message:stop:')
    || normalizedBusy === 'concurrent:stop'
  );
}

export function isComposerAckBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    normalizedBusy === 'message:prepare'
    || normalizedBusy.startsWith('message:ack:')
    || normalizedBusy === 'concurrent:ack'
  );
}

export function isComposerDispatchBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return normalizedBusy.startsWith('message:send') || normalizedBusy === 'concurrent:dispatch';
}

export function isComposerStopBusy(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return normalizedBusy.startsWith('message:stop:') || normalizedBusy === 'concurrent:stop';
}

export function isComposerSelectionBlocked(busy: string | null | undefined): boolean {
  const normalizedBusy = normalizeComposerBusy(busy);
  return (
    normalizedBusy === 'message:prepare'
    || normalizedBusy.startsWith('message:ack:')
    || normalizedBusy === 'concurrent:ack'
    || normalizedBusy.startsWith('message:stop:')
    || normalizedBusy === 'concurrent:stop'
  );
}

export function getComposerBusyChannelId(busy: string | null | undefined): string | null {
  const normalizedBusy = normalizeComposerBusy(busy);
  if (normalizedBusy.startsWith('message:ack:')) {
    return normalizedBusy.slice('message:ack:'.length);
  }
  if (normalizedBusy.startsWith('message:send:')) {
    return normalizedBusy.slice('message:send:'.length);
  }
  if (normalizedBusy.startsWith('message:stop:')) {
    return normalizedBusy.slice('message:stop:'.length);
  }
  return null;
}

export function getComposerDispatchChannelId(busy: string | null | undefined): string | null {
  const normalizedBusy = normalizeComposerBusy(busy);
  return normalizedBusy.startsWith('message:send:')
    ? normalizedBusy.slice('message:send:'.length)
    : null;
}
