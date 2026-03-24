import { randomUUID } from 'node:crypto';

import type {
  ChannelActivationResult,
  ChannelDispatchResult,
  MessageUsageSummary,
  SendChannelMessageInput,
  ChatChannelCat,
  ChatChannelState,
  ChatChannelView,
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type {
  ParticipantSessionStatus,
  RoomRouteResolution,
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomWorkflowEvent,
  RoomWorkflowBranchStrategy,
  RoomWorkflowEventKind,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTargetStatus,
  RoomWorkflowTurn,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeTrigger,
} from '../../../shared/roomRouting.js';
import type {
  CompanionBoxStore,
} from './companionBoxStore.js';
import type { ChatStore } from './store.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../platform/memory/runtimeMaintenance.js';
import type {
  RuntimeClient,
  RuntimeSessionInfo,
  RuntimeSkillManifest,
} from '../../../platform/runtime/client.js';
import {
  checkoutTaskExecution,
  startTaskRunWatcher,
} from '../../../core/taskLifecycle.js';
import {
  createCatActorId,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
} from '../../../core/model.js';
import { shouldHydrateCompanionSession } from '../companion/hydration.js';
import { resolveSkillProfileManifest } from '../../../shared/skillProfiles.js';
import {
  ORCHESTRATOR_NAME,
  appendMessage,
  buildChannelView,
  requireChannel,
  requireCat,
  resolveOrchestratorDisplayName,
  setChannelPendingExecutionTarget,
  setChannelOrchestratorLease,
  setChannelCatLease,
  setChannelRoomRouting,
  setChannelStatus,
  setChannelChatCwd,
} from './model.js';
import { refreshDerivedMemoryLayers } from './memoryLayers.js';
import {
  resolveRoomDefaultRoutingTarget,
  type RoutingTarget,
} from './mentionRouter.js';
import {
  buildOrchestratorPrompt,
  buildOrchestratorRewritePrompt,
  buildCatPrompt,
  MAX_PROMPT_RECENT_MESSAGES,
} from './prompts.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from './roomRouting.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createPendingDispatch,
  createRecordedWakeRequest,
  createRoomRoutingSnapshot,
  createRoutingOutcome,
  createWorkflowEvent,
  createWorkflowTurn,
  deriveTerminalTurnStatuses,
  finalizeWorkflowTurn,
  mergeUnresolvedMentions,
  queueWorkflowTarget,
  resolveTargets,
  resolveWakeReasonFromRoutingTrigger,
  resolveWorkflowBranchStrategy,
  resolveWorkflowHandoffReason,
  type DispatchFrame,
  type DispatchRequest,
  type TargetResolution,
  updateDispatch,
  updateWorkflowTarget,
  workflowShapeForTargets,
  workflowStageIdForTrigger,
} from './roomRoutingRuntime.js';
import { formatSessionStartedMessage } from './runtimeMessages.js';

interface DispatchExecution extends DispatchRequest {
  responseBody: string | null;
  usage: MessageUsageSummary | null;
  error: string | null;
}

type RuntimeTransportContext = 'telegram' | 'web';

interface RouteChannelMessageOptions {
  transport?: RuntimeTransportContext;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
}

const MAX_RECENT_CONTEXT_MESSAGES = MAX_PROMPT_RECENT_MESSAGES;

function normalizePendingTargetValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeRuntimeStatus(status: string | undefined): ParticipantSessionStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'closed':
      return 'closed';
    case 'error':
      return 'error';
    default:
      return 'initializing';
  }
}

function spawnCwdFor(channel: ChatChannelState): string | null {
  return channel.repoPath ?? channel.chatCwd ?? null;
}

function activeAssignedCats(channel: { assignedCats: ChatChannelCat[] }) {
  return channel.assignedCats.filter((cat) => cat.status === 'active');
}

function shouldRewriteOrchestratorReply(
  content: string,
  orchestratorName: string,
  channel: ChatChannelView,
): boolean {
  if (activeAssignedCats(channel).length > 0) {
    return false;
  }

  const normalized = content.toLowerCase();
  return normalized.includes(`@${orchestratorName.toLowerCase()}`)
    || normalized.includes(`@${ORCHESTRATOR_NAME.toLowerCase()}`);
}

function participantKey(participant: RoomRoutingParticipantRef | RoutingTarget): string {
  return `${participant.participantKind}:${participant.participantId}`;
}

function toParticipantRef(target: RoutingTarget): RoomRoutingParticipantRef {
  return {
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  };
}

function resolveActorIdForTarget(target: RoutingTarget): string {
  return target.participantKind === 'orchestrator'
    ? GLOBAL_ORCHESTRATOR_ACTOR_ID
    : createCatActorId(target.participantId);
}

async function maybeAutoCheckoutChannelTask(
  chatStore: Pick<ChatStore, 'readCore' | 'writeCore'> | undefined,
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'streamSession'>,
  channelId: string,
  target: RoutingTarget,
  now: Date,
): Promise<void> {
  if (!chatStore || !target.sessionId) {
    return;
  }

  const core = await chatStore.readCore();
  const taskId = `task-channel-${channelId}`;
  const task = core.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.status !== 'approved') {
    return;
  }

  const actorId = resolveActorIdForTarget(target);
  if (!task.assignedActorIds.includes(actorId)) {
    return;
  }

  const checkout = checkoutTaskExecution({
    core,
    taskId,
    actorId,
    sessionId: target.sessionId,
    now,
  });
  const persisted = await chatStore.writeCore(checkout.core);
  const persistedTask = persisted.tasks.find((candidate) => candidate.id === checkout.task.id)
    ?? checkout.task;
  const persistedRun = persisted.runs.find((candidate) => candidate.id === checkout.run.id)
    ?? checkout.run;
  startTaskRunWatcher({
    chatStore,
    runtimeClient,
    taskId: persistedTask.id,
    runId: persistedRun.id,
    sessionId: target.sessionId,
    actorId,
  });
}

