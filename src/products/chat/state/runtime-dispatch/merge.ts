import type {
  ChatChannelState,
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

    latestAssignment.execution.lease = mergeChangedValue(
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

    latestAssignment.execution.lease = mergeChangedValue(
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
  latestChannel.orchestratorLease = mergeChangedValue(
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
