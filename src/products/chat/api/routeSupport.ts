import type { AppConfig } from '../../../config.js';
import { createCatActorId } from '../../../core/actors.js';
import type { TelegramPollingSupervisor } from '../../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../../platform/transports/telegram/relay/index.js';
import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import type { ChatEventHub } from './chatEventHub.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import {
  persistOrchestratorReplayActivity,
} from '../../../platform/orchestration/replayActivity.js';
import {
  readWorkflowContinuationReplay,
} from '../../../platform/orchestration/workflowContinuationReplay.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../platform/memory/runtimeMaintenance.js';
import { escapeContentDispositionFilename } from '../shared/channelPaths.js';
import { sendJson, type RouteContext } from '../../../shared/http.js';
import { readDesktopHostBootstrapAttemptId } from '../../../shared/desktopHostState.js';
import { readPlatformPreferences } from '../../../shared/platformPreferences.js';
import { createExplicitProviderModelSelection } from '../../../shared/providerSelection.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../shared/platformSurfaces.js';
import { readTelegramPollingContext } from '../../../server/routes/telegram.js';
import {
  appendMessage,
  archiveCat,
  assignCatToChannel,
  buildChannelExportFilename,
  buildChannelView,
  createChannel,
  createCat,
  deleteChannel,
  deleteParallelChatGroup,
  deleteCat,
  renameChannel,
  renameParallelChatGroup,
  exportChannel,
  requireChannel,
  requireCat,
  removeCatFromChannel,
  resolveOrchestratorDisplayName,
  unarchiveCat,
  setChannelCatLease,
  setChannelChatCwd,
  updateChannelParticipantProfile,
  setChannelStatus,
  ungroupParallelChatGroup,
} from '../state/model/index.js';
import {
  channelDispatchCancellationRegistry,
} from '../state/runtime-dispatch/cancellation.js';
import { resumeStoredWorkflowContinuationDispatch } from '../state/orchestratorAdapter.js';
import { readWorkflowRecommendation } from '../state/room-routing/recommendations.js';
import { formatSessionStartedMessage } from '../state/runtimeMessages.js';
import { repairChannelReadState } from './channelRepair.js';
import { createAppShell } from '../state/shell.js';
import type { CompanionBoxStore } from '../state/companion-box/index.js';
import type { ChatStore } from '../state/store.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
import { collectParticipantSessionIds } from '../shared/channelParticipants.js';
import { resolveEffectiveBotBindingRoomMode } from '../state/botBindings.js';
import { isRuntimeSessionWorkspacePath } from '../../../core/workspacePaths.js';
import {
  buildCatTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../state/runtimeTargeting.js';
import {
  ensureChannelAttachmentWorkspace,
  resolveChannelSpawnCwd,
  syncChannelAttachmentsToWorkspace,
} from '../state/workspace.js';
import { readRuntimeSetupSummary } from '../../../runtime/setup.js';
export {
  ChatApiError,
  errorStatusCode,
  handleCanonicalCatError,
  handleRestError,
  sendRestError,
} from './routeErrors.js';
import { ChatApiError } from './routeErrors.js';
export {
  cancelSessionIds,
  cleanupSessionsForProductDelete,
  closeSessionIds,
  collectActiveChannelSessionIds,
  hasActiveChannelTurn,
  waitForCancelledChannelTurns,
} from './routeSessions.js';
import {
  cleanupSessionsForProductDelete,
  closeSessionIds,
} from './routeSessions.js';
import type {
  AppShellPayload,
  AssignChannelCatInput,
  CreateChatChannelInput,
  CreateCatInput,
  ChatChannelCat,
  ChatState,
} from './contracts.js';

export interface ChatApiDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  chatStore: ChatStore;
  mutationGate: AsyncKeyedGate;
  orchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface: OrchestratorPlannerSurface<ChatState>;
  telegramRelay?: TelegramRelay;
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  pollingSupervisor?: TelegramPollingSupervisor;
  telegramCommandSurfaceSync?: {
    reconcile(options?: {
      staleBotTokens?: Array<string | null | undefined>;
    }): Promise<void>;
  };
  companionStore: CompanionBoxStore;
  memoryService: CatsMemoryService;
  eventHub?: ChatEventHub;
  now?: () => Date;
}

