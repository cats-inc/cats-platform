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
  return busy === 'message:prepare' || busy.startsWith('message:send');
}

export function isComposerDispatchBusy(busy: string): boolean {
  return busy.startsWith('message:send') || busy === 'concurrent:dispatch';
}

export function getComposerDispatchChannelId(busy: string): string | null {
  return busy.startsWith('message:send:')
    ? busy.slice('message:send:'.length)
    : null;
}
