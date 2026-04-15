import type {
  ChannelActivationResult,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingState,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeTrigger,
} from '../../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { CatsCoreState, CoreTaskRecord } from '../../../../core/types.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import {
  buildTaskRuntimeExecutionRequest,
  type TaskRuntimeExecutionRequest,
} from '../../../../shared/taskExecutionBridge.js';
import {
  checkoutTaskExecution,
  startTaskRunWatcher,
} from '../../../../core/taskLifecycle.js';
import { resolveVisibleOrchestratorLabel } from '../../../../shared/orchestratorLabel.js';
import {
  ORCHESTRATOR_NAME,
  appendMessage,
  buildChannelView,
  requireChannel,
  setChannelParticipantLease,
  setChannelParticipantExecutionTarget,
  setChannelChatCwd,
  setChannelOrchestratorLease,
  setChannelPendingExecutionTarget,
  setChannelRoomRouting,
  setGlobalOrchestratorExecutionTarget,
} from '../model/index.js';
import { resolveRoomDefaultRoutingTarget, type RoutingTarget } from '../mentionRouter.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { createRecordedWakeRequest } from '../room-routing/wake.js';
import { formatSessionStartedMessage } from '../runtimeMessages.js';
import {
  resolveOrchestratorExecutionTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../runtimeTargeting.js';
import { createExplicitProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  classifyRuntimeDispatchRecoveryError,
} from '../runtime-dispatch/recovery.js';
import {
  mergeRuntimeInvocationContextMetadata,
} from '../runtime-dispatch/context.js';
import {
  findAssignedParticipant,
  resolveOrchestratorExecutionLease,
  resolveOrchestratorLeaseAttachment,
  resolveParticipantExecutionLease,
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import {
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../workspace.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import {
  clearTargetSessionLease,
  ensureChannelMarkedActive,
  markTargetWaking,
  resolveActorIdForTarget,
  setErroredSession,
  setStartedSession,
  spawnCwdFor,
  toParticipantRef,
} from './state.js';

function resolveVisibleWakeTargetLabel(input: {
  target: RoutingTarget;
  provider?: string | null;
  instance?: string | null;
}): string {
  if (input.target.participantKind !== 'orchestrator') {
    return input.target.participantName;
  }
  return resolveVisibleOrchestratorLabel({
    displayName: input.target.participantName,
    provider: input.provider,
    instance: input.instance,
  }) ?? ORCHESTRATOR_NAME;
}
import type { RuntimeSessionRoutingOptions } from './shared.js';

const MANUALLY_REVIVABLE_SESSION_STATES = new Set([
  'closed',
  'closing',
  'terminated',
  'terminated_with_error',
  'error',
]);

function readObservedSessionState(
  observed: Awaited<ReturnType<RuntimeClient['observeSession']>>,
): string | null {
  const session = observed.session;
  if (!session || typeof session !== 'object') {
    return null;
  }

  const directStatus = (session as Record<string, unknown>).status;
  if (typeof directStatus === 'string' && directStatus.trim()) {
    return directStatus.trim().toLowerCase();
  }

  const inspection = (session as Record<string, unknown>).inspection;
  if (!inspection || typeof inspection !== 'object') {
    return null;
  }

  const inspectionState = (inspection as Record<string, unknown>).state;
  return typeof inspectionState === 'string' && inspectionState.trim()
    ? inspectionState.trim().toLowerCase()
    : null;
}

async function shouldReviveExistingTargetSession(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  sessionId: string | null,
  runtimeClient: RuntimeClient,
  forceReviveClosedSessions: boolean,
): Promise<boolean> {
  if (!sessionId) {
    return false;
  }

  const channel = requireChannel(state, channelId);
  const lease = target.participantKind === 'cat'
    ? resolveParticipantExecutionLease(channel, target.participantId)
    : resolveOrchestratorExecutionLease(channel);

  if (!lease) {
    return false;
  }

  if (lease.status === 'closed') {
    return true;
  }

  if (
    forceReviveClosedSessions
    && lease.status === 'error'
    && typeof lease.lastError === 'string'
    && classifyRuntimeDispatchRecoveryError(lease.lastError)?.reason === 'stale_session'
  ) {
    return true;
  }

  if (!forceReviveClosedSessions) {
    return false;
  }

  try {
    const observed = await runtimeClient.observeSession(sessionId);
    const observedState = readObservedSessionState(observed);
    return observedState ? MANUALLY_REVIVABLE_SESSION_STATES.has(observedState) : false;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return classifyRuntimeDispatchRecoveryError(message)?.reason === 'stale_session';
  }
}

async function resolveChannelTaskExecutionRequest(
  chatStore: RuntimeSessionRoutingOptions['chatStore'],
  channelId: string,
  target: RoutingTarget,
): Promise<{
  core: CatsCoreState;
  task: CoreTaskRecord;
  actorId: string;
  executionRequest: TaskRuntimeExecutionRequest;
} | undefined> {
  if (!chatStore) {
    return undefined;
  }

  const core = await chatStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === `task-channel-${channelId}`);
  if (!task) {
    return undefined;
  }

  const actorId = resolveActorIdForTarget(target);
  if (!task.assignedActorIds.includes(actorId)) {
    return undefined;
  }

  if (task.status !== 'approved' && task.status !== 'in_progress') {
    return undefined;
  }

  return {
    core,
    task,
    actorId,
    executionRequest: buildTaskRuntimeExecutionRequest({
      core,
      task,
      product: 'chat',
    }),
  };
}

export async function maybeAutoCheckoutChannelTask(
  chatStore: RuntimeSessionRoutingOptions['chatStore'],
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'streamSession'>,
  channelId: string,
  target: RoutingTarget,
  now: Date,
  taskExecutionContext?: Awaited<ReturnType<typeof resolveChannelTaskExecutionRequest>>,
): Promise<void> {
  if (
    !chatStore
    || !target.sessionId
    || !taskExecutionContext
    || taskExecutionContext.task.status !== 'approved'
  ) {
    return;
  }

  const checkout = checkoutTaskExecution({
    core: taskExecutionContext.core,
    taskId: taskExecutionContext.task.id,
    actorId: taskExecutionContext.actorId,
    sessionId: target.sessionId,
    executionRequest: taskExecutionContext.executionRequest,
    now,
  });
  const persisted = await chatStore.writeCore(checkout.core);
  const persistedTask = persisted.tasks.find((candidate) => candidate.id === checkout.task.id)
    ?? checkout.task;
  const persistedRun = persisted.runs.find((candidate) => candidate.id === checkout.run.id)
    ?? checkout.run;
  startTaskRunWatcher({
    coreStore: chatStore,
    runtimeClient,
    taskId: persistedTask.id,
    runId: persistedRun.id,
    sessionId: target.sessionId,
    actorId: taskExecutionContext.actorId,
  });
}

function readInvocationContextMetadataString(
  context: { metadata?: Record<string, unknown> } | undefined,
  key: string,
): string | null {
  const value = context?.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function readDispatchContextMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function resolveTargetLeaseAttachment(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  options: {
    preferredLaneId?: string | null;
    allowLeaseSessionReuse?: boolean;
  } = {},
): {
  laneId: string | null;
  sessionId: string | null;
} {
  const channel = requireChannel(state, channelId);
  const attachment = target.participantKind === 'cat'
    ? resolveParticipantLeaseAttachment(channel, target.participantId)
    : resolveOrchestratorLeaseAttachment(channel);
  const leaseLaneId = attachment?.laneId ?? null;
  const leaseSessionId = attachment?.sessionId ?? null;
  const targetLaneId = target.laneId?.trim() || null;
  const targetSessionId = target.sessionId?.trim() || null;
  const laneId = options.preferredLaneId ?? targetLaneId ?? leaseLaneId;
  const hasCanonicalLane = laneId != null;
  const leaseSessionMatchesLane = leaseSessionId != null
    && (!hasCanonicalLane || leaseLaneId === laneId);
  const targetSessionMatchesLane = targetSessionId != null
    && (!hasCanonicalLane || targetLaneId === laneId);

  return {
    laneId: laneId ?? leaseLaneId ?? targetLaneId,
    sessionId: options.allowLeaseSessionReuse === false
      ? (targetSessionMatchesLane ? targetSessionId : null)
      : (
          (leaseSessionMatchesLane ? leaseSessionId : null)
          ?? (targetSessionMatchesLane ? targetSessionId : null)
        ),
  };
}

export async function ensureTargetSession(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
  options: RuntimeSessionRoutingOptions & {
    roomRouting?: RoomRoutingState | null;
    wakeTrigger?: RoomWakeTrigger;
    wakeReason?: RoomWakeReason;
    sourceMessageId?: string | null;
    ignoreLeaseSessionAttachment?: boolean;
  } = {},
): Promise<{
  state: ChatState;
  target: RoutingTarget;
  error: string | null;
  wakeRequest: RoomWakeRequest | null;
  taskExecutionContext: Awaited<ReturnType<typeof resolveChannelTaskExecutionRequest>>;
}> {
  const nowIso = now.toISOString();
  const wakeTrigger = options.wakeTrigger ?? 'route_target';
  const wakeReason = options.wakeReason ?? 'room_default';
  const sourceMessageId = options.sourceMessageId ?? null;
  const targetStateId = readDispatchContextMetadataString(
    options.dispatchContextMetadata,
    'targetStateId',
  );
  const laneId = readDispatchContextMetadataString(
    options.dispatchContextMetadata,
    'laneId',
  ) ?? (target.laneId?.trim() || null);
  const targetAttachment = resolveTargetLeaseAttachment(state, channelId, target, {
    preferredLaneId: laneId,
    allowLeaseSessionReuse: options.ignoreLeaseSessionAttachment !== true,
  });
  const attachedTarget: RoutingTarget = {
    ...target,
    ...targetAttachment,
    laneId: targetAttachment.laneId,
  };
  const participant = toParticipantRef(attachedTarget);
  const taskExecutionContext = await resolveChannelTaskExecutionRequest(
    options.chatStore,
    channelId,
    attachedTarget,
  );
  const recordTargetWake = (
    status: RoomWakeRequest['status'],
    error: string | null = null,
  ) => createRecordedWakeRequest(
    options.roomRouting,
    participant,
    wakeTrigger,
    wakeReason,
    sourceMessageId,
    nowIso,
    status,
    error,
  );
  const applyLeaseLaneAttachment = (
    inputState: ChatState,
  ): ChatState => {
    if (!laneId) {
      return inputState;
    }
    return attachedTarget.participantKind === 'cat'
      ? setChannelParticipantLease(
        inputState,
        channelId,
        attachedTarget.participantId,
        { laneId },
        now,
      )
      : setChannelOrchestratorLease(
        inputState,
        channelId,
        { laneId },
        now,
      );
  };

  if (attachedTarget.sessionId) {
    if (await shouldReviveExistingTargetSession(
      state,
      channelId,
      attachedTarget,
      attachedTarget.sessionId,
      runtimeClient,
      options.forceReviveClosedSessions ?? false,
    )) {
      const resetState = clearTargetSessionLease(
        state,
        channelId,
        attachedTarget.participantKind === 'cat'
          ? { participantId: attachedTarget.participantId }
          : 'orchestrator',
        now,
      );
      return ensureTargetSession(
        resetState,
        channelId,
        { ...attachedTarget, sessionId: null },
        runtimeClient,
        now,
        options,
      );
    }

    if (attachedTarget.participantKind === 'orchestrator') {
      const channelState = requireChannel(state, channelId);
      const executionTarget = resolveOrchestratorExecutionTarget(state, channelState);
      const orchestratorLease = channelState.orchestratorLease;
      const shouldRestartSoloSession = channelState.composerMode === 'solo'
        && (
          orchestratorLease.provider !== executionTarget.provider
          || orchestratorLease.model !== executionTarget.model
        );

      if (shouldRestartSoloSession) {
        await bestEffortFlushRuntimeSessionMemory({
          runtimeClient,
          sessionId: attachedTarget.sessionId,
          requestedPhase: 'pre_reset',
          memoryService: options.memoryService,
          companionStore: options.companionStore,
          coreStore: options.chatStore,
          now,
        });
        await runtimeClient.closeSession(attachedTarget.sessionId);
        const resetState = setChannelOrchestratorLease(
          state,
          channelId,
          {
            sessionId: null,
            status: 'not_started',
            lastError: null,
            provider: executionTarget.provider,
            model: executionTarget.model,
            startedAt: null,
            lastUsedAt: orchestratorLease.lastUsedAt,
          },
          now,
        );
        return ensureTargetSession(
          resetState,
          channelId,
          { ...attachedTarget, sessionId: null },
          runtimeClient,
          now,
          options,
        );
      }
    }

    return {
      state: applyLeaseLaneAttachment(state),
      target: attachedTarget,
      error: null,
      wakeRequest: recordTargetWake('skipped'),
      taskExecutionContext,
    };
  }

  let nextState = state;
  const spawnCwd = spawnCwdFor(requireChannel(nextState, channelId));
  const workspaceKind = spawnCwd ? 'source' : 'sandbox';
  let targetLabelProvider: string | null = null;
  let targetLabelInstance: string | null = null;

  try {
    nextState = markTargetWaking(nextState, channelId, attachedTarget, now, laneId);
    const runtimeChannel = buildChannelView(nextState, channelId);
    const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
      nextState,
      runtimeChannel,
      attachedTarget,
      options.transport,
      options.transportBindingId,
      now,
      options.companionStore,
    );
    const conversationId = readInvocationContextMetadataString(
      runtimeEnvelope.context,
      'conversationId',
    ) ?? buildChatConversationId(channelId);
    const transportBindingId = readInvocationContextMetadataString(
      runtimeEnvelope.context,
      'transportBindingId',
    );
    if (attachedTarget.participantKind === 'orchestrator') {
      const sessionTarget = resolveOrchestratorExecutionTarget(
        nextState,
        requireChannel(nextState, channelId),
      );
      targetLabelProvider = sessionTarget.provider;
      targetLabelInstance = sessionTarget.instance ?? null;
      const session = await runtimeClient.createSession({
        provider: sessionTarget.provider,
        instance: sessionTarget.instance,
        model: sessionTarget.model,
        modelSelection:
          sessionTarget.modelSelection
          ?? createExplicitProviderModelSelection(sessionTarget.model),
        cwd: spawnCwd,
        workspaceKind,
        workspaceAccess: 'read_write',
        context: mergeRuntimeInvocationContextMetadata(
          runtimeEnvelope.context,
          options.dispatchContextMetadata ?? {},
        ),
        skills: runtimeEnvelope.skills,
        ...(taskExecutionContext?.executionRequest ?? {}),
      });
      const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
        channelId,
        repoPath: requireChannel(nextState, channelId).repoPath,
        chatCwd: requireChannel(nextState, channelId).chatCwd,
        runtimeDataDir: options.runtimeDataDir,
      });
      await syncChannelAttachmentsToWorkspace({
        attachmentWorkspacePath,
        targetWorkspacePath: session.cwd,
      });
      nextState = runtimeChannel.composerMode === 'solo' && runtimeChannel.pendingProvider
        ? setChannelPendingExecutionTarget(
          nextState,
          channelId,
          {
            provider: session.provider,
            instance: sessionTarget.instance,
            model: session.model ?? sessionTarget.model,
            modelSelection:
              session.modelSelection
              ?? sessionTarget.modelSelection
              ?? null,
          },
          now,
        )
        : setGlobalOrchestratorExecutionTarget(
          nextState,
          {
            provider: session.provider,
            instance: sessionTarget.instance,
            model: session.model ?? sessionTarget.model,
            modelSelection:
              session.modelSelection
              ?? sessionTarget.modelSelection
              ?? null,
          },
          now,
        );
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now, laneId);
      if (!spawnCwd && session.cwd) {
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(
            resolveVisibleWakeTargetLabel({
              target: attachedTarget,
              provider: session.provider,
              instance: sessionTarget.instance,
            }),
            session,
          ),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            conversationId,
            targetKind: 'orchestrator',
            ...(targetStateId ? { targetStateId } : {}),
            ...(laneId ? { laneId } : {}),
            ...(transportBindingId ? { transportBindingId } : {}),
            sessionId: session.id,
            verbosity: 'verbose',
          },
          incrementUnread: false,
        },
      ).state;
      return {
        state: nextState,
        target: { ...attachedTarget, laneId, sessionId: session.id },
        error: null,
        wakeRequest: recordTargetWake('completed'),
        taskExecutionContext,
      };
    }

    const participant = findAssignedParticipant(runtimeChannel, attachedTarget.participantId);
    if (!participant) {
      const error = 'Target participant is no longer assigned to the selected chat.';
      return {
        state,
        target: attachedTarget,
        error,
        wakeRequest: recordTargetWake('failed', error),
        taskExecutionContext,
      };
    }
    targetLabelProvider = participant.execution.target.provider;
    targetLabelInstance = participant.execution.target.instance ?? null;

    const session = await runtimeClient.createSession({
      provider: participant.execution.target.provider,
      instance: participant.execution.target.instance,
      model: participant.execution.target.model,
      modelSelection:
        participant.execution.modelSelection
        ?? createExplicitProviderModelSelection(participant.execution.target.model),
      cwd: spawnCwd,
      workspaceKind,
      workspaceAccess: 'read_write',
      context: mergeRuntimeInvocationContextMetadata(
        runtimeEnvelope.context,
        options.dispatchContextMetadata ?? {},
      ),
      skills: runtimeEnvelope.skills,
      ...(taskExecutionContext?.executionRequest ?? {}),
    });
    const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
      channelId,
      repoPath: requireChannel(nextState, channelId).repoPath,
      chatCwd: requireChannel(nextState, channelId).chatCwd,
      runtimeDataDir: options.runtimeDataDir,
    });
    await syncChannelAttachmentsToWorkspace({
      attachmentWorkspacePath,
      targetWorkspacePath: session.cwd,
    });
    nextState = setChannelParticipantExecutionTarget(
      nextState,
      channelId,
      attachedTarget.participantId,
      {
        provider: session.provider,
        instance: participant.execution.target.instance,
        model: session.model ?? participant.execution.target.model,
        modelSelection:
          session.modelSelection
          ?? participant.execution.modelSelection
          ?? null,
      },
      now,
    );
    nextState = setStartedSession(
      nextState,
      channelId,
      { participantId: attachedTarget.participantId },
      session,
      now,
      laneId,
    );
    if (!spawnCwd && session.cwd) {
      nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
    }
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: formatSessionStartedMessage(
            resolveVisibleWakeTargetLabel({
              target: attachedTarget,
              provider: session.provider,
              instance: participant.execution.target.instance,
            }),
          session,
        ),
      },
      now,
      {
        metadata: {
          event: 'session_started',
          conversationId,
          targetKind: 'cat',
          targetId: attachedTarget.participantId,
          ...(targetStateId ? { targetStateId } : {}),
          ...(laneId ? { laneId } : {}),
          ...(transportBindingId ? { transportBindingId } : {}),
          sessionId: session.id,
          verbosity: 'verbose',
        },
        incrementUnread: false,
      },
    ).state;
    return {
      state: nextState,
      target: { ...attachedTarget, laneId, sessionId: session.id },
      error: null,
      wakeRequest: recordTargetWake('completed'),
      taskExecutionContext,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    nextState = attachedTarget.participantKind === 'cat'
      ? setErroredSession(
        nextState,
        channelId,
        { participantId: attachedTarget.participantId },
        message,
        now,
      )
      : setErroredSession(nextState, channelId, 'orchestrator', message, now);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: `Failed to start ${resolveVisibleWakeTargetLabel({
          target: attachedTarget,
          provider: targetLabelProvider,
          instance: targetLabelInstance,
        })}: ${message}`,
      },
      now,
      {
        metadata: {
          event: 'session_start_failed',
          targetKind: attachedTarget.participantKind,
          targetId: attachedTarget.participantId,
          ...(targetStateId ? { targetStateId } : {}),
          ...(laneId ? { laneId } : {}),
        },
      },
    ).state;
    return {
      state: nextState,
      target: attachedTarget,
      error: message,
      wakeRequest: recordTargetWake('failed', message),
      taskExecutionContext,
    };
  }
}