export type ChatApiRouteContext = RouteContext<ChatApiDependencies>;

export const CHAT_API_SLICE = 'chat';
export const DEFAULT_CHAT_SCOPE_ID = 'default';

export function nowFrom(dependencies: ChatApiDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

export async function reconcileTelegramTransportAfterBindingMutation(
  context: ChatApiRouteContext,
  options: {
    staleBotTokens?: Array<string | null | undefined>;
  } = {},
): Promise<void> {
  const {
    telegramCommandSurfaceSync,
    pollingSupervisor,
    telegramRelay,
    telegramRoomBridge,
    chatStore,
    memoryService,
    runtimeClient,
  } = context.dependencies;
  if (telegramCommandSurfaceSync) {
    try {
      await telegramCommandSurfaceSync.reconcile(options);
    } catch {
      // Binding mutation already succeeded. Command/menu sync stays best-effort.
    }
  }
  if (!pollingSupervisor || !telegramRelay) {
    return;
  }
  try {
    const pollingCtx = await readTelegramPollingContext(chatStore);
    await pollingSupervisor.reconcilePolling({
      bindings: pollingCtx.bindings,
      context: pollingCtx.context,
      refreshContext: async () => (await readTelegramPollingContext(chatStore)).context,
      roomBridge: telegramRoomBridge,
      memoryService,
      runtimeClient,
      telegramRelay,
    });
  } catch {
    // Binding cleanup already succeeded. Polling reconciliation stays best-effort.
  }
}

export function requireValidChatScopeId(chatScopeId: string): void {
  if (chatScopeId !== DEFAULT_CHAT_SCOPE_ID) {
    throw new Error(`Chat not found: ${chatScopeId}`);
  }
}

interface RecoveredContinuationParticipant {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
}

function seedBossCatGreeting(
  state: ChatState,
  channelId: string,
  now: Date,
): ChatState {
  if (!state.bossCatId) {
    return state;
  }

  const channel = requireChannel(state, channelId);
  if (
    (channel.participantAssignments?.length ?? channel.catAssignments.length) > 0
    || channel.messages.length > 0
  ) {
    return state;
  }

  const bossCatName = resolveOrchestratorDisplayName(state);
  return appendMessage(
    state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: bossCatName,
      body: `Meow! I'm ${bossCatName}, your Boss Cat. What should we chat about?`,
    },
    now,
  ).state;
}

