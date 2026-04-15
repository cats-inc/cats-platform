export type ComposerBusyScope =
  | { kind: 'draft' }
  | { kind: 'channel'; channelId: string };

export type WorkspaceBusyState =
  | { kind: 'idle' }
  | {
      kind: 'composer';
      phase: 'prepare' | 'ack' | 'send' | 'stop';
      scope: ComposerBusyScope;
    }
  | { kind: 'parallel-chat'; phase: 'ack' | 'dispatch' | 'relay' | 'stop' }
  | { kind: 'channel'; action: 'resume' }
  | { kind: 'channel'; action: 'rename' | 'delete'; channelId: string }
  | { kind: 'channel-participant'; action: 'update'; participantId: string }
  | { kind: 'concurrent-group'; action: 'rename' | 'ungroup' | 'delete'; groupId: string }
  | { kind: 'cat'; action: 'create' | 'create-assign' }
  | {
      kind: 'cat';
      action:
        | 'archive'
        | 'delete'
        | 'assign'
        | 'remove'
        | 'rename'
        | 'products'
        | 'makeBoss'
        | 'skill'
        | 'unarchive';
      catId: string;
    }
  | { kind: 'setup'; action: 'reset' }
  | { kind: 'approval'; taskId: string; action: 'approve' | 'reroute' | 'reject' }
  | { kind: 'choice'; sourceMessageId: string; status: string }
  | { kind: 'operator-action'; action: 'retry' | 'acknowledge'; busyKey: string }
  | { kind: 'bot'; action: 'create' }
  | { kind: 'bot'; action: 'delete'; bindingId: string }
  | { kind: 'memory'; action: 'create' }
  | { kind: 'memory'; action: 'delete'; recordId: string };

export const IDLE_BUSY_STATE: WorkspaceBusyState = { kind: 'idle' };

export function clearBusyState(): WorkspaceBusyState {
  return IDLE_BUSY_STATE;
}

export function isBusyIdle(busy: WorkspaceBusyState | null | undefined): busy is { kind: 'idle' } {
  return !busy || busy.kind === 'idle';
}

export function isBusyActive(busy: WorkspaceBusyState | null | undefined): boolean {
  return !isBusyIdle(busy);
}

export function createDraftComposerBusyScope(): ComposerBusyScope {
  return { kind: 'draft' };
}

export function createChannelComposerBusyScope(channelId: string): ComposerBusyScope {
  return { kind: 'channel', channelId };
}

export function createComposerBusyState(
  phase: 'prepare' | 'ack' | 'send' | 'stop',
  scope: ComposerBusyScope,
): WorkspaceBusyState {
  return { kind: 'composer', phase, scope };
}

export function createParallelChatBusyState(
  phase: 'ack' | 'dispatch' | 'relay' | 'stop',
): WorkspaceBusyState {
  return { kind: 'parallel-chat', phase };
}

export function createChannelBusyState(action: 'resume'): WorkspaceBusyState;
export function createChannelBusyState(
  action: 'rename' | 'delete',
  channelId: string,
): WorkspaceBusyState;
export function createChannelBusyState(
  action: 'resume' | 'rename' | 'delete',
  channelId?: string,
): WorkspaceBusyState {
  if (action === 'resume') {
    return { kind: 'channel', action: 'resume' };
  }

  if (!channelId) {
    throw new Error(`channelId is required for channel busy action "${action}"`);
  }

  return { kind: 'channel', action, channelId };
}

export function createChannelParticipantBusyState(participantId: string): WorkspaceBusyState {
  return { kind: 'channel-participant', action: 'update', participantId };
}

export function createConcurrentGroupBusyState(
  action: 'rename' | 'ungroup' | 'delete',
  groupId: string,
): WorkspaceBusyState {
  return { kind: 'concurrent-group', action, groupId };
}

export function createCatBusyState(
  action: 'create' | 'create-assign',
): WorkspaceBusyState;
export function createCatBusyState(
  action:
    | 'archive'
    | 'delete'
    | 'assign'
    | 'remove'
    | 'rename'
    | 'products'
    | 'makeBoss'
    | 'skill'
    | 'unarchive',
  catId: string,
): WorkspaceBusyState;
export function createCatBusyState(
  action:
    | 'archive'
    | 'delete'
    | 'assign'
    | 'remove'
    | 'rename'
    | 'products'
    | 'makeBoss'
    | 'skill'
    | 'unarchive'
    | 'create'
    | 'create-assign',
  catId?: string,
): WorkspaceBusyState {
  if (action === 'create' || action === 'create-assign') {
    return { kind: 'cat', action };
  }

  if (!catId) {
    throw new Error(`catId is required for cat busy action "${action}"`);
  }

  return { kind: 'cat', action, catId };
}

export function createSetupBusyState(): WorkspaceBusyState {
  return { kind: 'setup', action: 'reset' };
}

export function createApprovalBusyState(
  taskId: string,
  action: 'approve' | 'reroute' | 'reject',
): WorkspaceBusyState {
  return { kind: 'approval', taskId, action };
}

export function createChoiceBusyState(
  sourceMessageId: string,
  status: string,
): WorkspaceBusyState {
  return { kind: 'choice', sourceMessageId, status };
}

export function createOperatorActionBusyState(
  action: 'retry' | 'acknowledge',
  busyKey: string,
): WorkspaceBusyState {
  return { kind: 'operator-action', action, busyKey };
}

export function createBotBusyState(action: 'create'): WorkspaceBusyState;
export function createBotBusyState(action: 'delete', bindingId: string): WorkspaceBusyState;
export function createBotBusyState(
  action: 'create' | 'delete',
  bindingId?: string,
): WorkspaceBusyState {
  if (action === 'create') {
    return { kind: 'bot', action };
  }

  if (!bindingId) {
    throw new Error('bindingId is required for bot delete busy state');
  }

  return { kind: 'bot', action, bindingId };
}

