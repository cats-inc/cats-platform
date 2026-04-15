import type {
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
  buildChannelView,
  requireChannel,
  setChannelParticipantLease,
  setChannelParticipantExecutionTarget,
  setChannelChatCwd,
  setChannelOrchestratorLease,
  setChannelPendingExecutionTarget,
  setGlobalOrchestratorExecutionTarget,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { createRecordedWakeRequest } from '../room-routing/wake.js';
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
  resolveOrchestratorLeaseAttachment,
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import {
  ensureChannelAttachmentWorkspace,
  syncChannelAttachmentsToWorkspace,
} from '../workspace.js';
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
import {
  appendFailedRuntimeSessionMessage,
  appendStartedRuntimeSessionMessage,
  readInvocationContextMetadataString,
  resolveTargetLeaseAttachment,
  resolveRuntimeEnvelopeCanonicalMetadata,
  type RuntimeEnvelopeCanonicalMetadata,
  type RuntimeSessionRoutingOptions,
} from './shared.js';

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
    ? resolveParticipantLeaseAttachment(channel, target.participantId)
    : resolveOrchestratorLeaseAttachment(channel);

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

function readDispatchContextMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

type EnsureTargetSessionTaskExecutionContext =
  Awaited<ReturnType<typeof resolveChannelTaskExecutionRequest>>;

type EnsureTargetSessionOptions = RuntimeSessionRoutingOptions & {
  roomRouting?: RoomRoutingState | null;
  wakeTrigger?: RoomWakeTrigger;
  wakeReason?: RoomWakeReason;
  sourceMessageId?: string | null;
  ignoreLeaseSessionAttachment?: boolean;
  resolvedTaskExecutionContext?: EnsureTargetSessionTaskExecutionContext | null;
};

type EnsureTargetWakeRecorder = (
  status: RoomWakeRequest['status'],
  error?: string | null,
) => RoomWakeRequest | null;

interface EnsureTargetSessionResult {
  state: ChatState;
  target: RoutingTarget;
  error: string | null;
  wakeRequest: RoomWakeRequest | null;
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext;
}

type ExistingTargetSessionOutcome =
  | {
      kind: 'continue';
    }
  | {
      kind: 'retry';
      state: ChatState;
      target: RoutingTarget;
    }
  | {
      kind: 'resolved';
      result: EnsureTargetSessionResult;
    };

interface ResolvedTargetRuntimeEnvelope {
  runtimeEnvelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>;
  canonicalMetadata: RuntimeEnvelopeCanonicalMetadata;
}

interface TargetSessionLifecycleMetadata extends RuntimeEnvelopeCanonicalMetadata {
  targetStateId: string | null;
  laneId: string | null;
  now: Date;
}

interface RuntimeSessionExecutionTarget {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection: Awaited<ReturnType<RuntimeClient['createSession']>>['modelSelection'] | null;
}

interface CreatedTargetRuntimeSession {
  session: Awaited<ReturnType<RuntimeClient['createSession']>>;
  executionTarget: RuntimeSessionExecutionTarget;
}

interface PreparedTargetSessionWake {
  attachedTarget: RoutingTarget;
  targetStateId: string | null;
  laneId: string | null;
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext;
  recordTargetWake: EnsureTargetWakeRecorder;
}

async function resolveTargetRuntimeEnvelope(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  options: EnsureTargetSessionOptions;
  now: Date;
}): Promise<ResolvedTargetRuntimeEnvelope> {
  const runtimeChannel = buildChannelView(input.state, input.channelId);
  const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
    input.state,
    runtimeChannel,
    input.target,
    input.options.transport,
    input.options.transportBindingId,
    input.now,
    input.options.companionStore,
  );

  return {
    runtimeEnvelope,
      canonicalMetadata: resolveRuntimeEnvelopeCanonicalMetadata(
        input.state,
        input.channelId,
        runtimeEnvelope.context,
      ),
  };
}