export async function buildAppShellPayload(
  dependencies: ChatApiDependencies,
  state?: Awaited<ReturnType<ChatStore['read']>>,
): Promise<AppShellPayload> {
  const core = await dependencies.chatStore.readCore();
  let resolvedState = state ?? await dependencies.chatStore.read();
  const selectedChannelId = resolvedState.selectedChannelId?.trim();
  if (selectedChannelId) {
    resolvedState = await repairChannelReadState(
      {
        chatStore: dependencies.chatStore,
        mutationGate: dependencies.mutationGate,
        runtimeDataDir: dependencies.config.runtimeDataDir,
        now: dependencies.now,
      },
      selectedChannelId,
      resolvedState,
    );
  }
  const runtime = await dependencies.runtimeClient.getHealth();
  const runtimeSetup = await readRuntimeSetupSummary(dependencies.runtimeClient);
  const botBindings = core.botBindings.map((binding) => {
    const matchedCat = resolvedState.cats.find((cat) =>
      binding.catActorId
        ? createCatActorId(cat.id) === binding.catActorId
        : binding.bossCatActorId
          ? createCatActorId(cat.id) === binding.bossCatActorId
          : false,
    );

    return {
      id: binding.id,
      platform: binding.platform,
      botName: binding.botName,
      catId: matchedCat?.id ?? null,
      catName: matchedCat?.name ?? null,
      inboundMode: binding.inboundMode ?? 'polling',
      roomMode: resolveEffectiveBotBindingRoomMode(binding),
      isBossBinding: Boolean(resolvedState.bossCatId && matchedCat?.id === resolvedState.bossCatId),
      status: binding.status,
      updatedAt: binding.updatedAt,
      webhookPath: `/api/transports/telegram/webhook/${binding.id}`,
      hasBotToken: Boolean(binding.botToken),
      hasWebhookSecret: Boolean(binding.webhookSecret),
    };
  });

  const platformPrefs = await readPlatformPreferences(dependencies.config.chatStatePath);
  const bootstrapAttemptId = await readDesktopHostBootstrapAttemptId(
    dependencies.config.desktopHostStatePath,
  );

  return createAppShell(
    dependencies.config,
    runtime,
    resolvedState,
    nowFrom(dependencies),
    {
      bootstrapAttemptId,
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
      guideCat: core.guideCat,
      guideCatSidecarSeen: platformPrefs.guideCatSidecarSeen,
      guideCatSidecarMode: platformPrefs.guideCatSidecarMode,
      assistantPresets: core.assistantPresets,
      botBindings,
      lastProductSurface: platformPrefs.lastProductSurface,
      desktop: {
        startAtLogin: platformPrefs.startAtLogin,
        openWindowOnStartup: platformPrefs.openWindowOnStartup,
        systemTrayEnabled: platformPrefs.systemTrayEnabled,
      },
      lobby: {
        animationMode: platformPrefs.lobbyAnimationMode,
      },
      runtimeSetup,
    },
  );
}

export async function persistCreatedChannel(
  context: ChatApiRouteContext,
  input: CreateChatChannelInput,
): Promise<ChatState> {
  const now = nowFrom(context.dependencies);
  const requestedRoomMode = input.roomMode ?? (input.entryKind === 'direct' ? 'direct_cat_chat' : 'boss_chat');
  const requestedComposerMode = input.composerMode ?? (input.entryKind === 'solo' ? 'solo' : null);
  let nextState = createChannel(
    await context.dependencies.chatStore.read(),
    input,
    now,
  );

  if (
    !input.skipBossCatGreeting
    && requestedRoomMode !== 'direct_cat_chat'
    && requestedComposerMode !== 'solo'
  ) {
    nextState = seedBossCatGreeting(nextState, nextState.selectedChannelId, now);
  }

  return context.dependencies.chatStore.write(nextState);
}

function collectLinkedChannelSessionIds(
  channel: ReturnType<typeof requireChannel>,
): string[] {
  const sessionIds = new Set(collectParticipantSessionIds(channel));
  const orchestratorSessionId = channel.orchestratorLease.sessionId?.trim();
  if (orchestratorSessionId) {
    sessionIds.add(orchestratorSessionId);
  }
  return [...sessionIds];
}

