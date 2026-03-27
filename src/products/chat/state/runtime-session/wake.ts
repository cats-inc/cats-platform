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
import {
  ORCHESTRATOR_NAME,
  appendMessage,
  buildChannelView,
  requireChannel,
  setChannelChatCwd,
  setChannelOrchestratorLease,
  setChannelRoomRouting,
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
  clearTargetSessionLease,
  ensureChannelMarkedActive,
  markTargetWaking,
  resolveActorIdForTarget,
  setErroredSession,
  setStartedSession,
  spawnCwdFor,
  toParticipantRef,
} from './state.js';
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
  runtimeClient: RuntimeClient,
  forceReviveClosedSessions: boolean,
): Promise<boolean> {
  if (!target.sessionId) {
    return false;
  }

  const channel = requireChannel(state, channelId);
  const lease = target.participantKind === 'cat'
    ? channel.catAssignments.find((assignment) =>
        assignment.catId === target.participantId)?.execution.lease ?? null
    : channel.orchestratorLease;

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
    const observed = await runtimeClient.observeSession(target.sessionId);
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
  const participant = toParticipantRef(target);
  const taskExecutionContext = await resolveChannelTaskExecutionRequest(
    options.chatStore,
    channelId,
    target,
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

  if (target.sessionId) {
    if (await shouldReviveExistingTargetSession(
      state,
      channelId,
      target,
      runtimeClient,
      options.forceReviveClosedSessions ?? false,
    )) {
      const resetState = clearTargetSessionLease(
        state,
        channelId,
        target.participantKind === 'cat' ? { catId: target.participantId } : 'orchestrator',
        now,
      );
      return ensureTargetSession(
        resetState,
        channelId,
        { ...target, sessionId: null },
        runtimeClient,
        now,
        options,
      );
    }

    if (target.participantKind === 'orchestrator') {
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
          sessionId: target.sessionId,
          requestedPhase: 'pre_reset',
          memoryService: options.memoryService,
          companionStore: options.companionStore,
          coreStore: options.chatStore,
          now,
        });
        await runtimeClient.closeSession(target.sessionId);
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
          { ...target, sessionId: null },
          runtimeClient,
          now,
          options,
        );
      }
    }

    return {
      state,
      target,
      error: null,
      wakeRequest: recordTargetWake('skipped'),
      taskExecutionContext,
    };
  }

  const channel = buildChannelView(state, channelId);
  const spawnCwd = spawnCwdFor(requireChannel(state, channelId));
  const workspaceKind = spawnCwd ? 'source' : 'sandbox';
  let nextState = state;

  try {
    nextState = markTargetWaking(nextState, channelId, target, now);
    const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
      nextState,
      channel,
      target,
      options.transport,
      now,
      options.companionStore,
    );
    if (target.participantKind === 'orchestrator') {
      const sessionTarget = resolveOrchestratorExecutionTarget(
        nextState,
        requireChannel(nextState, channelId),
      );
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
        context: runtimeEnvelope.context,
        skills: runtimeEnvelope.skills,
        ...(taskExecutionContext?.executionRequest ?? {}),
      });
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now);
      // TODO(room-workspace): stop promoting participant session cwd into
      // channel-level workspace authority; bootstrap a room-owned workspace
      // explicitly before spawning shared participants.
      if (!spawnCwd && session.cwd) {
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(target.participantName, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'orchestrator',
            sessionId: session.id,
            verbosity: 'verbose',
          },
          incrementUnread: false,
        },
      ).state;
      return {
        state: nextState,
        target: { ...target, sessionId: session.id },
        error: null,
        wakeRequest: recordTargetWake('completed'),
        taskExecutionContext,
      };
    }

    const cat = channel.assignedCats.find((candidate) => candidate.catId === target.participantId);
    if (!cat) {
      const error = 'Target cat is no longer assigned to the selected chat.';
      return {
        state,
        target,
        error,
        wakeRequest: recordTargetWake('failed', error),
        taskExecutionContext,
      };
    }

    const session = await runtimeClient.createSession({
      provider: cat.execution.target.provider,
      instance: cat.execution.target.instance,
      model: cat.execution.target.model,
      modelSelection:
        cat.execution.modelSelection
        ?? createExplicitProviderModelSelection(cat.execution.target.model),
      cwd: spawnCwd,
      workspaceKind,
      workspaceAccess: 'read_write',
      context: runtimeEnvelope.context,
      skills: runtimeEnvelope.skills,
      ...(taskExecutionContext?.executionRequest ?? {}),
    });
    nextState = setStartedSession(
      nextState,
      channelId,
      { catId: target.participantId },
      session,
      now,
    );
    // TODO(room-workspace): stop promoting participant session cwd into
    // channel-level workspace authority; bootstrap a room-owned workspace
    // explicitly before spawning shared participants.
    if (!spawnCwd && session.cwd) {
      nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
    }
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: formatSessionStartedMessage(target.participantName, session),
      },
      now,
      {
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: target.participantId,
          sessionId: session.id,
          verbosity: 'verbose',
        },
        incrementUnread: false,
      },
    ).state;
    return {
      state: nextState,
      target: { ...target, sessionId: session.id },
      error: null,
      wakeRequest: recordTargetWake('completed'),
      taskExecutionContext,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    nextState = target.participantKind === 'cat'
      ? setErroredSession(nextState, channelId, { catId: target.participantId }, message, now)
      : setErroredSession(nextState, channelId, 'orchestrator', message, now);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: `Failed to start ${target.participantName}: ${message}`,
      },
      now,
      {
        metadata: {
          event: 'session_start_failed',
          targetKind: target.participantKind,
          targetId: target.participantId,
        },
      },
    ).state;
    return {
      state: nextState,
      target,
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
            status: 'error',
            sessionId: null,
            error: defaultTarget.note ?? 'No room entry participant could be woken.',
          }
        : null,
    };
  }

  const target = defaultTarget.target;
  if (target.sessionId) {
    nextState = ensureChannelMarkedActive(nextState, channelId, now);
    return {
      state: nextState,
      result: {
        targetKind: target.participantKind,
        targetId: target.participantId,
        targetName: target.participantName,
        status: 'already_started',
        sessionId: target.sessionId,
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
      status: ensured.wakeRequest?.status === 'skipped' ? 'already_started' : 'started',
      sessionId: ensured.target.sessionId,
    },
  };
}
