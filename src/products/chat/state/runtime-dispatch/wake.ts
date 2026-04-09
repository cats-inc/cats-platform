import type {
  ChannelDispatchResult,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  type DispatchRequest,
} from '../room-routing/runtime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  updateDispatch,
  updateWorkflowTarget,
} from '../room-routing/workflow.js';
import {
  resolveWakeReasonFromRoutingTrigger,
} from '../room-routing/wake.js';
import {
  ensureChannelMarkedActive,
  toParticipantRef,
} from '../runtime-session/state.js';
import {
  ensureTargetSession,
  maybeAutoCheckoutChannelTask,
} from '../runtime-session/index.js';
import type { DispatchExecution } from './execution.js';
import { executeDispatch } from './execution.js';
import {
  applyDispatchChannelChatCwd,
  applyDispatchLeasePatch,
  classifyRuntimeDispatchRecoveryError,
  createDispatchRecoveryErrorLeasePatch,
  extractTargetLeasePatchFromState,
} from './recovery.js';
import { requireChannel } from '../model/index.js';

function collectRecoveredDispatchMessages(
  baselineState: ChatState,
  recoveredState: ChatState,
  channelId: string,
): ChatMessage[] {
  const baselineMessageIds = new Set(
    requireChannel(baselineState, channelId).messages.map((message) => message.id),
  );

  return requireChannel(recoveredState, channelId).messages
    .filter((message) => !baselineMessageIds.has(message.id))
    .map((message) => structuredClone(message));
}

export async function prepareReadyRequests(
  state: ChatState,
  channelId: string,
  requests: DispatchRequest[],
  runtimeClient: RuntimeClient,
  now: Date,
  options: {
    nowIso: string;
    baseRoomRouting: RoomRoutingState;
    workflow: RoomWorkflowState;
    activeTurn: RoomWorkflowTurn;
    outcome: RoomRoutingOutcome;
    latestCheckpoint: RoomRoutingCheckpoint | null;
    results: ChannelDispatchResult[];
    transport?: import('../runtimeTargeting.js').RuntimeTransportContext;
    companionStore?: CompanionBoxStore;
    memoryService?: CatsMemoryService;
    chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
    chatStatePath?: string;
    runtimeDataDir?: string;
  },
): Promise<{
  state: ChatState;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  readyRequests: DispatchRequest[];
}> {
  const {
    activeTurn,
    baseRoomRouting,
    nowIso,
    outcome,
    results,
    workflow,
  } = options;
  let latestCheckpoint = options.latestCheckpoint;
  let nextState = state;
  const readyRequests: DispatchRequest[] = [];

  for (const request of requests) {
    const ensured = await ensureTargetSession(
      nextState,
      channelId,
      request.target,
      runtimeClient,
      now,
      {
        transport: options.transport,
        companionStore: options.companionStore,
        memoryService: options.memoryService,
        chatStore: options.chatStore,
        chatStatePath: options.chatStatePath,
        runtimeDataDir: options.runtimeDataDir,
        roomRouting: baseRoomRouting,
        wakeTrigger: 'route_target',
        wakeReason: request.trigger === 'continuation_mention'
          ? 'workflow_continuation'
          : resolveWakeReasonFromRoutingTrigger(request.trigger),
        sourceMessageId: request.sourceMessage.id,
      },
    );
    nextState = ensured.state;
    if (ensured.error) {
      updateDispatch(outcome, request.dispatchId, {
        status: 'error',
        completedAt: nowIso,
        error: ensured.error,
      });
      updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
        wakeRequestId: ensured.wakeRequest?.id ?? null,
        status: 'failed',
        completedAt: nowIso,
        error: ensured.error,
      });
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_failed',
          'failed',
          `Failed to wake ${request.target.participantName}: ${ensured.error}`,
          nowIso,
          request.sourceParticipant,
          request.sourceMessage.id,
          [toParticipantRef(request.target)],
          {
            dispatchId: request.dispatchId,
            metadata: {
              phase: 'wake',
              parentCheckpointId: request.parentCheckpointId,
              branchStrategy: request.branchStrategy,
              handoffReason: request.handoffReason,
            },
          },
        ),
      );
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'runtime_error',
        `Failed to wake ${request.target.participantName}: ${ensured.error}`,
        nowIso,
        request.sourceParticipant,
        [toParticipantRef(request.target)],
      );
      results.push({
        targetKind: request.target.participantKind,
        targetId: request.target.participantId,
        targetName: request.target.participantName,
        sessionId: null,
        status: 'error',
        dispatchId: request.dispatchId,
        turnId: activeTurn.id,
        targetStatus: 'failed',
        error: ensured.error,
        sourceMessageId: request.sourceMessage.id,
        trigger: request.trigger,
        dispatchDepth: request.depth,
      });
      continue;
    }

    nextState = ensureChannelMarkedActive(nextState, channelId, now);
    await maybeAutoCheckoutChannelTask(
      options.chatStore,
      runtimeClient,
      channelId,
      ensured.target,
      now,
      ensured.taskExecutionContext,
    );
    readyRequests.push({
      ...request,
      target: ensured.target,
    });
    updateDispatch(outcome, request.dispatchId, {
      status: 'running',
      startedAt: nowIso,
    });
    updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
      wakeRequestId: ensured.wakeRequest?.id ?? null,
      status: 'running',
      startedAt: nowIso,
    });
    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'target_running',
        'running',
        `${ensured.target.participantName} is running this room dispatch.`,
        nowIso,
        request.sourceParticipant,
        request.sourceMessage.id,
        [toParticipantRef(ensured.target)],
        {
          dispatchId: request.dispatchId,
          metadata: {
            depth: request.depth,
            trigger: request.trigger,
            parentCheckpointId: request.parentCheckpointId,
            branchStrategy: request.branchStrategy,
            handoffReason: request.handoffReason,
          },
        },
      ),
    );
  }

  return {
    state: nextState,
    latestCheckpoint,
    readyRequests,
  };
}