function setStartedSession(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { catId: string },
  session: RuntimeSessionInfo,
  now: Date,
): ChatState {
  const timestamp = now.toISOString();
  if (typeof target !== 'string') {
    return setChannelCatLease(
      state,
      channelId,
      target.catId,
      {
        sessionId: session.id,
        status: normalizeRuntimeStatus(session.status),
        cwd: session.cwd,
        lastError: null,
        provider: session.provider,
        model: session.model,
        startedAt: timestamp,
        lastUsedAt: timestamp,
      },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    {
      sessionId: session.id,
      status: normalizeRuntimeStatus(session.status),
      cwd: session.cwd,
      lastError: null,
      provider: session.provider,
      model: session.model,
      startedAt: timestamp,
      lastUsedAt: timestamp,
    },
    now,
  );
}

function setErroredSession(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { catId: string },
  message: string,
  now: Date,
): ChatState {
  if (typeof target !== 'string') {
    return setChannelCatLease(
      state,
      channelId,
      target.catId,
      {
        status: 'error',
        lastError: message,
      },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    {
      status: 'error',
      lastError: message,
    },
    now,
  );
}

function markTargetWaking(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  now: Date,
): ChatState {
  if (target.participantKind === 'cat') {
    return setChannelCatLease(
      state,
      channelId,
      target.participantId,
      { status: 'initializing', lastError: null },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    { status: 'initializing', lastError: null },
    now,
  );
}

function ensureChannelMarkedActive(
  state: ChatState,
  channelId: string,
  now: Date,
): ChatState {
  const channel = requireChannel(state, channelId);
  return channel.status === 'active'
    ? state
    : setChannelStatus(state, channelId, 'active', now);
}

function setReadyAfterMessage(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { catId: string },
  now: Date,
): ChatState {
  if (typeof target !== 'string') {
    return setChannelCatLease(
      state,
      channelId,
      target.catId,
      { status: 'ready', lastUsedAt: now.toISOString() },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    { status: 'ready', lastUsedAt: now.toISOString() },
    now,
  );
}

function buildOrchestratorTarget(
  state: ChatState,
  channel: ChatChannelView,
): RoutingTarget {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: resolveOrchestratorDisplayName(state),
    sessionId: channel.orchestratorLease.sessionId,
  };
}

function resolveOrchestratorExecutionTarget(state: ChatState, channel: ChatChannelState): {
  provider: string;
  model: string | null;
  instance: string | null;
} {
  if (channel.composerMode === 'solo' && channel.pendingProvider) {
    return {
      provider: channel.pendingProvider,
      instance: channel.pendingInstance ?? null,
      model: channel.pendingModel ?? null,
    };
  }

  return {
    provider: state.globalOrchestrator.executionTarget.provider,
    instance: state.globalOrchestrator.executionTarget.instance,
    model: state.globalOrchestrator.executionTarget.model,
  };
}

function resolveExecutionMetadataForTarget(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
): {
  provider: string | null;
  model: string | null;
  instance: string | null;
} {
  const channel = requireChannel(state, channelId);
  if (target.participantKind === 'orchestrator') {
    const executionTarget = resolveOrchestratorExecutionTarget(state, channel);
    return {
      provider: executionTarget.provider,
      model: executionTarget.model,
      instance: executionTarget.instance,
    };
  }

  const assignment = channel.catAssignments.find(
    (candidate) => candidate.catId === target.participantId && candidate.status === 'active',
  );
  return {
    provider: assignment?.execution.target.provider ?? null,
    model: assignment?.execution.target.model ?? null,
    instance: assignment?.execution.target.instance ?? null,
  };
}

function buildCatTarget(cat: ChatChannelCat): RoutingTarget {
  return {
    participantKind: 'cat',
    participantId: cat.catId,
    participantName: cat.name,
    sessionId: cat.execution.lease.sessionId,
  };
}

function resolveChoiceResponseTarget(
  state: ChatState,
  channel: ChatChannelView,
  sourceMessageId: string,
): RoutingTarget | null {
  const sourceMessage = channel.messages.find((message) => message.id === sourceMessageId);
  if (!sourceMessage) {
    return null;
  }

  const targetKind = sourceMessage.metadata.targetKind === 'orchestrator'
    || sourceMessage.metadata.targetKind === 'cat'
    ? sourceMessage.metadata.targetKind
    : sourceMessage.senderKind === 'orchestrator'
      ? 'orchestrator'
      : sourceMessage.senderKind === 'agent'
        ? 'cat'
        : null;

  if (targetKind === 'orchestrator') {
    return buildOrchestratorTarget(state, channel);
  }

  if (targetKind !== 'cat') {
    return null;
  }

  const targetId = typeof sourceMessage.metadata.targetId === 'string'
    ? sourceMessage.metadata.targetId
    : null;
  if (!targetId) {
    return null;
  }

  const cat = activeAssignedCats(channel).find((candidate) => candidate.catId === targetId);
  return cat ? buildCatTarget(cat) : null;
}

function resolveTransportContext(
  _channel: ChatChannelView,
  transport?: RuntimeTransportContext,
): RuntimeTransportContext {
  return transport ?? 'web';
}

function buildSessionContextForTarget(
  channel: ChatChannelView,
  target: RoutingTarget,
  transport?: RuntimeTransportContext,
): {
  source: 'interactive';
  reason: string;
  labels: string[];
  metadata: Record<string, unknown>;
} {
  const resolvedTransport = resolveTransportContext(channel, transport);
  return {
    source: 'interactive',
    reason: `cats:${channel.roomRouting?.mode ?? 'boss_chat'}`,
    labels: [
      `channel:${channel.id}`,
      `room-mode:${channel.roomRouting?.mode ?? 'boss_chat'}`,
      `transport:${resolvedTransport}`,
      `target:${target.participantKind}:${target.participantId}`,
    ],
    metadata: {
      channelId: channel.id,
      channelTitle: channel.title,
      roomMode: channel.roomRouting?.mode ?? 'boss_chat',
      leadParticipantId: channel.roomRouting?.leadParticipantId ?? null,
      transport: resolvedTransport,
      targetKind: target.participantKind,
      targetId: target.participantId,
    },
  };
}

function resolveSessionSkillManifestForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  transport?: RuntimeTransportContext,
): RuntimeSkillManifest | undefined {
  const resolvedTransport = resolveTransportContext(channel, transport);
  if (target.participantKind === 'orchestrator') {
    return resolveSkillProfileManifest({
      profileId: state.globalOrchestrator.skillProfile,
      roomMode: channel.roomRouting?.mode ?? 'boss_chat',
      transport: resolvedTransport,
      labels: ['participant:orchestrator'],
      metadata: {
        channelId: channel.id,
      },
    });
  }

  const cat = channel.assignedCats.find((candidate) => candidate.catId === target.participantId);
  return resolveSkillProfileManifest({
    profileId: cat?.skillProfile,
    catId: cat?.catId ?? target.participantId,
    roomMode: channel.roomRouting?.mode ?? 'boss_chat',
    transport: resolvedTransport,
    labels: ['participant:cat'],
    metadata: {
      channelId: channel.id,
      catName: cat?.name ?? target.participantName,
    },
  });
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function enrichInvocationContextWithCompanionSession(
  context: ReturnType<typeof buildSessionContextForTarget>,
  companionSession: Awaited<ReturnType<CompanionBoxStore['buildSessionContext']>> | null,
) {
  if (!companionSession) {
    return context;
  }

  return {
    ...context,
    labels: uniqueStrings([
      ...(context.labels ?? []),
      'companion-session',
      `companion-box:${companionSession.boxId}`,
    ]),
    metadata: {
      ...(context.metadata ?? {}),
      companionSession,
    },
  };
}

function enrichSkillManifestWithCompanionSession(
  manifest: RuntimeSkillManifest | undefined,
  companionSession: Awaited<ReturnType<CompanionBoxStore['buildSessionContext']>> | null,
): RuntimeSkillManifest | undefined {
  if (!manifest || !companionSession) {
    return manifest;
  }

  return {
    ...manifest,
    context: {
      ...manifest.context,
      labels: uniqueStrings([
        ...(manifest.context?.labels ?? []),
        'companion-session',
        `companion-box:${companionSession.boxId}`,
      ]),
      metadata: {
        ...(manifest.context?.metadata ?? {}),
        companionSession,
      },
    },
  };
}

async function resolveCompanionSessionForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  skillManifest: RuntimeSkillManifest | undefined,
  companionStore: CompanionBoxStore | undefined,
  transport: RuntimeTransportContext | undefined,
  now: Date,
) {
  if (!companionStore || target.participantKind !== 'cat') {
    return null;
  }

  const cat = requireCat(state, target.participantId);
  const summary = await companionStore.getBoxSummary(cat.id, now);
  if (!shouldHydrateCompanionSession(cat, summary.box, channel)) {
    return null;
  }

  return companionStore.buildSessionContext({
    cat,
    channel: {
      id: channel.id,
      title: channel.title,
      topic: channel.topic,
      workingMemory: channel.workingMemory,
      roomRouting: channel.roomRouting,
    },
    requestedSkills: skillManifest?.requestedSkills ?? [],
    transport: resolveTransportContext(channel, transport),
    now,
  });
}

async function resolveRuntimeEnvelopeForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  transport: RuntimeTransportContext | undefined,
  now: Date,
  companionStore?: CompanionBoxStore,
) {
  const baseContext = buildSessionContextForTarget(channel, target, transport);
  const baseSkills = resolveSessionSkillManifestForTarget(
    state,
    channel,
    target,
    transport,
  );
  const companionSession = await resolveCompanionSessionForTarget(
    state,
    channel,
    target,
    baseSkills,
    companionStore,
    transport,
    now,
  );

  return {
    context: enrichInvocationContextWithCompanionSession(baseContext, companionSession),
    skills: enrichSkillManifestWithCompanionSession(baseSkills, companionSession),
    companionSession,
  };
}

function applyRoomRoutingSnapshot(
  state: ChatState,
  channelId: string,
  baseRoomRouting: ReturnType<typeof resolveRoomRoutingState>,
  workflow: RoomWorkflowState,
  outcome: RoomRoutingOutcome | null,
  checkpoint: RoomRoutingCheckpoint | null,
  now: Date,
): ChatState {
  return setChannelRoomRouting(
    state,
    channelId,
    createRoomRoutingSnapshot(baseRoomRouting, workflow, outcome, checkpoint),
    now,
  );
}

function messageMatchesTarget(message: ChatMessage, target: RoutingTarget): boolean {
  if (target.participantKind === 'orchestrator') {
    return message.senderKind === 'orchestrator'
      && (
        message.senderName === target.participantName
        || message.metadata.targetKind === 'orchestrator'
      );
  }

  return message.senderKind === 'agent'
    && (
      message.senderName === target.participantName
      || message.metadata.targetId === target.participantId
    );
}

function sliceRecentContextForTarget(
  channel: ChatChannelView,
  target: RoutingTarget,
  sourceMessageId: string,
): ChatMessage[] {
  const sourceIndex = channel.messages.findIndex((message) => message.id === sourceMessageId);
  const boundedSourceIndex = sourceIndex === -1 ? channel.messages.length - 1 : sourceIndex;
  let lastOwnReplyIndex = -1;

  for (let index = boundedSourceIndex - 1; index >= 0; index -= 1) {
    if (messageMatchesTarget(channel.messages[index], target)) {
      lastOwnReplyIndex = index;
      break;
    }
  }

  const startIndex = Math.max(lastOwnReplyIndex + 1, 0);
  const relevantMessages = channel.messages.slice(startIndex, boundedSourceIndex + 1);
  return relevantMessages.slice(-MAX_RECENT_CONTEXT_MESSAGES);
}

function describeRoutingReason(
  channel: ChatChannelView,
  sourceParticipant: RoomRoutingParticipantRef | null,
  trigger: RoomRoutingTrigger,
): string {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  switch (trigger) {
    case 'room_default':
      if (roomRouting.mode === 'direct_cat_chat') {
        return 'System routing selected you because you are the lead cat for this room.';
      }
      return 'System routing selected you as the default room target for this turn.';
    case 'explicit_mention':
      return 'System routing selected you because the operator explicitly mentioned you.';
    case 'continuation_mention':
      return sourceParticipant
        ? `System routing selected you because ${sourceParticipant.participantName} explicitly mentioned you.`
        : 'System routing selected you because another participant explicitly mentioned you.';
    default:
      return 'System routing selected you for this turn.';
  }
}

function buildPromptForTarget(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  transport?: RuntimeTransportContext,
): string {
  const channel = buildChannelView(state, channelId);
  const recentMessages = sliceRecentContextForTarget(
    channel,
    request.target,
    request.sourceMessage.id,
  );
  const routingContext = {
    reason: describeRoutingReason(channel, request.sourceParticipant, request.trigger),
    recentMessages,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
    transport: resolveTransportContext(channel, transport),
  };

  if (request.target.participantKind === 'orchestrator') {
    return buildOrchestratorPrompt(
      channel,
      state.globalOrchestrator,
      request.sourceMessage,
      request.target.participantName,
      routingContext,
    );
  }

  const cat = channel.assignedCats.find(
    (candidate) => candidate.catId === request.target.participantId,
  );
  if (!cat) {
    throw new Error(`Target cat is no longer assigned to the selected chat: ${request.target.participantId}`);
  }

  return buildCatPrompt(
    channel,
    state.globalOrchestrator,
    cat,
    request.sourceMessage,
    routingContext,
  );
}

function describeGuardReason(reason: Exclude<RoomRoutingGuardReason, null>): string {
  switch (reason) {
    case 'max_continuations':
      return 'the continuation depth limit';
    case 'max_dispatches':
      return 'the per-turn dispatch limit';
    case 'max_target_visits':
      return 'the per-target revisit limit';
    case 'anti_ping_pong':
      return 'anti-ping-pong protection';
    default:
      return 'a routing guard';
  }
}

async function ensureTargetSession(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
  options: {
    transport?: RuntimeTransportContext;
    companionStore?: CompanionBoxStore;
    memoryService?: CatsMemoryService;
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
}> {
  const nowIso = now.toISOString();
  const wakeTrigger = options.wakeTrigger ?? 'route_target';
  const wakeReason = options.wakeReason ?? 'room_default';
  const sourceMessageId = options.sourceMessageId ?? null;
  const participant = toParticipantRef(target);
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
    };
  }

  const channel = buildChannelView(state, channelId);
  const spawnCwd = spawnCwdFor(requireChannel(state, channelId));
  const sharingMode = spawnCwd ? 'shared' : null;
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
        cwd: spawnCwd,
        sharingMode,
        context: runtimeEnvelope.context,
        skills: runtimeEnvelope.skills,
      });
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now);
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
      };
    }

    const session = await runtimeClient.createSession({
      provider: cat.execution.target.provider,
      instance: cat.execution.target.instance,
      model: cat.execution.target.model,
      cwd: spawnCwd,
      sharingMode,
      context: runtimeEnvelope.context,
      skills: runtimeEnvelope.skills,
    });
    nextState = setStartedSession(
      nextState,
      channelId,
      { catId: target.participantId },
      session,
      now,
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
    };
  }
}

