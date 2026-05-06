import type {
  ChatChannelState,
  ParticipantExecutionLease,
  ChatState,
} from '../../api/contracts.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import { requireChannel } from '../model/index.js';
import type { ChatStore } from '../store.js';

interface MutationGateLike {
  run<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

const MERGED_DISPATCH_WRITE_GATE_KEY = '__chat:merged-dispatch-write__';

function sameSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function pickMaxIso(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left.localeCompare(right) >= 0 ? left : right;
}

function mergeChangedValue<T>(
  latest: T,
  baseline: T,
  dispatch: T,
): T {
  if (sameSnapshot(dispatch, baseline)) {
    return latest;
  }
  if (!sameSnapshot(latest, baseline)) {
    return latest;
  }
  return structuredClone(dispatch);
}

function normalizeSessionId(lease: ParticipantExecutionLease): string | null {
  return lease.sessionId?.trim() || null;
}

function isTerminalLeaseStatus(status: ParticipantExecutionLease['status']): boolean {
  return status === 'closed' || status === 'removed';
}

function pickTerminalLeaseStatus(input: {
  latest: ParticipantExecutionLease;
  dispatch: ParticipantExecutionLease;
}): ParticipantExecutionLease['status'] | null {
  const latestTerminal = isTerminalLeaseStatus(input.latest.status);
  const dispatchTerminal = isTerminalLeaseStatus(input.dispatch.status);
  if (!latestTerminal && !dispatchTerminal) {
    return null;
  }
  if (input.latest.status === 'removed' || input.dispatch.status === 'removed') {
    return 'removed';
  }
  return dispatchTerminal ? input.dispatch.status : input.latest.status;
}

function leaseStatusRank(status: ParticipantExecutionLease['status']): number {
  switch (status) {
    case 'ready':
      return 3;
    case 'initializing':
      return 2;
    case 'not_started':
      return 1;
    default:
      return 0;
  }
}

function pickLeaseStatus(input: {
  latest: ParticipantExecutionLease;
  dispatch: ParticipantExecutionLease;
}): ParticipantExecutionLease['status'] {
  const terminalStatus = pickTerminalLeaseStatus(input);
  if (terminalStatus !== null) {
    return terminalStatus;
  }
  if (input.dispatch.status === 'error') {
    return 'error';
  }
  if (input.latest.status === 'error' && input.dispatch.status !== 'ready') {
    return input.latest.status;
  }
  return leaseStatusRank(input.dispatch.status) >= leaseStatusRank(input.latest.status)
    ? input.dispatch.status
    : input.latest.status;
}

function mergeSameRuntimeLease(
  latest: ParticipantExecutionLease,
  dispatch: ParticipantExecutionLease,
): ParticipantExecutionLease {
  const mergedStatus = pickLeaseStatus({ latest, dispatch });
  const mergedLastUsedAt = pickMaxIso(latest.lastUsedAt, dispatch.lastUsedAt);
  const dispatchModelSelection = dispatch.modelSelection === undefined
    ? undefined
    : structuredClone(dispatch.modelSelection);
  const latestModelSelection = latest.modelSelection === undefined
    ? undefined
    : structuredClone(latest.modelSelection);
  const mergedModelSelection = dispatchModelSelection !== undefined
    ? dispatchModelSelection
    : latestModelSelection;

  return {
    sessionId: normalizeSessionId(dispatch) ?? normalizeSessionId(latest),
    status: mergedStatus,
    cwd: dispatch.cwd ?? latest.cwd,
    lastError: mergedStatus === 'error'
      ? (dispatch.lastError ?? latest.lastError)
      : null,
    laneId: dispatch.laneId ?? latest.laneId,
    provider: dispatch.provider ?? latest.provider,
    ...(
      dispatch.instance !== undefined || latest.instance !== undefined
        ? { instance: dispatch.instance ?? latest.instance ?? null }
        : {}
    ),
    model: dispatch.model ?? latest.model,
    ...(mergedModelSelection !== undefined ? { modelSelection: mergedModelSelection } : {}),
    startedAt: latest.startedAt ?? dispatch.startedAt,
    lastUsedAt: mergedLastUsedAt,
  };
}

function warnConcurrentRuntimeLeaseRotation(input: {
  baselineSessionId: string | null;
  latestSessionId: string | null;
  dispatchSessionId: string | null;
}): void {
  console.warn('Concurrent runtime session lease rotation detected; latest lease wins.', {
    feature: 'runtime_session_lease_merge',
    reason: 'concurrent_session_rotation',
    baselineSessionId: input.baselineSessionId,
    latestSessionId: input.latestSessionId,
    dispatchSessionId: input.dispatchSessionId,
  });
}

function mergeDispatchExecutionLease(
  latest: ParticipantExecutionLease,
  baseline: ParticipantExecutionLease,
  dispatch: ParticipantExecutionLease,
): ParticipantExecutionLease {
  if (sameSnapshot(dispatch, baseline)) {
    return latest;
  }
  if (sameSnapshot(latest, baseline)) {
    return structuredClone(dispatch);
  }

  const latestSessionId = normalizeSessionId(latest);
  const dispatchSessionId = normalizeSessionId(dispatch);
  if (latestSessionId && dispatchSessionId && latestSessionId === dispatchSessionId) {
    return mergeSameRuntimeLease(latest, dispatch);
  }

  if (latestSessionId && dispatchSessionId) {
    warnConcurrentRuntimeLeaseRotation({
      baselineSessionId: normalizeSessionId(baseline),
      latestSessionId,
      dispatchSessionId,
    });
  }
  return structuredClone(latest);
}

function mergeDispatchMessages(
  latestChannel: ChatChannelState,
  baselineChannel: ChatChannelState,
  dispatchChannel: ChatChannelState,
): void {
  const baselineMessageIds = new Set(baselineChannel.messages.map((message) => message.id));
  const latestMessageIds = new Set(latestChannel.messages.map((message) => message.id));
  const newMessages = dispatchChannel.messages.filter((message) =>
    !baselineMessageIds.has(message.id) && !latestMessageIds.has(message.id));

  if (newMessages.length === 0) {
    return;
  }

  latestChannel.messages.push(...structuredClone(newMessages));
  latestChannel.lastMessageAt = pickMaxIso(
    latestChannel.lastMessageAt,
    newMessages[newMessages.length - 1]?.createdAt ?? dispatchChannel.lastMessageAt,
  );
}

function mergeDispatchAssignmentLeases(
  latestChannel: ChatChannelState,
  baselineChannel: ChatChannelState,
  dispatchChannel: ChatChannelState,
): void {
  const latestParticipantAssignments = latestChannel.participantAssignments ?? [];
  const baselineParticipantAssignments = baselineChannel.participantAssignments ?? [];
  const dispatchParticipantAssignments = dispatchChannel.participantAssignments ?? [];

  for (const latestAssignment of latestParticipantAssignments) {
    const baselineAssignment = baselineParticipantAssignments.find((assignment) =>
      assignment.participantId === latestAssignment.participantId);
    const dispatchAssignment = dispatchParticipantAssignments.find((assignment) =>
      assignment.participantId === latestAssignment.participantId);
    if (!baselineAssignment || !dispatchAssignment) {
      continue;
    }

    latestAssignment.execution.lease = mergeDispatchExecutionLease(
      latestAssignment.execution.lease,
      baselineAssignment.execution.lease,
      dispatchAssignment.execution.lease,
    );
  }

  for (const latestAssignment of latestChannel.catAssignments) {
    const baselineAssignment = baselineChannel.catAssignments.find((assignment) =>
      assignment.catId === latestAssignment.catId);
    const dispatchAssignment = dispatchChannel.catAssignments.find((assignment) =>
      assignment.catId === latestAssignment.catId);
    if (!baselineAssignment || !dispatchAssignment) {
      continue;
    }

    latestAssignment.execution.lease = mergeDispatchExecutionLease(
      latestAssignment.execution.lease,
      baselineAssignment.execution.lease,
      dispatchAssignment.execution.lease,
    );
  }
}

function mergeDispatchRoomRoutingState(
  latestRoomRouting: ChatChannelState['roomRouting'],
  baselineRoomRouting: ChatChannelState['roomRouting'],
  dispatchRoomRouting: ChatChannelState['roomRouting'],
): ChatChannelState['roomRouting'] {
  if (!baselineRoomRouting || !dispatchRoomRouting) {
    return mergeChangedValue(
      latestRoomRouting,
      baselineRoomRouting,
      dispatchRoomRouting,
    );
  }

  const nextRoomRouting = structuredClone(latestRoomRouting ?? baselineRoomRouting);
  if (!nextRoomRouting) {
    return structuredClone(dispatchRoomRouting);
  }

  nextRoomRouting.mode = mergeChangedValue(
    nextRoomRouting.mode,
    baselineRoomRouting.mode,
    dispatchRoomRouting.mode,
  );
  nextRoomRouting.defaultRecipientId = mergeChangedValue(
    nextRoomRouting.defaultRecipientId,
    baselineRoomRouting.defaultRecipientId,
    dispatchRoomRouting.defaultRecipientId,
  );
  nextRoomRouting.maxContinuations = mergeChangedValue(
    nextRoomRouting.maxContinuations,
    baselineRoomRouting.maxContinuations,
    dispatchRoomRouting.maxContinuations,
  );
  nextRoomRouting.maxDispatchesPerTurn = mergeChangedValue(
    nextRoomRouting.maxDispatchesPerTurn,
    baselineRoomRouting.maxDispatchesPerTurn,
    dispatchRoomRouting.maxDispatchesPerTurn,
  );
  nextRoomRouting.maxTargetVisitsPerTurn = mergeChangedValue(
    nextRoomRouting.maxTargetVisitsPerTurn,
    baselineRoomRouting.maxTargetVisitsPerTurn,
    dispatchRoomRouting.maxTargetVisitsPerTurn,
  );
  nextRoomRouting.lastOutcome = mergeChangedValue(
    nextRoomRouting.lastOutcome,
    baselineRoomRouting.lastOutcome,
    dispatchRoomRouting.lastOutcome,
  );
  nextRoomRouting.lastCheckpoint = mergeChangedValue(
    nextRoomRouting.lastCheckpoint,
    baselineRoomRouting.lastCheckpoint,
    dispatchRoomRouting.lastCheckpoint,
  );
  nextRoomRouting.lastWakeRequest = mergeChangedValue(
    nextRoomRouting.lastWakeRequest,
    baselineRoomRouting.lastWakeRequest,
    dispatchRoomRouting.lastWakeRequest,
  );
  nextRoomRouting.wakeHistory = mergeChangedValue(
    nextRoomRouting.wakeHistory,
    baselineRoomRouting.wakeHistory,
    dispatchRoomRouting.wakeHistory,
  );
  nextRoomRouting.workflow = mergeChangedValue(
    nextRoomRouting.workflow,
    baselineRoomRouting.workflow,
    dispatchRoomRouting.workflow,
  );

  return nextRoomRouting;
}

export function mergeCompletedDispatchState(
  latestState: ChatState,
  baselineState: ChatState,
  dispatchState: ChatState,
  channelId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = structuredClone(latestState);
  const latestChannel = requireChannel(nextState, channelId);
  const baselineChannel = requireChannel(baselineState, channelId);
  const dispatchChannel = requireChannel(dispatchState, channelId);

  mergeDispatchMessages(latestChannel, baselineChannel, dispatchChannel);
  mergeDispatchAssignmentLeases(latestChannel, baselineChannel, dispatchChannel);
  latestChannel.orchestratorLease = mergeDispatchExecutionLease(
    latestChannel.orchestratorLease,
    baselineChannel.orchestratorLease,
    dispatchChannel.orchestratorLease,
  );
  latestChannel.pendingProvider = mergeChangedValue(
    latestChannel.pendingProvider,
    baselineChannel.pendingProvider,
    dispatchChannel.pendingProvider,
  );
  latestChannel.pendingModel = mergeChangedValue(
    latestChannel.pendingModel,
    baselineChannel.pendingModel,
    dispatchChannel.pendingModel,
  );
  latestChannel.pendingInstance = mergeChangedValue(
    latestChannel.pendingInstance,
    baselineChannel.pendingInstance,
    dispatchChannel.pendingInstance,
  );
  latestChannel.pendingModelSelection = mergeChangedValue(
    latestChannel.pendingModelSelection,
    baselineChannel.pendingModelSelection,
    dispatchChannel.pendingModelSelection,
  );
  latestChannel.status = mergeChangedValue(
    latestChannel.status,
    baselineChannel.status,
    dispatchChannel.status,
  );
  latestChannel.chatCwd = mergeChangedValue(
    latestChannel.chatCwd,
    baselineChannel.chatCwd,
    dispatchChannel.chatCwd,
  );
  latestChannel.roomRouting = mergeDispatchRoomRoutingState(
    latestChannel.roomRouting,
    baselineChannel.roomRouting,
    dispatchChannel.roomRouting,
  );

  const unreadDelta = dispatchChannel.unreadCount - baselineChannel.unreadCount;
  if (unreadDelta !== 0) {
    latestChannel.unreadCount = Math.max(0, latestChannel.unreadCount + unreadDelta);
  }

  latestChannel.lastActivatedAt = pickMaxIso(
    latestChannel.lastActivatedAt,
    dispatchChannel.lastActivatedAt,
  );
  latestChannel.lastMessageAt = pickMaxIso(
    latestChannel.lastMessageAt,
    dispatchChannel.lastMessageAt,
  );
  latestChannel.updatedAt = pickMaxIso(
    latestChannel.updatedAt,
    dispatchChannel.updatedAt,
  ) ?? latestChannel.updatedAt;

  return refreshDerivedMemoryLayers(nextState, channelId, now);
}

export function createMergedDispatchChatStore(options: {
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'writeCore' | 'updateCore'>;
  mutationGate: MutationGateLike;
  channelId: string;
  baselineState: ChatState;
  now: () => Date;
  onPersistMergedState?: (input: {
    previousState: ChatState;
    persistedState: ChatState;
    dispatchState: ChatState;
    channelId: string;
  }) => void;
}): Pick<ChatStore, 'write' | 'readCore' | 'writeCore' | 'updateCore'> {
  let previousState = options.baselineState;

  return {
    readCore: options.chatStore.readCore.bind(options.chatStore),
    writeCore: options.chatStore.writeCore.bind(options.chatStore),
    updateCore: options.chatStore.updateCore.bind(options.chatStore),
    async write(dispatchState: ChatState): Promise<ChatState> {
      return options.mutationGate.run(options.channelId, async () => {
        return options.mutationGate.run(MERGED_DISPATCH_WRITE_GATE_KEY, async () => {
          const latestState = await options.chatStore.read();
          if (!latestState.channels.some((channel) => channel.id === options.channelId)) {
            previousState = dispatchState;
            return latestState;
          }

          const mergedState = mergeCompletedDispatchState(
            latestState,
            previousState,
            dispatchState,
            options.channelId,
            options.now(),
          );
          const persisted = await options.chatStore.write(mergedState);
          previousState = dispatchState;
          options.onPersistMergedState?.({
            previousState: latestState,
            persistedState: persisted,
            dispatchState,
            channelId: options.channelId,
          });
          return persisted;
        });
      });
    },
  };
}