export async function wakeChannelEntryParticipant(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RuntimeSessionRoutingOptions = {},
): Promise<{
  state: ChatState;
  result: ChannelActivationResult | null;
}> {
  let nextState = state;
  const roomRouting = resolveRoomRoutingState(requireChannel(nextState, channelId).roomRouting);
  const defaultTarget = resolveRoomDefaultRoutingTarget(nextState, channelId);

  if (!defaultTarget.target) {
    if (defaultTarget.participant) {
      createRecordedWakeRequest(
        roomRouting,
        defaultTarget.participant,
        'room_entry',
        'room_entry',
        null,
        now.toISOString(),
        'failed',
        defaultTarget.note ?? `No ${ORCHESTRATOR_NAME} room entry participant could be woken.`,
      );
      nextState = setChannelRoomRouting(nextState, channelId, roomRouting, now);
    }
    return {
      state: nextState,
      result: defaultTarget.participant
        ? {
            targetKind: defaultTarget.participant.participantKind,
            targetId: defaultTarget.participant.participantId,
            targetName: defaultTarget.participant.participantName,
            laneId: null,
            status: 'error',
            sessionId: null,
            error: defaultTarget.note ?? 'No room entry participant could be woken.',
          }
        : null,
    };
  }

  const target = defaultTarget.target;
  const existingAttachment = resolveTargetLeaseAttachment(
    nextState,
    channelId,
    target,
    {
      preferredLaneId: target.laneId?.trim() || null,
    },
  );
  if (existingAttachment.sessionId) {
    nextState = ensureChannelMarkedActive(nextState, channelId, now);
    return {
      state: nextState,
      result: {
        targetKind: target.participantKind,
        targetId: target.participantId,
        targetName: target.participantName,
        laneId: existingAttachment.laneId,
        status: 'already_started',
        sessionId: existingAttachment.sessionId,
      },
    };
  }

  const ensured = await ensureTargetSession(
    nextState,
    channelId,
    target,
    runtimeClient,
    now,
    {
      companionStore: options.companionStore,
      memoryService: options.memoryService,
      forceReviveClosedSessions: options.forceReviveClosedSessions,
      roomRouting,
      wakeTrigger: 'room_entry',
      wakeReason: 'room_entry',
    },
  );
  nextState = ensured.state;
  nextState = setChannelRoomRouting(nextState, channelId, roomRouting, now);

  if (ensured.error) {
    return {
      state: nextState,
      result: {
        targetKind: target.participantKind,
        targetId: target.participantId,
        targetName: target.participantName,
        laneId: ensured.target.laneId,
        status: 'error',
        sessionId: null,
        error: ensured.error,
      },
    };
  }

  nextState = ensureChannelMarkedActive(nextState, channelId, now);
  return {
    state: nextState,
    result: {
      targetKind: ensured.target.participantKind,
      targetId: ensured.target.participantId,
      targetName: ensured.target.participantName,
      laneId: ensured.target.laneId,
      status: ensured.wakeRequest?.status === 'skipped' ? 'already_started' : 'started',
      sessionId: ensured.target.sessionId,
    },
  };
}