export async function wakeChannelEntryParticipant(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: {
    companionStore?: CompanionBoxStore;
    memoryService?: CatsMemoryService;
  } = {},
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
        defaultTarget.note ?? 'No room entry participant could be woken.',
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

async function executeDispatch(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  runtimeClient: RuntimeClient,
  now: Date,
  transport?: RuntimeTransportContext,
  companionStore?: CompanionBoxStore,
): Promise<DispatchExecution> {
  try {
    const prompt = buildPromptForTarget(state, channelId, request, transport);
    const channel = buildChannelView(state, channelId);
    const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
      state,
      channel,
      request.target,
      transport,
      now,
      companionStore,
    );
    const runtimeResult = await runtimeClient.sendMessage(
      request.target.sessionId ?? '',
      prompt,
      {
        context: runtimeEnvelope.context,
        skills: runtimeEnvelope.skills,
      },
    );
    let responseBody = runtimeResult.content
      || `${request.target.participantName} completed the routed turn without text output.`;
    let usage: MessageUsageSummary | null = {
      inputTokens: runtimeResult.inputTokens,
      outputTokens: runtimeResult.outputTokens,
      tokensUsed: runtimeResult.tokensUsed,
    };

    if (request.target.participantKind === 'orchestrator') {
      if (
        shouldRewriteOrchestratorReply(
          responseBody,
          request.target.participantName,
          channel,
        )
      ) {
        try {
          const rewrite = await runtimeClient.sendMessage(
            request.target.sessionId ?? '',
            buildOrchestratorRewritePrompt(
              channel,
              request.sourceMessage,
              request.target.participantName,
              responseBody,
            ),
          );
          if (rewrite.content) {
            responseBody = rewrite.content;
          }
          usage = {
            inputTokens: (usage?.inputTokens ?? 0) + rewrite.inputTokens,
            outputTokens: (usage?.outputTokens ?? 0) + rewrite.outputTokens,
            tokensUsed: (usage?.tokensUsed ?? 0) + rewrite.tokensUsed,
          };
        } catch {
          // Keep the original draft if the repair pass fails.
        }
      }
    }

    return {
      ...request,
      responseBody,
      usage,
      error: null,
    };
  } catch (error) {
    return {
      ...request,
      responseBody: null,
      usage: null,
      error: error instanceof Error ? error.message : 'Unknown runtime error',
    };
  }
}