export function createMemoryBusyState(action: 'create'): WorkspaceBusyState;
export function createMemoryBusyState(action: 'delete', recordId: string): WorkspaceBusyState;
export function createMemoryBusyState(
  action: 'create' | 'delete',
  recordId?: string,
): WorkspaceBusyState {
  if (action === 'create') {
    return { kind: 'memory', action };
  }

  if (!recordId) {
    throw new Error('recordId is required for memory delete busy state');
  }

  return { kind: 'memory', action, recordId };
}

export function isParallelChatBusy(
  busy: WorkspaceBusyState | null | undefined,
  phase?: 'ack' | 'dispatch' | 'relay' | 'stop',
): boolean {
  return busy?.kind === 'parallel-chat' && (phase == null || busy.phase === phase);
}

export function isChannelBusy(
  busy: WorkspaceBusyState | null | undefined,
  action: 'resume' | 'rename' | 'delete',
  channelId?: string,
): boolean {
  if (busy?.kind !== 'channel' || busy.action !== action) {
    return false;
  }

  if (action === 'resume') {
    return true;
  }

  return 'channelId' in busy && busy.channelId === channelId;
}

export function isChannelParticipantBusy(
  busy: WorkspaceBusyState | null | undefined,
  participantId?: string,
): boolean {
  return busy?.kind === 'channel-participant'
    && (participantId == null || busy.participantId === participantId);
}

export function isConcurrentGroupBusy(
  busy: WorkspaceBusyState | null | undefined,
  action: 'rename' | 'ungroup' | 'delete',
  groupId?: string,
): boolean {
  return busy?.kind === 'concurrent-group'
    && busy.action === action
    && (groupId == null || busy.groupId === groupId);
}

export function isCatBusy(
  busy: WorkspaceBusyState | null | undefined,
  action:
    | 'archive'
    | 'delete'
    | 'assign'
    | 'remove'
    | 'rename'
    | 'products'
    | 'makeBoss'
    | 'skill'
    | 'unarchive'
    | 'create'
    | 'create-assign',
  catId?: string,
): boolean {
  if (busy?.kind !== 'cat' || busy.action !== action) {
    return false;
  }

  if ('catId' in busy) {
    return catId == null || busy.catId === catId;
  }

  return catId == null;
}

export function isSetupResetBusy(busy: WorkspaceBusyState | null | undefined): boolean {
  return busy?.kind === 'setup' && busy.action === 'reset';
}

export function isApprovalBusy(
  busy: WorkspaceBusyState | null | undefined,
  taskId?: string,
  action?: 'approve' | 'reroute' | 'reject',
): boolean {
  return busy?.kind === 'approval'
    && (taskId == null || busy.taskId === taskId)
    && (action == null || busy.action === action);
}

export function isChoiceBusy(
  busy: WorkspaceBusyState | null | undefined,
  sourceMessageId?: string,
  status?: string,
): boolean {
  return busy?.kind === 'choice'
    && (sourceMessageId == null || busy.sourceMessageId === sourceMessageId)
    && (status == null || busy.status === status);
}

export function isOperatorActionBusy(
  busy: WorkspaceBusyState | null | undefined,
  action?: 'retry' | 'acknowledge',
  busyKey?: string,
): boolean {
  return busy?.kind === 'operator-action'
    && (action == null || busy.action === action)
    && (busyKey == null || busy.busyKey === busyKey);
}

export function isBotBusy(
  busy: WorkspaceBusyState | null | undefined,
  action: 'create' | 'delete',
  bindingId?: string,
): boolean {
  if (busy?.kind !== 'bot' || busy.action !== action) {
    return false;
  }

  if ('bindingId' in busy) {
    return bindingId == null || busy.bindingId === bindingId;
  }

  return bindingId == null;
}

export function isMemoryBusy(
  busy: WorkspaceBusyState | null | undefined,
  action: 'create' | 'delete',
  recordId?: string,
): boolean {
  if (busy?.kind !== 'memory' || busy.action !== action) {
    return false;
  }

  if ('recordId' in busy) {
    return recordId == null || busy.recordId === recordId;
  }

  return recordId == null;
}

export function describeBusyState(busy: WorkspaceBusyState | null | undefined): string {
  if (!busy || busy.kind === 'idle') {
    return '';
  }

  switch (busy.kind) {
    case 'composer':
      return busy.scope.kind === 'draft'
        ? `composer:${busy.phase}:draft`
        : `composer:${busy.phase}:${busy.scope.channelId}`;
    case 'parallel-chat':
      return `parallel-chat:${busy.phase}`;
    case 'channel':
      return busy.action === 'resume'
        ? 'channel:resume'
        : `channel:${busy.action}:${busy.channelId}`;
    case 'channel-participant':
      return `channel-participant:${busy.action}:${busy.participantId}`;
    case 'concurrent-group':
      return `concurrent-group:${busy.action}:${busy.groupId}`;
    case 'cat':
      return 'catId' in busy ? `cat:${busy.action}:${busy.catId}` : `cat:${busy.action}`;
    case 'setup':
      return `setup:${busy.action}`;
    case 'approval':
      return `approval:${busy.taskId}:${busy.action}`;
    case 'choice':
      return `choice:${busy.sourceMessageId}:${busy.status}`;
    case 'operator-action':
      return `operator-action:${busy.action}:${busy.busyKey}`;
    case 'bot':
      return 'bindingId' in busy ? `bot:${busy.action}:${busy.bindingId}` : `bot:${busy.action}`;
    case 'memory':
      return 'recordId' in busy ? `memory:${busy.action}:${busy.recordId}` : `memory:${busy.action}`;
  }
}