function collectCatSessionIds(
  state: ChatState,
  catId: string,
): string[] {
  return state.channels.flatMap((channel) =>
    channel.catAssignments
      .filter((assignment) => assignment.catId === catId)
      .map((assignment) => assignment.execution.lease.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );
}

function catParticipatesInChat(products: readonly string[] | null | undefined): boolean {
  return hasPlatformSurface(products, 'chat', {
    fallback: defaultCatProducts(),
  });
}

function buildChannelTaskId(channelId: string): string {
  return `task-channel-${channelId}`;
}

function replayMatchesRecoveredParticipant(
  replay: NonNullable<ReturnType<typeof readWorkflowContinuationReplay>>,
  participant: RecoveredContinuationParticipant,
): boolean {
  const normalizedParticipantName = participant.participantName.trim().toLowerCase();
  if (replay.targets.some((target) =>
    target.participantKind === participant.participantKind
    && (
      target.participantId === participant.participantId
      || target.participantName.trim().toLowerCase() === normalizedParticipantName
    )
  )) {
    return true;
  }

  const recommendation = readWorkflowRecommendation(replay.workflowRecommendation);
  if (!recommendation) {
    return false;
  }

  return recommendation.candidateTargets.some((candidate) =>
    (
      candidate.participantKind === null
      || candidate.participantKind === participant.participantKind
    )
    && (
      candidate.participantId === participant.participantId
      || candidate.participantName?.trim().toLowerCase() === normalizedParticipantName
    )
  );
}

function hasStartupRecoveredContinuationActivity(
  core: Awaited<ReturnType<ChatStore['readCore']>>,
  taskId: string,
): boolean {
  return core.activities.some((activity) =>
    activity.taskId === taskId
    && activity.metadata?.source === 'workflow-continuation-replay'
    && activity.metadata?.replayPhase === 'startup_recovered');
}

function isRecoveredContinuationReplayEligibleForAutoResume(
  core: Awaited<ReturnType<ChatStore['readCore']>>,
  taskId: string,
  replay: NonNullable<ReturnType<typeof readWorkflowContinuationReplay>>,
  participant: RecoveredContinuationParticipant,
): boolean {
  if (replay.replayState !== 'ready' || !replayMatchesRecoveredParticipant(replay, participant)) {
    return false;
  }

  if (replay.blockedReason === 'no_valid_targets' && replay.workflowRecommendation) {
    return true;
  }

  return replay.blockedReason === null
    && hasStartupRecoveredContinuationActivity(core, taskId);
}

async function maybeAutoResumeRecoveredContinuationForParticipant(
  context: ChatApiRouteContext,
  channelId: string,
  participant: RecoveredContinuationParticipant,
  now: Date,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  const taskId = buildChannelTaskId(channelId);
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const replay = readWorkflowContinuationReplay(task?.metadata);
  if (
    !task
    || !replay
    || !isRecoveredContinuationReplayEligibleForAutoResume(core, taskId, replay, participant)
  ) {
    return;
  }

  try {
    await persistOrchestratorReplayActivity(
      context.dependencies.chatStore,
      core,
      {
        task,
        source: 'workflow-continuation-replay',
        phase: 'replay_started',
        resumeReason: 'target_recovered',
      },
      now,
    );
  } catch {
    // Inspectability is additive; do not block the auto-resume attempt.
  }

  try {
    const result = await resumeStoredWorkflowContinuationDispatch({
      request: replay,
      chatStore: context.dependencies.chatStore,
      runtimeClient: context.dependencies.runtimeClient,
      now,
      companionStore: context.dependencies.companionStore,
      memoryService: context.dependencies.memoryService,
    });
    try {
      const latestCore = await context.dependencies.chatStore.readCore();
      const latestTask = latestCore.tasks.find((candidate) =>
        candidate.id === buildChannelTaskId(channelId)
      ) ?? task;
      await persistOrchestratorReplayActivity(
        context.dependencies.chatStore,
        latestCore,
        {
          task: latestTask,
          source: 'workflow-continuation-replay',
          phase: result.status === 'dispatched'
            ? 'replay_dispatched'
            : 'replay_blocked',
          resumeReason: 'target_recovered',
          blockedReason: result.blockedReason,
          resultCount: result.results.length,
        },
        now,
      );
    } catch {
      // The auto-resume itself already completed; do not regress the main path.
    }
  } catch {
    try {
      const latestCore = await context.dependencies.chatStore.readCore();
      const latestTask = latestCore.tasks.find((candidate) =>
        candidate.id === buildChannelTaskId(channelId)
      ) ?? task;
      await persistOrchestratorReplayActivity(
        context.dependencies.chatStore,
        latestCore,
        {
          task: latestTask,
          source: 'workflow-continuation-replay',
          phase: 'replay_failed',
          resumeReason: 'target_recovered',
        },
        now,
      );
    } catch {
      // Keep the auto-resume path best-effort even if activity persistence fails.
    }
    // Auto-resume is additive. Leave the replay ready for explicit retry if
    // the recovered target still cannot complete the continuation.
  }
}

async function maybeAutoResumeRecoveredContinuation(
  context: ChatApiRouteContext,
  channelId: string,
  catId: string,
  now: Date,
): Promise<void> {
  const state = await context.dependencies.chatStore.read();
  const channel = buildChannelView(state, channelId);
  const assignment = channel.assignedCats.find((candidate) =>
    candidate.catId === catId && candidate.status === 'active'
  );
  if (!assignment) {
    return;
  }

  await maybeAutoResumeRecoveredContinuationForParticipant(
    context,
    channelId,
    {
      participantKind: 'cat',
      participantId: assignment.catId,
      participantName: assignment.name,
    },
    now,
  );
}

export async function maybeAutoResumeRecoveredOrchestratorContinuation(
  context: ChatApiRouteContext,
  channelId: string,
  now: Date,
): Promise<void> {
  const state = await context.dependencies.chatStore.read();
  const channel = buildChannelView(state, channelId);
  if (!channel.orchestratorLease.sessionId) {
    return;
  }

  await maybeAutoResumeRecoveredContinuationForParticipant(
    context,
    channelId,
    {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: resolveOrchestratorDisplayName(state),
    },
    now,
  );
}

async function writeCoreWithUpdatedBindings(
  context: ChatApiRouteContext,
  update: (
    bindings: Awaited<ReturnType<ChatStore['readCore']>>['botBindings'],
    nowIso: string,
  ) => Awaited<ReturnType<ChatStore['readCore']>>['botBindings'],
): Promise<void> {
  const nowIso = nowFrom(context.dependencies).toISOString();
  const currentCore = await context.dependencies.chatStore.readCore();
  await context.dependencies.chatStore.writeCore({
    ...currentCore,
    updatedAt: nowIso,
    botBindings: update(
      currentCore.botBindings.map((binding) => structuredClone(binding)),
      nowIso,
    ),
  });
}

export async function persistDeletedChannel(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  const currentState = await context.dependencies.chatStore.read();
  const channel = requireChannel(currentState, channelId);

  await cleanupSessionsForProductDelete(
    context,
    collectLinkedChannelSessionIds(channel),
  );

  await context.dependencies.chatStore.write(
    deleteChannel(currentState, channelId),
  );
}

export async function persistRenamedChannel(
  context: ChatApiRouteContext,
  channelId: string,
  title: string,
): Promise<ChatState> {
  const currentState = await context.dependencies.chatStore.read();
  const nextState = renameChannel(currentState, channelId, title, nowFrom(context.dependencies));
  return context.dependencies.chatStore.write(nextState);
}

export async function persistUpdatedChannelParticipant(
  context: ChatApiRouteContext,
  channelId: string,
  participantId: string,
  input: {
    name?: string | null;
    roleHint?: string | null;
  },
): Promise<ChatState> {
  const currentState = await context.dependencies.chatStore.read();
  const nextState = updateChannelParticipantProfile(
    currentState,
    channelId,
    participantId,
    input,
    nowFrom(context.dependencies),
  );
  return context.dependencies.chatStore.write(nextState);
}

export async function persistRenamedParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
  title: string,
): Promise<ChatState> {
  const currentState = await context.dependencies.chatStore.read();
  const nextState = renameParallelChatGroup(
    currentState,
    groupId,
    title,
    nowFrom(context.dependencies),
  );
  return context.dependencies.chatStore.write(nextState);
}