async function settleInCompletionOrder<T>(promises: Array<Promise<T>>): Promise<T[]> {
  const wrapped = promises.map((promise, index) =>
    promise.then((value) => ({ index, value })),
  );
  const pending = new Map(wrapped.map((promise, index) => [index, promise]));
  const results: T[] = [];

  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.index);
    results.push(settled.value);
  }

  return results;
}

function shouldBlockAntiPingPong(
  sourceParticipant: RoomRoutingParticipantRef,
  target: RoutingTarget,
  dispatches: RoomRoutingOutcome['dispatches'],
): boolean {
  const completedDispatches = dispatches.filter((dispatch) => dispatch.status === 'completed');
  if (completedDispatches.length < 2) {
    return false;
  }

  const lastDispatch = completedDispatches[completedDispatches.length - 1];
  const previousDispatch = completedDispatches[completedDispatches.length - 2];
  if (!lastDispatch.source || !previousDispatch.source) {
    return false;
  }

  return participantKey(previousDispatch.source) === participantKey(sourceParticipant)
    && participantKey(previousDispatch.target) === participantKey(target)
    && participantKey(lastDispatch.source) === participantKey(target)
    && participantKey(lastDispatch.target) === participantKey(sourceParticipant);
}

export async function activateChannelSessions(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: {
    companionStore?: CompanionBoxStore;
    memoryService?: CatsMemoryService;
  } = {},
): Promise<{ state: ChatState; results: ChannelActivationResult[] }> {
  let nextState = state;
  let channelState = requireChannel(nextState, channelId);
  let channelView = buildChannelView(nextState, channelId);
  let spawnCwd = spawnCwdFor(channelState);
  const sharingMode = spawnCwd ? 'shared' : null;
  const orchestratorDisplayName = resolveOrchestratorDisplayName(nextState);
  const results: ChannelActivationResult[] = [];

  if (channelState.orchestratorLease.sessionId) {
    results.push({
      targetKind: 'orchestrator',
      targetId: 'orchestrator',
      targetName: orchestratorDisplayName,
      status: 'already_started',
      sessionId: channelState.orchestratorLease.sessionId,
    });
  } else {
    try {
      const orchestratorTarget = buildOrchestratorTarget(nextState, channelView);
      const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
        nextState,
        channelView,
        orchestratorTarget,
        undefined,
        now,
        options.companionStore,
      );
      const executionTarget = resolveOrchestratorExecutionTarget(nextState, requireChannel(nextState, channelId));
      const session = await runtimeClient.createSession({
        provider: executionTarget.provider,
        instance: executionTarget.instance,
        model: executionTarget.model,
        cwd: spawnCwd,
        sharingMode,
        context: runtimeEnvelope.context,
        skills: runtimeEnvelope.skills,
      });
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now);
      if (!spawnCwd && session.cwd) {
        spawnCwd = session.cwd;
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(orchestratorDisplayName, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'orchestrator',
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
      results.push({
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        targetName: orchestratorDisplayName,
        status: 'started',
        sessionId: session.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = setErroredSession(nextState, channelId, 'orchestrator', message, now);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${orchestratorDisplayName}: ${message}`,
        },
        now,
        {
          metadata: { event: 'session_start_failed', targetKind: 'orchestrator' },
        },
      ).state;
      results.push({
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        targetName: orchestratorDisplayName,
        status: 'error',
        sessionId: null,
        error: message,
      });
    }
  }

  channelView = buildChannelView(nextState, channelId);
  for (const cat of activeAssignedCats(channelView)) {
    if (cat.execution.lease.sessionId) {
      results.push({
        targetKind: 'cat',
        targetId: cat.catId,
        targetName: cat.name,
        status: 'already_started',
        sessionId: cat.execution.lease.sessionId,
      });
      continue;
    }

    try {
      const catTarget = buildCatTarget(cat);
      const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
        nextState,
        channelView,
        catTarget,
        undefined,
        now,
        options.companionStore,
      );
      const session = await runtimeClient.createSession({
        provider: cat.execution.target.provider,
        instance: cat.execution.target.instance,
        model: cat.execution.target.model,
        cwd: spawnCwd,
        sharingMode,
        context: runtimeEnvelope.context,
        skills: runtimeEnvelope.skills,
      });
      nextState = setStartedSession(nextState, channelId, { catId: cat.catId }, session, now);
      if (!spawnCwd && session.cwd) {
        spawnCwd = session.cwd;
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(cat.name, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'cat',
            targetId: cat.catId,
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
      results.push({
        targetKind: 'cat',
        targetId: cat.catId,
        targetName: cat.name,
        status: 'started',
        sessionId: session.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = setErroredSession(nextState, channelId, { catId: cat.catId }, message, now);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${cat.name}: ${message}`,
        },
        now,
        {
          metadata: {
            event: 'session_start_failed',
            targetKind: 'cat',
            targetId: cat.catId,
          },
        },
      ).state;
      results.push({
        targetKind: 'cat',
        targetId: cat.catId,
        targetName: cat.name,
        status: 'error',
        sessionId: null,
        error: message,
      });
    }
  }

  channelState = requireChannel(nextState, channelId);
  const hasStartedSession = results.some(
    (result) => result.status === 'started' || result.status === 'already_started',
  );
  nextState = setChannelStatus(
    nextState,
    channelId,
    hasStartedSession ? 'active' : channelState.catAssignments.length > 0 ? 'configured' : 'planned',
    now,
  );

  return { state: nextState, results };
}