async function syncTargetSessionAttachmentWorkspace(input: {
  channelId: string;
  state: ChatState;
  runtimeDataDir: string | undefined;
  targetWorkspacePath: string | null;
}): Promise<void> {
  if (!input.targetWorkspacePath) {
    return;
  }

  const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
    channelId: input.channelId,
    repoPath: requireChannel(input.state, input.channelId).repoPath,
    chatCwd: requireChannel(input.state, input.channelId).chatCwd,
    runtimeDataDir: input.runtimeDataDir,
  });
  await syncChannelAttachmentsToWorkspace({
    attachmentWorkspacePath,
    targetWorkspacePath: input.targetWorkspacePath,
  });
}

async function createOrchestratorTargetRuntimeSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  spawnCwd: string | null;
  workspaceKind: 'source' | 'sandbox';
  runtimeClient: RuntimeClient;
  options: EnsureTargetSessionOptions;
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext;
  runtimeEnvelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>;
}): Promise<CreatedTargetRuntimeSession> {
  const sessionTarget = resolveOrchestratorExecutionTarget(
    input.state,
    requireChannel(input.state, input.channelId),
  );
  const session = await input.runtimeClient.createSession({
    provider: sessionTarget.provider,
    instance: sessionTarget.instance,
    model: sessionTarget.model,
    modelSelection:
      sessionTarget.modelSelection
      ?? createExplicitProviderModelSelection(sessionTarget.model),
    cwd: input.spawnCwd,
    workspaceKind: input.workspaceKind,
    workspaceAccess: 'read_write',
    context: mergeRuntimeInvocationContextMetadata(
      input.runtimeEnvelope.context,
      input.options.dispatchContextMetadata ?? {},
    ),
    skills: input.runtimeEnvelope.skills,
    ...(input.taskExecutionContext?.executionRequest ?? {}),
  });

  return {
    session,
    executionTarget: {
      provider: session.provider,
      instance: sessionTarget.instance ?? null,
      model: session.model ?? sessionTarget.model,
      modelSelection:
        session.modelSelection
        ?? sessionTarget.modelSelection
        ?? null,
    },
  };
}

async function createParticipantTargetRuntimeSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  spawnCwd: string | null;
  workspaceKind: 'source' | 'sandbox';
  runtimeClient: RuntimeClient;
  options: EnsureTargetSessionOptions;
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext;
  runtimeEnvelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>;
}): Promise<CreatedTargetRuntimeSession> {
  const participant = findAssignedParticipant(
    buildChannelView(input.state, input.channelId),
    input.target.participantId,
  );
  if (!participant) {
    throw new Error('Target participant is no longer assigned to the selected chat.');
  }

  const session = await input.runtimeClient.createSession({
    provider: participant.execution.target.provider,
    instance: participant.execution.target.instance,
    model: participant.execution.target.model,
    modelSelection:
      participant.execution.modelSelection
      ?? createExplicitProviderModelSelection(participant.execution.target.model),
    cwd: input.spawnCwd,
    workspaceKind: input.workspaceKind,
    workspaceAccess: 'read_write',
    context: mergeRuntimeInvocationContextMetadata(
      input.runtimeEnvelope.context,
      input.options.dispatchContextMetadata ?? {},
    ),
    skills: input.runtimeEnvelope.skills,
    ...(input.taskExecutionContext?.executionRequest ?? {}),
  });

  return {
    session,
    executionTarget: {
      provider: session.provider,
      instance: participant.execution.target.instance ?? null,
      model: session.model ?? participant.execution.target.model,
      modelSelection:
        session.modelSelection
        ?? participant.execution.modelSelection
        ?? null,
    },
  };
}