export async function persistUngroupedParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<ChatState> {
  const currentState = await context.dependencies.chatStore.read();
  return context.dependencies.chatStore.write(ungroupParallelChatGroup(currentState, groupId));
}

export async function persistDeletedParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<ChatState> {
  const currentState = await context.dependencies.chatStore.read();
  const group = currentState.parallelChatGroups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Parallel chat group not found: ${groupId}`);
  }

  await cleanupSessionsForProductDelete(context, group.memberChannelIds.flatMap((channelId) => {
    const channel = requireChannel(currentState, channelId);
    return collectLinkedChannelSessionIds(channel);
  }));

  return context.dependencies.chatStore.write(deleteParallelChatGroup(currentState, groupId));
}

export async function persistCreatedCat(
  context: ChatApiRouteContext,
  input: CreateCatInput,
): Promise<ChatState> {
  const nextState = createCat(
    await context.dependencies.chatStore.read(),
    input,
    nowFrom(context.dependencies),
  );

  return context.dependencies.chatStore.write(nextState);
}

export async function persistArchivedCat(
  context: ChatApiRouteContext,
  currentState: ChatState,
  catId: string,
): Promise<ChatState> {
  const now = nowFrom(context.dependencies);
  await closeSessionIds(context, collectCatSessionIds(currentState, catId));
  const nextState = await context.dependencies.chatStore.write(archiveCat(currentState, catId, now));
  await writeCoreWithUpdatedBindings(context, (bindings) =>
    bindings.filter((binding) =>
      binding.catActorId !== createCatActorId(catId) && binding.bossCatActorId !== createCatActorId(catId),
    ));
  void reconcileTelegramTransportAfterBindingMutation(context);
  return nextState;
}

export async function persistUnarchivedCat(
  context: ChatApiRouteContext,
  currentState: ChatState,
  catId: string,
): Promise<ChatState> {
  const nextState = await context.dependencies.chatStore.write(
    unarchiveCat(currentState, catId, nowFrom(context.dependencies)),
  );
  await writeCoreWithUpdatedBindings(context, (bindings) =>
    bindings.filter((binding) =>
      binding.catActorId !== createCatActorId(catId) && binding.bossCatActorId !== createCatActorId(catId),
    ));
  void reconcileTelegramTransportAfterBindingMutation(context);
  return nextState;
}

export async function persistUpdatedCat(
  context: ChatApiRouteContext,
  currentState: ChatState,
  nextState: ChatState,
  catId: string,
): Promise<ChatState> {
  const currentCat = requireCat(currentState, catId);
  const nextCat = requireCat(nextState, catId);
  if (catParticipatesInChat(currentCat.products) && !catParticipatesInChat(nextCat.products)) {
    await closeSessionIds(context, collectCatSessionIds(currentState, catId));
  }
  return context.dependencies.chatStore.write(nextState);
}

export async function persistCatAssignmentUpdate(
  context: ChatApiRouteContext,
  channelId: string,
  input: AssignChannelCatInput,
): Promise<{ persisted: ChatState; isNew: boolean }> {
  const now = nowFrom(context.dependencies);
  const currentState = await context.dependencies.chatStore.read();
  const currentChannel = requireChannel(currentState, channelId);
  const existingAssignment = currentChannel.catAssignments.find(
    (candidate) => candidate.catId === input.catId,
  );
  const isNew = !existingAssignment;
  const reactivatedAssignment = existingAssignment?.status === 'removed';
  const previousSessionId = existingAssignment?.execution.lease.sessionId ?? null;
  const previousProvider = existingAssignment?.execution.target.provider ?? null;
  const previousInstance = existingAssignment?.execution.target.instance ?? null;
  const previousModel = existingAssignment?.execution.target.model ?? null;

  let nextState = assignCatToChannel(currentState, channelId, input, now);
  const updatedChannel = requireChannel(nextState, channelId);
  const updatedAssignment = updatedChannel.catAssignments.find(
    (candidate) => candidate.catId === input.catId,
  );
  const targetChanged = Boolean(
    existingAssignment
    && updatedAssignment
    && (
      updatedAssignment.execution.target.provider !== previousProvider
      || updatedAssignment.execution.target.instance !== previousInstance
      || updatedAssignment.execution.target.model !== previousModel
    ),
  );

  if (targetChanged && previousSessionId) {
    try {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId: previousSessionId,
        requestedPhase: 'pre_reset',
        memoryService: context.dependencies.memoryService,
        companionStore: context.dependencies.companionStore,
        coreStore: context.dependencies.chatStore,
        now: context.dependencies.now?.(),
      });
      await context.dependencies.runtimeClient.closeSession(previousSessionId);
    } catch (closeError) {
      const cat = requireCat(nextState, input.catId);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to close ${cat.name}'s previous session cleanly: ${
            closeError instanceof Error ? closeError.message : 'Unknown runtime error'
          }`,
        },
        now,
        { metadata: { event: 'session_close_failed', catId: input.catId } },
      ).state;
    }
  }

  if (targetChanged && updatedAssignment) {
    nextState = setChannelCatLease(nextState, channelId, input.catId, {
      sessionId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: updatedAssignment.execution.target.provider,
      model: updatedAssignment.execution.target.model,
      startedAt: null,
      lastUsedAt: null,
    }, now);
  }

  const refreshedChannel = requireChannel(nextState, channelId);
  const updatedCat = refreshedChannel.catAssignments.find(
    (candidate) => candidate.catId === input.catId,
  );
  const resolvedChannel = requireChannel(nextState, channelId);
  const spawnCwd = (
    resolveChannelSpawnCwd(resolvedChannel.repoPath, resolvedChannel.chatCwd)
    ?? (
      isRuntimeSessionWorkspacePath(resolvedChannel.orchestratorLease.cwd)
        ? resolvedChannel.orchestratorLease.cwd
        : null
    )
    ?? null
  );
  const channelIsLive = refreshedChannel.status === 'active'
    || refreshedChannel.orchestratorLease.sessionId !== null
    || refreshedChannel.orchestratorLease.status === 'initializing'
    || refreshedChannel.catAssignments.some((candidate) =>
      candidate.catId !== input.catId
      && candidate.status === 'active'
      && (
        candidate.execution.lease.sessionId !== null
        || candidate.execution.lease.status === 'initializing'
      ),
    );
  const needsSession = updatedCat
    && updatedCat.status === 'active'
    && !updatedCat.execution.lease.sessionId
    && (isNew || targetChanged || channelIsLive)
    && Boolean(spawnCwd);

  if (needsSession) {
    try {
      const resolvedChannelView = buildChannelView(nextState, channelId);
      const resolvedCat = resolvedChannelView.assignedCats.find(
        (candidate) => candidate.catId === input.catId && candidate.status === 'active',
      );
      if (!resolvedCat) {
        throw new Error(`Channel cat assignment not found: ${input.catId}`);
      }
      const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
        nextState,
        resolvedChannelView,
        buildCatTarget(resolvedCat),
        undefined,
        now,
        context.dependencies.companionStore,
      );
      const session = await context.dependencies.runtimeClient.createSession({
        provider: updatedCat.execution.target.provider,
        instance: updatedCat.execution.target.instance,
        model: updatedCat.execution.target.model,
        modelSelection:
          updatedCat.execution.modelSelection
          ?? createExplicitProviderModelSelection(updatedCat.execution.target.model),
        cwd: spawnCwd,
        workspaceKind: spawnCwd ? 'source' : 'sandbox',
        workspaceAccess: 'read_write',
        context: runtimeEnvelope.context,
        skills: runtimeEnvelope.skills,
      });
      const attachmentWorkspacePath = await ensureChannelAttachmentWorkspace({
        channelId,
        repoPath: resolvedChannel.repoPath,
        chatCwd: resolvedChannel.chatCwd,
        runtimeDataDir: context.dependencies.config.runtimeDataDir,
      });
      await syncChannelAttachmentsToWorkspace({
        attachmentWorkspacePath,
        targetWorkspacePath: session.cwd,
      });
      const timestamp = now.toISOString();
      nextState = setChannelCatLease(nextState, channelId, input.catId, {
        sessionId: session.id,
        status: session.status === 'ready' ? 'ready' : 'initializing',
        cwd: session.cwd,
        lastError: null,
        provider: session.provider,
        model: session.model,
        startedAt: timestamp,
        lastUsedAt: timestamp,
      }, now);
      if (!spawnCwd && session.cwd) {
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = setChannelStatus(nextState, channelId, 'active', now);
      const cat = requireCat(nextState, input.catId);
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
            targetId: input.catId,
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
    } catch (sessionError) {
      const errorMessage = sessionError instanceof Error ? sessionError.message : 'Unknown runtime error';
      nextState = setChannelCatLease(nextState, channelId, input.catId, {
        status: 'error',
        lastError: errorMessage,
      }, now);
      const cat = requireCat(nextState, input.catId);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${cat.name}: ${errorMessage}`,
        },
        now,
        {
          metadata: {
            event: 'session_start_failed',
            targetKind: 'cat',
            targetId: input.catId,
          },
        },
      ).state;
    }
  }

  const persisted = await context.dependencies.chatStore.write(nextState);
  const persistedChannel = requireChannel(persisted, channelId);
  const persistedAssignment = persistedChannel.catAssignments.find(
    (candidate) => candidate.catId === input.catId,
  );
  const recoveredSessionId = persistedAssignment?.execution.lease.sessionId ?? null;
  const shouldAttemptRecoveredContinuationAutoResume = Boolean(
    isNew
    || reactivatedAssignment
    || (
      recoveredSessionId
      && (
        targetChanged
        || previousSessionId !== recoveredSessionId
      )
    ),
  );

  if (shouldAttemptRecoveredContinuationAutoResume) {
    await maybeAutoResumeRecoveredContinuation(
      context,
      channelId,
      input.catId,
      now,
    );
  }

  return {
    persisted: await context.dependencies.chatStore.read(),
    isNew,
  };
}

export async function persistCatAssignmentRemoval(
  context: ChatApiRouteContext,
  channelId: string,
  catId: string,
): Promise<void> {
  const currentState = await context.dependencies.chatStore.read();
  const channel = requireChannel(currentState, channelId);
  const assignment = channel.catAssignments.find(
    (candidate) => candidate.catId === catId,
  );
  if (!assignment) {
    throw new Error(`Channel cat assignment not found: ${catId}`);
  }

  const cat = requireCat(currentState, catId);
  const now = nowFrom(context.dependencies);
  let nextState = removeCatFromChannel(currentState, channelId, catId, now);

  if (assignment.execution.lease.sessionId) {
    try {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId: assignment.execution.lease.sessionId,
        requestedPhase: 'pre_reset',
        memoryService: context.dependencies.memoryService,
        companionStore: context.dependencies.companionStore,
        coreStore: context.dependencies.chatStore,
        now: context.dependencies.now?.(),
      });
      await context.dependencies.runtimeClient.closeSession(
        assignment.execution.lease.sessionId,
      );
    } catch (closeError) {
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to close ${cat.name}'s session cleanly: ${
            closeError instanceof Error ? closeError.message : 'Unknown runtime error'
          }`,
        },
        now,
        { metadata: { event: 'session_close_failed', catId } },
      ).state;
    }
  }

  await context.dependencies.chatStore.write(nextState);
}