export async function executeDispatchWithRecovery(input: {
  state: ChatState;
  channelId: string;
  request: DispatchRequest;
  runtimeClient: RuntimeClient;
  now: Date;
  transport?: import('../runtimeTargeting.js').RuntimeTransportContext;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  runtimeRecovery: RuntimeDispatchRecoveryPolicy;
}): Promise<DispatchExecution> {
  let dispatchState = input.state;
  let request = input.request;
  let recoveredLeasePatch: DispatchExecution['leasePatch'];
  let recoveredChannelChatCwd: string | undefined;
  let recoveredMessages: DispatchExecution['recoveredMessages'];
  let staleRecoveryCount = 0;

  while (true) {
    const execution = await executeDispatch(
      dispatchState,
      input.channelId,
      request,
      input.runtimeClient,
      input.now,
      input.transport,
      input.companionStore,
    );

    if (!execution.error) {
      return {
        ...execution,
        ...(recoveredLeasePatch ? { leasePatch: recoveredLeasePatch } : {}),
        ...(recoveredChannelChatCwd ? { channelChatCwd: recoveredChannelChatCwd } : {}),
        ...(recoveredMessages ? { recoveredMessages } : {}),
      };
    }

    const classifiedError = classifyRuntimeDispatchRecoveryError(execution.error);
    if (!classifiedError) {
      return {
        ...execution,
        ...(recoveredLeasePatch ? { leasePatch: recoveredLeasePatch } : {}),
        ...(recoveredChannelChatCwd ? { channelChatCwd: recoveredChannelChatCwd } : {}),
        ...(recoveredMessages ? { recoveredMessages } : {}),
      };
    }

    if (
      !classifiedError.retryable
      || staleRecoveryCount >= input.runtimeRecovery.staleSessionRetryLimit
    ) {
      return {
        ...execution,
        leasePatch: createDispatchRecoveryErrorLeasePatch(
          execution.error,
          input.now,
          { clearSession: true },
        ),
        ...(recoveredChannelChatCwd ? { channelChatCwd: recoveredChannelChatCwd } : {}),
        ...(recoveredMessages ? { recoveredMessages } : {}),
      };
    }

    staleRecoveryCount += 1;
    if (request.target.sessionId) {
      await input.runtimeClient.closeSession(request.target.sessionId).catch(() => {});
    }
    const ensured = await ensureTargetSession(
      dispatchState,
      input.channelId,
      { ...request.target, sessionId: null },
      input.runtimeClient,
      input.now,
      {
        transport: input.transport,
        companionStore: input.companionStore,
        memoryService: input.memoryService,
        chatStore: input.chatStore,
        chatStatePath: input.chatStatePath,
        runtimeDataDir: input.runtimeDataDir,
        wakeTrigger: 'route_target',
        wakeReason: request.trigger === 'continuation_mention'
          ? 'workflow_continuation'
          : resolveWakeReasonFromRoutingTrigger(request.trigger),
        sourceMessageId: request.sourceMessage.id,
      },
    );

    if (ensured.error || !ensured.target.sessionId) {
      const recoveryError = ensured.error ?? execution.error;
      return {
        ...execution,
        error: recoveryError,
        leasePatch: createDispatchRecoveryErrorLeasePatch(
          recoveryError,
          input.now,
          { clearSession: true },
        ),
        ...(recoveredChannelChatCwd ? { channelChatCwd: recoveredChannelChatCwd } : {}),
        ...(recoveredMessages ? { recoveredMessages } : {}),
      };
    }

    if (input.chatStore) {
      await maybeAutoCheckoutChannelTask(
        input.chatStore,
        input.runtimeClient,
        input.channelId,
        ensured.target,
        input.now,
        ensured.taskExecutionContext,
      );
    }

    recoveredLeasePatch = extractTargetLeasePatchFromState(
      ensured.state,
      input.channelId,
      ensured.target,
    );
    const nextRecoveredMessages = collectRecoveredDispatchMessages(
      dispatchState,
      ensured.state,
      input.channelId,
    );
    if (nextRecoveredMessages.length > 0) {
      recoveredMessages = nextRecoveredMessages;
    }
    dispatchState = applyDispatchLeasePatch(
      dispatchState,
      input.channelId,
      ensured.target,
      recoveredLeasePatch,
      input.now,
    );
    const recoveredChannel = requireChannel(ensured.state, input.channelId);
    if (recoveredChannel.chatCwd) {
      recoveredChannelChatCwd = recoveredChannel.chatCwd;
      dispatchState = applyDispatchChannelChatCwd(
        dispatchState,
        input.channelId,
        recoveredChannel.chatCwd,
        input.now,
      );
    }
    request = {
      ...request,
      target: ensured.target,
    };
  }
}