function persistCreatedTargetExecutionTarget(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  executionTarget: RuntimeSessionExecutionTarget;
  now: Date;
}): ChatState {
  if (input.target.participantKind === 'orchestrator') {
    const runtimeChannel = requireChannel(input.state, input.channelId);
    return runtimeChannel.composerMode === 'solo' && runtimeChannel.pendingProvider
      ? setChannelPendingExecutionTarget(
        input.state,
        input.channelId,
        input.executionTarget,
        input.now,
      )
      : setGlobalOrchestratorExecutionTarget(
        input.state,
        input.executionTarget,
        input.now,
      );
  }

  return setChannelParticipantExecutionTarget(
    input.state,
    input.channelId,
    input.target.participantId,
    input.executionTarget,
    input.now,
  );
}

function persistStartedTargetSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  session: Awaited<ReturnType<RuntimeClient['createSession']>>;
  targetLabelProvider: string | null;
  targetLabelInstance: string | null;
  spawnCwd: string | null;
  metadata: TargetSessionLifecycleMetadata;
}): ChatState {
  let nextState = setStartedSession(
    input.state,
    input.channelId,
    input.target.participantKind === 'cat'
      ? { participantId: input.target.participantId }
      : 'orchestrator',
    input.session,
    input.metadata.now,
    input.metadata.laneId,
  );
  if (!input.spawnCwd && input.session.cwd) {
    nextState = setChannelChatCwd(
      nextState,
      input.channelId,
      input.session.cwd,
      input.metadata.now,
    );
  }

  return appendStartedRuntimeSessionMessage(
    nextState,
    input.channelId,
    {
      target: input.target,
      provider: input.targetLabelProvider,
      instance: input.targetLabelInstance,
      session: input.session,
      now: input.metadata.now,
      targetStateId: input.metadata.targetStateId,
      laneId: input.metadata.laneId,
      conversationId: input.metadata.conversationId,
      containerId: input.metadata.containerId,
      transportBindingId: input.metadata.transportBindingId,
      incrementUnread: false,
    },
  );
}

function persistFailedTargetSessionStart(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  error: string;
  targetLabelProvider: string | null;
  targetLabelInstance: string | null;
  metadata: TargetSessionLifecycleMetadata;
}): ChatState {
  const erroredState = input.target.participantKind === 'cat'
    ? setErroredSession(
      input.state,
      input.channelId,
      { participantId: input.target.participantId },
      input.error,
      input.metadata.now,
    )
    : setErroredSession(
      input.state,
      input.channelId,
      'orchestrator',
      input.error,
      input.metadata.now,
    );

  return appendFailedRuntimeSessionMessage(
    erroredState,
    input.channelId,
    {
      target: input.target,
      provider: input.targetLabelProvider,
      instance: input.targetLabelInstance,
      error: input.error,
      now: input.metadata.now,
      targetStateId: input.metadata.targetStateId,
      laneId: input.metadata.laneId,
      conversationId: input.metadata.conversationId,
      containerId: input.metadata.containerId,
      transportBindingId: input.metadata.transportBindingId,
    },
  );
}

function applyLeaseLaneAttachmentToTarget(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  laneId: string | null,
  now: Date,
): ChatState {
  if (!laneId) {
    return state;
  }

  return target.participantKind === 'cat'
    ? setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      { laneId },
      now,
    )
    : setChannelOrchestratorLease(
      state,
      channelId,
      { laneId },
      now,
    );
}