export function mapChannelCat(assignment: ChatChannelCat) {
  return {
    catId: assignment.catId,
    name: assignment.name,
    roles: structuredClone(assignment.roles),
    skillProfile: assignment.skillProfile,
    mcpProfile: assignment.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: assignment.avatarColor,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(assignment.memory),
  };
}

export function sendChannelExport(
  context: ChatApiRouteContext,
  state: ChatState,
  channelId: string,
): void {
  const payload = exportChannel(state, channelId);
  const filename = escapeContentDispositionFilename(
    buildChannelExportFilename(state, channelId),
  );

  sendJson(context.response, 200, payload, {
    'content-disposition': `attachment; filename="${filename}"`,
  });
}

export async function persistDeletedCat(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  const currentState = await context.dependencies.chatStore.read();
  const now = nowFrom(context.dependencies);
  await cleanupSessionsForProductDelete(context, collectCatSessionIds(currentState, catId));
  const nextState = deleteCat(currentState, catId, now);
  await context.dependencies.chatStore.write(nextState);
  await writeCoreWithUpdatedBindings(context, (bindings) =>
    bindings.filter((binding) =>
      binding.catActorId !== createCatActorId(catId) && binding.bossCatActorId !== createCatActorId(catId),
    ));
  void reconcileTelegramTransportAfterBindingMutation(context);
}
