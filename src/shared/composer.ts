import {
  createDraftComposerBusyScope,
  isBusyActive,
  isParallelChatBusy,
  type ComposerBusyScope,
  type WorkspaceBusyState,
} from './workspaceBusy.js';

export type { ComposerBusyScope, WorkspaceBusyState } from './workspaceBusy.js';

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

export function isComposerBusy(busy: WorkspaceBusyState | null | undefined): boolean {
  return (busy?.kind === 'composer' || isParallelChatBusy(busy)) && isBusyActive(busy);
}

export function isComposerAckBusy(busy: WorkspaceBusyState | null | undefined): boolean {
  return (busy?.kind === 'composer' && (busy.phase === 'prepare' || busy.phase === 'ack'))
    || isParallelChatBusy(busy, 'ack');
}

export function isComposerDispatchBusy(busy: WorkspaceBusyState | null | undefined): boolean {
  return (busy?.kind === 'composer' && busy.phase === 'send')
    || isParallelChatBusy(busy, 'dispatch');
}

export function isComposerStopBusy(busy: WorkspaceBusyState | null | undefined): boolean {
  return (busy?.kind === 'composer' && busy.phase === 'stop')
    || isParallelChatBusy(busy, 'stop');
}

export function isComposerSelectionBlocked(busy: WorkspaceBusyState | null | undefined): boolean {
  return isComposerAckBusy(busy) || isComposerStopBusy(busy);
}

export function createDraftComposerScope(): ComposerBusyScope {
  return createDraftComposerBusyScope();
}

export function getComposerBusyScope(
  busy: WorkspaceBusyState | null | undefined,
): ComposerBusyScope | null {
  return busy?.kind === 'composer' ? busy.scope : null;
}

export function getComposerBusyChannelId(
  busy: WorkspaceBusyState | null | undefined,
): string | null {
  return busy?.kind === 'composer' && busy.scope.kind === 'channel'
    ? busy.scope.channelId
    : null;
}

export function getComposerDispatchChannelId(
  busy: WorkspaceBusyState | null | undefined,
): string | null {
  return busy?.kind === 'composer' && busy.phase === 'send' && busy.scope.kind === 'channel'
    ? busy.scope.channelId
    : null;
}

export function isComposerAckBusyForChannel(
  busy: WorkspaceBusyState | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return busy?.kind === 'composer'
    && (busy.phase === 'prepare' || busy.phase === 'ack')
    && busy.scope.kind === 'channel'
    && busy.scope.channelId === channelId;
}

export function isComposerDispatchBusyForChannel(
  busy: WorkspaceBusyState | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return busy?.kind === 'composer'
    && busy.phase === 'send'
    && busy.scope.kind === 'channel'
    && busy.scope.channelId === channelId;
}

export function isComposerStopBusyForChannel(
  busy: WorkspaceBusyState | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return busy?.kind === 'composer'
    && busy.phase === 'stop'
    && busy.scope.kind === 'channel'
    && busy.scope.channelId === channelId;
}

export function isComposerBusyForChannel(
  busy: WorkspaceBusyState | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return isComposerAckBusyForChannel(busy, channelId)
    || isComposerDispatchBusyForChannel(busy, channelId)
    || isComposerStopBusyForChannel(busy, channelId);
}

export function isComposerAckBusyForDraft(
  busy: WorkspaceBusyState | null | undefined,
): boolean {
  return busy?.kind === 'composer'
    && (busy.phase === 'prepare' || busy.phase === 'ack')
    && busy.scope.kind === 'draft';
}

export function isComposerBusyForDraft(busy: WorkspaceBusyState | null | undefined): boolean {
  return isComposerAckBusyForDraft(busy);
}

export function doesComposerSelectionBlockChannelRoute(
  busy: WorkspaceBusyState | null | undefined,
  channelId: string | null | undefined,
): boolean {
  return Boolean(channelId)
    && (
      isComposerAckBusyForChannel(busy, channelId)
      || isComposerStopBusyForChannel(busy, channelId)
    );
}