async function prepareTargetSessionWake(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  nowIso: string;
  options: EnsureTargetSessionOptions;
  wakeTrigger: RoomWakeTrigger;
  wakeReason: RoomWakeReason;
  sourceMessageId: string | null;
}): Promise<PreparedTargetSessionWake> {
  const targetStateId = readDispatchContextMetadataString(
    input.options.dispatchContextMetadata,
    'targetStateId',
  );
  const laneId = readDispatchContextMetadataString(
    input.options.dispatchContextMetadata,
    'laneId',
  ) ?? (input.target.laneId?.trim() || null);
  const targetAttachment = resolveTargetLeaseAttachment(
    input.state,
    input.channelId,
    input.target,
    {
      preferredLaneId: laneId,
      allowLeaseSessionReuse: input.options.ignoreLeaseSessionAttachment !== true,
    },
  );
  const attachedTarget: RoutingTarget = {
    ...input.target,
    ...targetAttachment,
    laneId: targetAttachment.laneId,
  };
  const participant = toParticipantRef(attachedTarget);
  const taskExecutionContext = input.options.resolvedTaskExecutionContext !== undefined
    ? input.options.resolvedTaskExecutionContext
    : await resolveChannelTaskExecutionRequest(
      input.options.chatStore,
      input.channelId,
      attachedTarget,
    );

  return {
    attachedTarget,
    targetStateId,
    laneId,
    taskExecutionContext: taskExecutionContext ?? undefined,
    recordTargetWake: (
      status: RoomWakeRequest['status'],
      error: string | null = null,
    ) => createRecordedWakeRequest(
      input.options.roomRouting,
      participant,
      input.wakeTrigger,
      input.wakeReason,
      input.sourceMessageId,
      input.nowIso,
      status,
      error,
    ),
  };
}

async function resolveExistingTargetSessionOutcome(
  state: ChatState,
  channelId: string,
  attachedTarget: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
  options: EnsureTargetSessionOptions,
  laneId: string | null,
  recordTargetWake: EnsureTargetWakeRecorder,
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext,
): Promise<ExistingTargetSessionOutcome> {
  if (!attachedTarget.sessionId) {
    return { kind: 'continue' };
  }

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
    return {
      kind: 'retry',
      state: resetState,
      target: { ...attachedTarget, sessionId: null },
    };
  }

  if (attachedTarget.participantKind === 'orchestrator') {
    const channelState = requireChannel(state, channelId);
    const executionTarget = resolveOrchestratorExecutionTarget(state, channelState);
    const orchestratorLease = resolveOrchestratorLeaseAttachment(channelState);
    const shouldRestartSoloSession = channelState.composerMode === 'solo'
      && (
        orchestratorLease?.provider !== executionTarget.provider
        || orchestratorLease?.model !== executionTarget.model
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
          lastUsedAt: orchestratorLease?.lastUsedAt ?? null,
        },
        now,
      );
      return {
        kind: 'retry',
        state: resetState,
        target: { ...attachedTarget, sessionId: null },
      };
    }
  }

  return {
    kind: 'resolved',
    result: {
      state: applyLeaseLaneAttachmentToTarget(state, channelId, attachedTarget, laneId, now),
      target: attachedTarget,
      error: null,
      wakeRequest: recordTargetWake('skipped'),
      taskExecutionContext,
    },
  };
}

