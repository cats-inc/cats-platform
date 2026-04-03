export interface ComposerKeyDecisionInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
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

export function isComposerBusy(busy: string): boolean {
  return (
    busy === 'message:prepare'
    || busy.startsWith('message:ack:')
    || busy.startsWith('message:send:')
    || busy.startsWith('message:stop:')
    || busy === 'concurrent:stop'
  );
}

export function isComposerDispatchBusy(busy: string): boolean {
  return busy.startsWith('message:send') || busy === 'concurrent:dispatch';
}

export function isComposerSelectionBlocked(busy: string): boolean {
  return (
    busy === 'message:prepare'
    || busy.startsWith('message:ack:')
    || busy === 'concurrent:ack'
    || busy.startsWith('message:stop:')
    || busy === 'concurrent:stop'
  );
}

export function getComposerBusyChannelId(busy: string): string | null {
  if (busy.startsWith('message:ack:')) {
    return busy.slice('message:ack:'.length);
  }
  if (busy.startsWith('message:send:')) {
    return busy.slice('message:send:'.length);
  }
  if (busy.startsWith('message:stop:')) {
    return busy.slice('message:stop:'.length);
  }
  return null;
}

export function getComposerDispatchChannelId(busy: string): string | null {
  return busy.startsWith('message:send:')
    ? busy.slice('message:send:'.length)
    : null;
}
