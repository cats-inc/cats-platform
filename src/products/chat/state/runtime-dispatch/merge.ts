import type {
  ChannelParticipantAssignment,
  ChatChannelState,
  ParticipantExecutionLease,
  ChatState,
} from '../../api/contracts.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import { requireChannel } from '../model/index.js';
import type { ChatStore } from '../store.js';
import type { CatsCoreState } from '../../../../core/types.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { resolveChannelParticipantAssignments, resolveParticipantLeaseAttachment } from '../../shared/channelParticipants.js';

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
  sameTarget: boolean,
): ParticipantExecutionLease {
  if (!sameTarget) return latest;
  if (sameSnapshot(dispatch, baseline)) {
    return latest;
  }
  if (sameSnapshot(latest, baseline)) {
    return structuredClone(dispatch);
  }

  const latestSessionId = normalizeSessionId(latest);
  const dispatchSessionId = normalizeSessionId(dispatch);
  // Stream/status updates to the old session must not discard a completed
  // recovery. Otherwise the next heartbeat recovers that same old ID again.
  if (latestSessionId && latestSessionId === normalizeSessionId(baseline)
    && dispatchSessionId && dispatchSessionId !== latestSessionId) {
    return { ...structuredClone(dispatch),
      ...(latest.status === 'closed' && baseline.status !== 'closed'
        ? { status: 'closed' as const, lastError: latest.lastError } : {}) };
  }
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
  const baselineMessages = new Map(baselineChannel.messages.map((message) => [message.id, message]));
  const dispatchMessages = new Map(dispatchChannel.messages.map((message) => [message.id, message]));
  // Begin/intake can annotate an already persisted user message. Preserve those edits
  // only when no concurrent writer has changed that same message.
  latestChannel.messages = latestChannel.messages.map((message) => {
    const baseline = baselineMessages.get(message.id);
    const dispatch = dispatchMessages.get(message.id);
    return baseline && dispatch ? mergeChangedValue(message, baseline, dispatch) : message;
  });
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

/**
 * A session start can sanitize the model a participant asked for (a dropped
 * preset, a runtime-chosen entry). Keep that correction unless someone changed
 * the participant's model in the meantime.
 */
function mergeDispatchExecutionTarget(
  latest: ChannelParticipantAssignment['execution'],
  baseline: ChannelParticipantAssignment['execution'],
  dispatch: ChannelParticipantAssignment['execution'],
): void {
  latest.target = mergeChangedValue(latest.target, baseline.target, dispatch.target);
  latest.modelSelection = mergeChangedValue(
    latest.modelSelection ?? null,
    baseline.modelSelection ?? null,
    dispatch.modelSelection ?? null,
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
      sameSnapshot(latestAssignment.execution.target, baselineAssignment.execution.target)
        && sameSnapshot(latestAssignment.execution.modelSelection, baselineAssignment.execution.modelSelection),
    );
    mergeDispatchExecutionTarget(
      latestAssignment.execution,
      baselineAssignment.execution,
      dispatchAssignment.execution,
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
      sameSnapshot(latestAssignment.execution.target, baselineAssignment.execution.target)
        && sameSnapshot(latestAssignment.execution.modelSelection, baselineAssignment.execution.modelSelection),
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

/** Caller already owns the channel gate; each write still merges under the store's atomic lock. */
export function createLockedDispatchChatStore(
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'writeCore' | 'updateCore' | 'updateSnapshot'>,
  channelId: string,
  baselineState: ChatState,
  now: () => Date,
  runtimeClient?: Pick<RuntimeClient, 'closeSession'>,
) {
  return { read: chatStore.read.bind(chatStore), ...createMergedDispatchChatStore({
    chatStore, channelId, baselineState, now, runtimeClient,
    mutationGate: { run: (_key, operation) => operation() },
  }) };
}

export function createMergedDispatchChatStore(options: {
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'writeCore' | 'updateCore' | 'updateSnapshot'>;
  mutationGate: MutationGateLike;
  channelId: string;
  baselineState: ChatState;
  now: () => Date;
  runtimeClient?: Pick<RuntimeClient, 'closeSession'>;
  beforeMerge?: (latestState: ChatState, dispatchState: ChatState, core?: CatsCoreState) => ChatState;
  onPersistMergedState?: (input: {
    previousState: ChatState;
    persistedState: ChatState;
    dispatchState: ChatState;
    channelId: string;
  }) => void;
}): Pick<ChatStore, 'write' | 'readCore' | 'writeCore' | 'updateCore'> {
  let previousState = structuredClone(options.baselineState);
  // Runs before the writer releases the channel gate, so a wake cannot resume
  // the retained ID between this decision and closing its worker.
  const closeRetiredWorkers = async (dispatch: ChatState, persisted: ChatState) => {
    if (!options.runtimeClient) return;
    const proposedChannel = requireChannel(dispatch, options.channelId);
    const current = persisted.channels.find(channel => channel.id === options.channelId);
    const retired = new Set<string>();
    for (const assignment of resolveChannelParticipantAssignments(proposedChannel)) {
      const proposed = assignment.execution.lease;
      if (!proposed.sessionId || !['ready', 'initializing'].includes(proposed.status)) continue;
      const observed = current && resolveParticipantLeaseAttachment(current, assignment.participantId);
      if (!observed || observed.sessionId !== proposed.sessionId || observed.status === 'closed') retired.add(proposed.sessionId);
    }
    for (const id of retired) await options.runtimeClient.closeSession(id);
  };

  return {
    readCore: options.chatStore.readCore.bind(options.chatStore),
    writeCore: options.chatStore.writeCore.bind(options.chatStore),
    updateCore: options.chatStore.updateCore.bind(options.chatStore),
    async write(dispatchState: ChatState): Promise<ChatState> {
      return options.mutationGate.run(options.channelId, async () => {
        return options.mutationGate.run(MERGED_DISPATCH_WRITE_GATE_KEY, async () => {
          if (options.chatStore.updateSnapshot) {
            let before!: ChatState;
            const snapshot = await options.chatStore.updateSnapshot(({ chat, core }) => {
              before = chat;
              if (!chat.channels.some((channel) => channel.id === options.channelId)) return { chat, core };
              const checked = options.beforeMerge?.(chat, dispatchState, core) ?? dispatchState;
              return { chat: mergeCompletedDispatchState(chat, previousState, checked, options.channelId, options.now()), core };
            });
            previousState = structuredClone(dispatchState);
            await closeRetiredWorkers(dispatchState, snapshot.chat);
            options.onPersistMergedState?.({ previousState: before, persistedState: snapshot.chat,
              dispatchState, channelId: options.channelId });
            return snapshot.chat;
          }
          const latestState = await options.chatStore.read();
          if (!latestState.channels.some((channel) => channel.id === options.channelId)) {
            previousState = structuredClone(dispatchState);
            await closeRetiredWorkers(dispatchState, latestState);
            return latestState;
          }

          const checkedDispatchState = options.beforeMerge?.(latestState, dispatchState) ?? dispatchState;
          const mergedState = mergeCompletedDispatchState(
            latestState,
            previousState,
            checkedDispatchState,
            options.channelId,
            options.now(),
          );
          const persisted = await options.chatStore.write(mergedState);
          previousState = structuredClone(dispatchState);
          await closeRetiredWorkers(dispatchState, persisted);
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