async function startAttachedTargetSession(
  state: ChatState,
  channelId: string,
  attachedTarget: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
  options: EnsureTargetSessionOptions,
  targetStateId: string | null,
  laneId: string | null,
  recordTargetWake: EnsureTargetWakeRecorder,
  taskExecutionContext: EnsureTargetSessionTaskExecutionContext,
): Promise<EnsureTargetSessionResult> {
  let nextState = state;
  const spawnCwd = spawnCwdFor(requireChannel(nextState, channelId));
  const workspaceKind = spawnCwd ? 'source' : 'sandbox';
  let createdExecutionTarget: RuntimeSessionExecutionTarget | null = null;
  const sessionLifecycleMetadata: TargetSessionLifecycleMetadata = {
    targetStateId,
    laneId,
    conversationId: null,
    containerId: null,
    transportBindingId: null,
    now,
  };

  try {
    nextState = markTargetWaking(nextState, channelId, attachedTarget, now, laneId);
    const {
      runtimeEnvelope,
      canonicalMetadata,
    } = await resolveTargetRuntimeEnvelope({
      state: nextState,
      channelId,
      target: attachedTarget,
      options,
      now,
    });
    sessionLifecycleMetadata.conversationId = canonicalMetadata.conversationId;
    sessionLifecycleMetadata.containerId = canonicalMetadata.containerId;
    sessionLifecycleMetadata.transportBindingId = canonicalMetadata.transportBindingId;

    const createdTargetSession = attachedTarget.participantKind === 'orchestrator'
      ? await createOrchestratorTargetRuntimeSession({
        state: nextState,
        channelId,
        target: attachedTarget,
        spawnCwd,
        workspaceKind,
        runtimeClient,
        options,
        taskExecutionContext,
        runtimeEnvelope,
      })
      : await createParticipantTargetRuntimeSession({
        state: nextState,
        channelId,
        target: attachedTarget,
        spawnCwd,
        workspaceKind,
        runtimeClient,
        options,
        taskExecutionContext,
        runtimeEnvelope,
      });
    createdExecutionTarget = createdTargetSession.executionTarget;
    nextState = persistCreatedTargetExecutionTarget({
      state: nextState,
      channelId,
      target: attachedTarget,
      executionTarget: createdExecutionTarget,
      now,
    });

    await syncTargetSessionAttachmentWorkspace({
      channelId,
      state: nextState,
      runtimeDataDir: options.runtimeDataDir,
      targetWorkspacePath: createdTargetSession.session.cwd,
    });
    nextState = persistStartedTargetSession({
      state: nextState,
      channelId,
      target: attachedTarget,
      session: createdTargetSession.session,
      targetLabelProvider: createdExecutionTarget.provider,
      targetLabelInstance: createdExecutionTarget.instance,
      spawnCwd,
      metadata: sessionLifecycleMetadata,
    });

    return {
      state: nextState,
      target: {
        ...attachedTarget,
        laneId,
        sessionId: createdTargetSession.session.id,
      },
      error: null,
      wakeRequest: recordTargetWake('completed'),
      taskExecutionContext,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    nextState = persistFailedTargetSessionStart({
      state: nextState,
      channelId,
      target: attachedTarget,
      error: message,
      targetLabelProvider: createdExecutionTarget?.provider ?? null,
      targetLabelInstance: createdExecutionTarget?.instance ?? null,
      metadata: sessionLifecycleMetadata,
    });

    return {
      state: nextState,
      target: attachedTarget,
      error: message,
      wakeRequest: recordTargetWake('failed', message),
      taskExecutionContext,
    };
  }
}

export async function ensureTargetSession(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
  options: EnsureTargetSessionOptions = {},
): Promise<EnsureTargetSessionResult> {
  const nowIso = now.toISOString();
  const wakeTrigger = options.wakeTrigger ?? 'route_target';
  const wakeReason = options.wakeReason ?? 'room_default';
  const sourceMessageId = options.sourceMessageId ?? null;
  const preparedWake = await prepareTargetSessionWake({
    state,
    channelId,
    target,
    nowIso,
    options,
    wakeTrigger,
    wakeReason,
    sourceMessageId,
  });
  const existingSessionOutcome = await resolveExistingTargetSessionOutcome(
    state,
    channelId,
    preparedWake.attachedTarget,
    runtimeClient,
    now,
    options,
    preparedWake.laneId,
    preparedWake.recordTargetWake,
    preparedWake.taskExecutionContext,
  );
  if (existingSessionOutcome.kind === 'retry') {
    return ensureTargetSession(
      existingSessionOutcome.state,
      channelId,
      existingSessionOutcome.target,
      runtimeClient,
      now,
      {
        ...options,
        resolvedTaskExecutionContext: preparedWake.taskExecutionContext ?? null,
      },
    );
  }
  if (existingSessionOutcome.kind === 'resolved') {
    return existingSessionOutcome.result;
  }

  return startAttachedTargetSession(
    state,
    channelId,
    preparedWake.attachedTarget,
    runtimeClient,
    now,
    options,
    preparedWake.targetStateId,
    preparedWake.laneId,
    preparedWake.recordTargetWake,
    preparedWake.taskExecutionContext,
  );
}