export async function routeChannelMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  let nextState = state;
  const channelBeforeMessage = requireChannel(nextState, channelId);
  const nextPendingProvider = payload.pendingProvider === undefined
    ? channelBeforeMessage.pendingProvider
    : normalizePendingTargetValue(payload.pendingProvider);
  const nextPendingModel = payload.pendingModel === undefined
    ? channelBeforeMessage.pendingModel
    : normalizePendingTargetValue(payload.pendingModel);
  const nextPendingInstance = payload.pendingInstance === undefined
    ? channelBeforeMessage.pendingInstance
    : normalizePendingTargetValue(payload.pendingInstance);
  const pendingTargetChanged = channelBeforeMessage.composerMode === 'solo'
    && (
      nextPendingProvider !== channelBeforeMessage.pendingProvider
      || nextPendingModel !== channelBeforeMessage.pendingModel
      || nextPendingInstance !== channelBeforeMessage.pendingInstance
    );

  if (
    pendingTargetChanged
    && channelBeforeMessage.orchestratorLease.sessionId
  ) {
    await bestEffortFlushRuntimeSessionMemory({
      runtimeClient,
      sessionId: channelBeforeMessage.orchestratorLease.sessionId,
      requestedPhase: 'pre_reset',
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      now,
    });
    await runtimeClient.closeSession(channelBeforeMessage.orchestratorLease.sessionId);
    nextState = setChannelOrchestratorLease(
      nextState,
      channelId,
      {
        sessionId: null,
        status: 'not_started',
        lastError: null,
        provider: nextPendingProvider,
        model: nextPendingModel,
        startedAt: null,
      },
      now,
    );
  }

  nextState = setChannelPendingExecutionTarget(
    nextState,
    channelId,
    {
      provider: nextPendingProvider,
      model: nextPendingModel,
      instance: nextPendingInstance,
    },
    now,
  );
  nextState = appendMessage(
    nextState,
    channelId,
    {
      senderKind: 'user',
      senderName: payload.senderName?.trim() || 'User',
      body: payload.body,
    },
    now,
    {
      metadata: payload.choiceResponse
        ? {
            event: 'choice_response',
            sourceMessageId: payload.choiceResponse.sourceMessageId,
          }
        : {},
      choiceResponse: payload.choiceResponse,
    },
  ).state;
  nextState = refreshDerivedMemoryLayers(nextState, channelId, now);

  const channelAfterUserMessage = buildChannelView(nextState, channelId);
  const userMessage = channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  const choiceResponseTarget = payload.choiceResponse
    ? resolveChoiceResponseTarget(
        nextState,
        channelAfterUserMessage,
        payload.choiceResponse.sourceMessageId,
      )
    : null;
  const initialResolution = choiceResponseTarget
    ? {
        targets: [choiceResponseTarget],
        unresolved: [],
        mentionNames: [],
        trigger: 'room_default' as const,
        resolution: {
          routingMode: 'room_default' as const,
          selectionKind: 'default_target' as const,
          defaultTarget: toParticipantRef(choiceResponseTarget),
          defaultTargetReason: null,
          fallbackTarget: null,
          blockedReason: null,
          note: 'Structured choice response routed back to the originating participant.',
        },
      }
    : resolveTargets(nextState, channelId, payload.body, {
        allowDefaultTarget: true,
        explicitTrigger: 'explicit_mention',
      });
  const results: ChannelDispatchResult[] = [];
  const nowIso = now.toISOString();
  const channelRouting = requireChannel(nextState, channelId).roomRouting;
  const baseRoomRouting = resolveRoomRoutingState(channelRouting);
  const workflow = resolveRoomWorkflowState(baseRoomRouting.workflow);
  const maxContinuations =
    baseRoomRouting.maxContinuations ?? DEFAULT_MAX_ROUTING_CONTINUATIONS;
  const maxDispatches =
    baseRoomRouting.maxDispatchesPerTurn ?? DEFAULT_MAX_ROUTING_DISPATCHES;
  const maxTargetVisits =
    baseRoomRouting.maxTargetVisitsPerTurn ?? DEFAULT_MAX_ROUTING_TARGET_VISITS;
  const outcome = createRoutingOutcome(channelAfterUserMessage, userMessage, initialResolution, nowIso);
  const activeTurn = createWorkflowTurn(
    userMessage,
    nowIso,
    workflowStageIdForTrigger(initialResolution.trigger),
    workflowShapeForTargets(initialResolution.targets.length),
  );
  activeTurn.id = outcome.turnId;
  workflow.activeTurn = activeTurn;
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System routing started a new room turn.',
      nowIso,
      null,
      userMessage.id,
      initialResolution.targets.map((target) => toParticipantRef(target)),
      {
        metadata: {
          trigger: initialResolution.trigger,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          selectionKind: initialResolution.resolution.selectionKind,
          defaultTargetReason: initialResolution.resolution.defaultTargetReason,
          blockedReason: initialResolution.resolution.blockedReason,
          unresolvedMentions: structuredClone(initialResolution.unresolved),
        },
      },
    ),
  );
  let latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'turn_started',
    'System routing started a new room turn.',
    nowIso,
    null,
    initialResolution.targets.map((target) => toParticipantRef(target)),
  );

  if (initialResolution.unresolved.length > 0) {
    mergeUnresolvedMentions(outcome, initialResolution.unresolved);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: `Unresolved mentions: ${initialResolution.unresolved.map((item) => `@${item}`).join(', ')}`,
      },
      now,
      {
        metadata: {
          event: 'unresolved_mentions',
          mentions: initialResolution.unresolved,
        },
      },
    ).state;
  }

  if (initialResolution.targets.length === 0) {
    const blockedTargets = outcome.resolution.defaultTarget
      ? [outcome.resolution.defaultTarget]
      : [];
    const blockedNote = outcome.resolution.note
      ?? 'No routing targets matched this message. Mention someone or let the room default target handle it.';
    latestCheckpoint = addWorkflowCheckpoint(
      outcome,
      workflow,
      activeTurn,
      'no_targets',
      blockedNote,
      nowIso,
      null,
      blockedTargets,
    );
    outcome.status = 'blocked';
    outcome.completedAt = nowIso;
    activeTurn.status = 'blocked';
    activeTurn.stageId = 'blocked';
    activeTurn.completedAt = nowIso;
    activeTurn.updatedAt = nowIso;
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: blockedNote,
      },
      now,
      {
        metadata: {
          event: 'routing_skipped',
          blockedReason: outcome.resolution.blockedReason,
          selectionKind: outcome.resolution.selectionKind,
        },
      },
    ).state;
    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'outcome',
        'blocked',
        blockedNote,
        nowIso,
        null,
        userMessage.id,
        blockedTargets,
        {
          outcomeId: randomUUID(),
          metadata: {
            workflowStageId: activeTurn.stageId,
            workflowShape: activeTurn.workflowShape,
            status: 'blocked',
            blockedReason: outcome.resolution.blockedReason,
          },
        },
      ),
    );
    finalizeWorkflowTurn(workflow, activeTurn);
    nextState = applyRoomRoutingSnapshot(
      nextState,
      channelId,
      baseRoomRouting,
      workflow,
      outcome,
      latestCheckpoint,
      now,
    );
    return { state: nextState, results };
  }

  const queue: DispatchFrame[] = [
    {
      sourceMessage: userMessage,
      sourceParticipant: null,
      targets: initialResolution.targets,
      unresolved: initialResolution.unresolved,
      mentionNames: initialResolution.mentionNames,
      trigger: initialResolution.trigger,
      depth: 0,
    },
  ];
  const targetVisitCounts = new Map<string, number>();
  let guardReason: RoomRoutingGuardReason = null;

  while (queue.length > 0) {
    const frame = queue.shift();
    if (!frame) {
      break;
    }

    const allowedRequests: DispatchRequest[] = [];
    for (const target of frame.targets) {
      if (outcome.totalDispatchCount >= maxDispatches) {
        guardReason = 'max_dispatches';
        activeTurn.guard = guardReason;
        activeTurn.status = 'blocked';
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'loop_guard',
          `Room routing stopped after reaching ${describeGuardReason('max_dispatches')}.`,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
        );
        break;
      }

      const request: DispatchRequest = {
        ...frame,
        target,
        dispatchId: randomUUID(),
        targetStateId: randomUUID(),
        parentCheckpointId: latestCheckpoint?.id ?? null,
        branchStrategy: resolveWorkflowBranchStrategy(
          frame.sourceParticipant,
          target,
          frame.depth,
        ),
        handoffReason: resolveWorkflowHandoffReason(frame.trigger),
      };
      createPendingDispatch(outcome, request, nowIso);
      queueWorkflowTarget(activeTurn, request, nowIso);
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_pending',
          'pending',
          `${target.participantName} is pending dispatch for this room turn.`,
          nowIso,
          frame.sourceParticipant,
          frame.sourceMessage.id,
          [toParticipantRef(target)],
          {
            dispatchId: request.dispatchId,
            metadata: {
              depth: frame.depth,
              trigger: frame.trigger,
              parentCheckpointId: request.parentCheckpointId,
              branchStrategy: request.branchStrategy,
              handoffReason: request.handoffReason,
              mentionNames: structuredClone(frame.mentionNames),
            },
          },
        ),
      );

      const targetKey = participantKey(target);
      if ((targetVisitCounts.get(targetKey) ?? 0) >= maxTargetVisits) {
        const blockedError = `${target.participantName} already reached the per-turn revisit limit.`;
        updateDispatch(outcome, request.dispatchId, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        appendWorkflowEvent(
          workflow,
          activeTurn,
          createWorkflowEvent(
            activeTurn.id,
            'target_blocked',
            'blocked',
            blockedError,
            nowIso,
            frame.sourceParticipant,
            frame.sourceMessage.id,
            [toParticipantRef(target)],
            {
              dispatchId: request.dispatchId,
              metadata: {
                reason: 'max_target_visits',
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
          'loop_guard',
          `${target.participantName} was blocked after reaching ${describeGuardReason('max_target_visits')}.`,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
        );
        if (frame.targets.length === 1 && queue.length === 0) {
          guardReason = 'max_target_visits';
        }
        results.push({
          targetKind: target.participantKind,
          targetId: target.participantId,
          targetName: target.participantName,
          sessionId: target.sessionId,
          status: 'skipped',
          dispatchId: request.dispatchId,
          turnId: activeTurn.id,
          targetStatus: 'blocked',
          error: blockedError,
          sourceMessageId: frame.sourceMessage.id,
          trigger: frame.trigger,
          dispatchDepth: frame.depth,
        });
        continue;
      }

      if (
        frame.sourceParticipant
        && shouldBlockAntiPingPong(frame.sourceParticipant, target, outcome.dispatches)
      ) {
        const blockedError = `Blocked a routing ping-pong between ${frame.sourceParticipant.participantName} and ${target.participantName}.`;
        updateDispatch(outcome, request.dispatchId, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        appendWorkflowEvent(
          workflow,
          activeTurn,
          createWorkflowEvent(
            activeTurn.id,
            'target_blocked',
            'blocked',
            blockedError,
            nowIso,
            frame.sourceParticipant,
            frame.sourceMessage.id,
            [toParticipantRef(target)],
            {
              dispatchId: request.dispatchId,
              metadata: {
                reason: 'anti_ping_pong',
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
          'anti_ping_pong',
          blockedError,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
        );
        if (frame.targets.length === 1 && queue.length === 0) {
          guardReason = 'anti_ping_pong';
        }
        results.push({
          targetKind: target.participantKind,
          targetId: target.participantId,
          targetName: target.participantName,
          sessionId: target.sessionId,
          status: 'skipped',
          dispatchId: request.dispatchId,
          turnId: activeTurn.id,
          targetStatus: 'blocked',
          error: blockedError,
          sourceMessageId: frame.sourceMessage.id,
          trigger: frame.trigger,
          dispatchDepth: frame.depth,
        });
        continue;
      }

      allowedRequests.push(request);
    }

    if (guardReason === 'max_dispatches') {
      break;
    }
    if (allowedRequests.length === 0) {
      if (guardReason) {
        break;
      }
      continue;
    }

    if (allowedRequests.length > 1) {
      activeTurn.workflowShape = 'parallel';
      activeTurn.stageId = 'parallel_fan_out';
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'fan_out',
          'running',
          `Fan-out scheduled ${allowedRequests.map((request) => request.target.participantName).join(', ')} in parallel.`,
          nowIso,
          frame.sourceParticipant,
          frame.sourceMessage.id,
          allowedRequests.map((request) => toParticipantRef(request.target)),
          {
            metadata: {
              branchCount: allowedRequests.length,
              workflowStageId: activeTurn.stageId,
              workflowShape: activeTurn.workflowShape,
            },
          },
        ),
      );
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'fan_out',
        `Fan-out routed this step to ${allowedRequests.map((request) => request.target.participantName).join(', ')}.`,
        nowIso,
        frame.sourceParticipant,
        allowedRequests.map((request) => toParticipantRef(request.target)),
        {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
        },
      );
    }

    const readyRequests: DispatchRequest[] = [];
    for (const request of allowedRequests) {
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

    if (readyRequests.length === 0) {
      continue;
    }

    const stateSnapshot = nextState;
    const executions = await settleInCompletionOrder(
      readyRequests.map((request) =>
        executeDispatch(
          stateSnapshot,
          channelId,
          request,
          runtimeClient,
          now,
          options.transport,
          options.companionStore,
        ),
      ),
    );

    for (const execution of executions) {
      outcome.totalDispatchCount += 1;
      activeTurn.dispatchCount = outcome.totalDispatchCount;
      const targetKey = participantKey(execution.target);
      targetVisitCounts.set(targetKey, (targetVisitCounts.get(targetKey) ?? 0) + 1);

      if (execution.error) {
        nextState = execution.target.participantKind === 'cat'
          ? setChannelCatLease(
              nextState,
              channelId,
              execution.target.participantId,
              { status: 'error', lastError: execution.error, lastUsedAt: nowIso },
              now,
            )
          : setChannelOrchestratorLease(
              nextState,
              channelId,
              { status: 'error', lastError: execution.error, lastUsedAt: nowIso },
              now,
            );
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to route the message to ${execution.target.participantName}: ${execution.error}`,
          },
          now,
          {
            metadata: {
              event: 'runtime_error',
              targetKind: execution.target.participantKind,
              targetId: execution.target.participantId,
              sessionId: execution.target.sessionId,
            },
          },
        ).state;
        updateDispatch(outcome, execution.dispatchId, {
          status: 'error',
          completedAt: nowIso,
          error: execution.error,
        });
        updateWorkflowTarget(activeTurn, execution.targetStateId, nowIso, {
          status: 'failed',
          completedAt: nowIso,
          error: execution.error,
        });
        appendWorkflowEvent(
          workflow,
          activeTurn,
          createWorkflowEvent(
            activeTurn.id,
            'target_failed',
            'failed',
            `Runtime delivery to ${execution.target.participantName} failed: ${execution.error}`,
            nowIso,
            execution.sourceParticipant,
            execution.sourceMessage.id,
            [toParticipantRef(execution.target)],
            {
              dispatchId: execution.dispatchId,
              metadata: {
                phase: 'dispatch',
                parentCheckpointId: execution.parentCheckpointId,
                branchStrategy: execution.branchStrategy,
                handoffReason: execution.handoffReason,
              },
            },
          ),
        );
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'runtime_error',
          `Runtime delivery to ${execution.target.participantName} failed: ${execution.error}`,
          nowIso,
          execution.sourceParticipant,
          [toParticipantRef(execution.target)],
        );
        results.push({
          targetKind: execution.target.participantKind,
          targetId: execution.target.participantId,
          targetName: execution.target.participantName,
          sessionId: execution.target.sessionId,
          status: 'error',
          dispatchId: execution.dispatchId,
          turnId: activeTurn.id,
          targetStatus: 'failed',
          error: execution.error,
          sourceMessageId: execution.sourceMessage.id,
          trigger: execution.trigger,
          dispatchDepth: execution.depth,
        });
        continue;
      }

      nextState = setReadyAfterMessage(
        nextState,
        channelId,
        execution.target.participantKind === 'cat'
          ? { catId: execution.target.participantId }
          : 'orchestrator',
        now,
      );
      const appendedResponse = appendMessage(
        nextState,
        channelId,
        {
          senderKind: execution.target.participantKind === 'orchestrator'
            ? 'orchestrator'
            : 'agent',
          senderName: execution.target.participantName,
          body: execution.responseBody ?? '',
        },
        now,
        {
          metadata: {
            event: 'runtime_response',
            targetKind: execution.target.participantKind,
            targetId: execution.target.participantId,
            sessionId: execution.target.sessionId,
            turnId: outcome.turnId,
            sourceMessageId: execution.sourceMessage.id,
            routingTrigger: execution.trigger,
            dispatchDepth: execution.depth,
          },
          usage: execution.usage,
          execution: resolveExecutionMetadataForTarget(nextState, channelId, execution.target),
          incrementUnread: false,
        },
      );
      nextState = appendedResponse.state;
      nextState = refreshDerivedMemoryLayers(nextState, channelId, now);
      const responseMessage = appendedResponse.message;
      updateDispatch(outcome, execution.dispatchId, {
        status: 'completed',
        responseMessageId: responseMessage.id,
        completedAt: nowIso,
        error: null,
      });
      updateWorkflowTarget(activeTurn, execution.targetStateId, nowIso, {
        status: 'completed',
        completedAt: nowIso,
        responseMessageId: responseMessage.id,
        error: null,
      });
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_completed',
          'completed',
          `${execution.target.participantName} completed this room dispatch.`,
          nowIso,
          execution.sourceParticipant,
          execution.sourceMessage.id,
          [toParticipantRef(execution.target)],
            {
              dispatchId: execution.dispatchId,
              metadata: {
                responseMessageId: responseMessage.id,
                parentCheckpointId: execution.parentCheckpointId,
                branchStrategy: execution.branchStrategy,
                handoffReason: execution.handoffReason,
              },
            },
          ),
        );
      results.push({
        targetKind: execution.target.participantKind,
        targetId: execution.target.participantId,
        targetName: execution.target.participantName,
        sessionId: execution.target.sessionId,
        status: 'sent',
        dispatchId: execution.dispatchId,
        turnId: activeTurn.id,
        targetStatus: 'completed',
        sourceMessageId: execution.sourceMessage.id,
        trigger: execution.trigger,
        dispatchDepth: execution.depth,
      });

      const continuationResolution = resolveTargets(nextState, channelId, responseMessage.body, {
        allowDefaultTarget: false,
        explicitTrigger: 'continuation_mention',
      });
      if (continuationResolution.unresolved.length > 0) {
        mergeUnresolvedMentions(outcome, continuationResolution.unresolved);
      }

      if (continuationResolution.targets.length === 0) {
        if (continuationResolution.unresolved.length > 0) {
          latestCheckpoint = addWorkflowCheckpoint(
            outcome,
            workflow,
            activeTurn,
            'no_targets',
            `No valid continuation targets were resolved from ${execution.target.participantName}'s handoff.`,
            nowIso,
            toParticipantRef(execution.target),
          );
        }
        continue;
      }

      if (execution.depth + 1 > maxContinuations) {
        guardReason = 'max_continuations';
        activeTurn.guard = guardReason;
        activeTurn.status = 'blocked';
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'loop_guard',
          `Room routing stopped after reaching ${describeGuardReason('max_continuations')}.`,
          nowIso,
          toParticipantRef(execution.target),
          continuationResolution.targets.map((target) => toParticipantRef(target)),
        );
        break;
      }

      outcome.continuationCount += 1;
      activeTurn.continuationCount = outcome.continuationCount;
      activeTurn.stageId = 'continuation_handoff';
      activeTurn.workflowShape = workflowShapeForTargets(continuationResolution.targets.length);
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'continuation',
        `${execution.target.participantName} handed the room forward to ${continuationResolution.targets.map((target) => target.participantName).join(', ')}.`,
        nowIso,
        toParticipantRef(execution.target),
        continuationResolution.targets.map((target) => toParticipantRef(target)),
        {
          mentionNames: structuredClone(continuationResolution.mentionNames),
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          handoffReason: 'workflow_continuation',
          branchStrategy: continuationResolution.targets.length > 1
            ? 'transplant_context'
            : resolveWorkflowBranchStrategy(
                toParticipantRef(execution.target),
                continuationResolution.targets[0]!,
                execution.depth + 1,
              ),
        },
      );
      queue.push({
        sourceMessage: responseMessage,
        sourceParticipant: toParticipantRef(execution.target),
        targets: continuationResolution.targets,
        unresolved: continuationResolution.unresolved,
        mentionNames: continuationResolution.mentionNames,
        trigger: continuationResolution.trigger,
        depth: execution.depth + 1,
      });
    }

    if (guardReason) {
      break;
    }
  }

  outcome.guard = guardReason;
  activeTurn.guard = guardReason;
  activeTurn.continuationCount = outcome.continuationCount;
  activeTurn.dispatchCount = outcome.totalDispatchCount;
  activeTurn.stageId = guardReason ? 'guard_blocked' : 'turn_completed';
  const terminalStatuses = deriveTerminalTurnStatuses(outcome, guardReason);
  outcome.status = terminalStatuses.outcomeStatus;
  activeTurn.status = terminalStatuses.workflowStatus;
  outcome.completedAt = nowIso;
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;
  latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'completed',
    guardReason
      ? `Room routing stopped because it hit ${describeGuardReason(guardReason)}.`
      : 'Room routing completed for this turn.',
    nowIso,
    null,
  );
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      activeTurn.status,
      guardReason
        ? `Room workflow ended in a blocked state because it hit ${describeGuardReason(guardReason)}.`
        : activeTurn.status === 'completed'
          ? 'Room workflow completed for this turn.'
          : 'Room workflow ended with failures for this turn.',
      nowIso,
      null,
      userMessage.id,
      outcome.resolvedTargets,
      {
        outcomeId: randomUUID(),
        metadata: {
          guard: guardReason,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          workflowLastCheckpointId: activeTurn.lastCheckpointId,
          selectionKind: outcome.resolution.selectionKind,
          defaultTargetReason: outcome.resolution.defaultTargetReason,
          blockedReason: outcome.resolution.blockedReason,
          continuationCount: outcome.continuationCount,
          totalDispatchCount: outcome.totalDispatchCount,
          unresolvedMentions: structuredClone(outcome.unresolvedMentions),
        },
      },
    ),
  );
  finalizeWorkflowTurn(workflow, activeTurn);
  nextState = applyRoomRoutingSnapshot(
    nextState,
    channelId,
    baseRoomRouting,
    workflow,
    outcome,
    latestCheckpoint,
    now,
  );

  return { state: nextState, results };
}
