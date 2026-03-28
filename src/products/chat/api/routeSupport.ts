import type { AppConfig } from '../../../config.js';
import { createCatActorId } from '../../../core/actors.js';
import type { TelegramPollingSupervisor } from '../../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../../platform/transports/telegram/relay/index.js';
import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
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
import { readSuitePreferences } from '../../../shared/suitePreferences.js';
import { createExplicitProviderModelSelection } from '../../../shared/providerSelection.js';
import { defaultCatProducts, hasSuiteSurface } from '../../../shared/suiteSurfaces.js';
import {
  appendMessage,
  archiveCat,
  assignCatToChannel,
  buildChannelExportFilename,
  buildChannelView,
  createChannel,
  createCat,
  deleteChannel,
  deleteCat,
  renameChannel,
  exportChannel,
  requireChannel,
  requireCat,
  removeCatFromChannel,
  resolveOrchestratorDisplayName,
  setChannelCatLease,
  setChannelChatCwd,
  setChannelStatus,
} from '../state/model/index.js';
import { resumeStoredWorkflowContinuationDispatch } from '../state/orchestratorAdapter.js';
import { readWorkflowRecommendation } from '../state/room-routing/recommendations.js';
import { formatSessionStartedMessage } from '../state/runtimeMessages.js';
import { createAppShell } from '../state/shell.js';
import type { CompanionBoxStore } from '../state/companion-box/index.js';
import type { ChatStore } from '../state/store.js';
import { resolveEffectiveBotBindingRoomMode } from '../state/botBindings.js';
import { ensureChannelWorkspace } from '../state/workspace.js';
import {
  buildCatTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../state/runtimeTargeting.js';
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
  orchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface: OrchestratorPlannerSurface<ChatState>;
  telegramRelay?: TelegramRelay;
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  pollingSupervisor?: TelegramPollingSupervisor;
  companionStore: CompanionBoxStore;
  memoryService: CatsMemoryService;
  now?: () => Date;
}

export type ChatApiRouteContext = RouteContext<ChatApiDependencies>;

export const CHAT_API_SLICE = 'chat';
export const DEFAULT_CHAT_SCOPE_ID = 'default';

export function nowFrom(dependencies: ChatApiDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

export function errorStatusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (
    message.startsWith('Channel not found:')
    || message.startsWith('Cat not found:')
    || message.startsWith('Channel cat assignment not found:')
  ) {
    return 404;
  }
  return 400;
}

export function sendRestError(
  context: ChatApiRouteContext,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const payload: {
    error: { code: string; message: string; details?: Record<string, unknown> };
  } = {
    error: { code, message },
  };
  if (details) {
    payload.error.details = details;
  }
  sendJson(context.response, statusCode, payload);
}

export function handleRestError(
  context: ChatApiRouteContext,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Chat not found:')) {
    sendRestError(context, 404, 'chat_not_found', message);
    return;
  }
  if (message.startsWith('Channel not found:')) {
    sendRestError(context, 404, 'channel_not_found', message);
    return;
  }
  if (message.startsWith('Cat not found:')) {
    sendRestError(context, 404, 'cat_not_found', message);
    return;
  }
  if (message.startsWith('Channel cat assignment not found:')) {
    sendRestError(context, 404, 'assignment_not_found', message);
    return;
  }
  if (message.startsWith('Bot binding not found:')) {
    sendRestError(context, 404, 'bot_binding_not_found', message);
    return;
  }

  sendRestError(context, 400, 'bad_request', message);
}

export function handleCanonicalCatError(
  context: ChatApiRouteContext,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Cat not found:')) {
    sendRestError(
      context,
      404,
      'cat_not_found',
      message.replace('Cat not found:', 'Cat not found:'),
    );
    return;
  }
  if (message.startsWith('Channel cat assignment not found:')) {
    sendRestError(
      context,
      404,
      'cat_not_found',
      message.replace(
        'Channel cat assignment not found:',
        'Cat not found in channel:',
      ),
    );
    return;
  }

  handleRestError(context, error);
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
  if (channel.catAssignments.length > 0 || channel.messages.length > 0) {
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
  const resolvedState = state ?? await dependencies.chatStore.read();
  const runtime = await dependencies.runtimeClient.getHealth();
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

  const suitePrefs = await readSuitePreferences(dependencies.config.chatStatePath);

  return createAppShell(
    dependencies.config,
    runtime,
    resolvedState,
    nowFrom(dependencies),
    {
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
      botBindings,
      lastProductSurface: suitePrefs.lastProductSurface,
    },
  );
}

export async function persistCreatedChannel(
  context: ChatApiRouteContext,
  input: CreateChatChannelInput,
): Promise<ChatState> {
  const now = nowFrom(context.dependencies);
  let nextState = createChannel(
    await context.dependencies.chatStore.read(),
    input,
    now,
  );

  if (!input.skipBossCatGreeting && input.roomMode !== 'direct_cat_chat' && input.composerMode !== 'solo') {
    nextState = seedBossCatGreeting(nextState, nextState.selectedChannelId, now);
  }

  return context.dependencies.chatStore.write(nextState);
}

async function closeSessionIds(
  context: ChatApiRouteContext,
  sessionIds: Array<string | null | undefined>,
): Promise<void> {
  const validSessionIds = sessionIds.filter(
    (sessionId): sessionId is string =>
      typeof sessionId === 'string' && sessionId.length > 0,
  );

  await Promise.allSettled(
    validSessionIds.map(async (sessionId) => {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId,
        requestedPhase: 'pre_reset',
        memoryService: context.dependencies.memoryService,
        companionStore: context.dependencies.companionStore,
        coreStore: context.dependencies.chatStore,
        now: context.dependencies.now?.(),
      });
      await context.dependencies.runtimeClient.closeSession(sessionId);
    }),
  );
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
  return hasSuiteSurface(products, 'chat', {
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

  await closeSessionIds(context, [
    channel.orchestratorLease.sessionId,
    ...channel.catAssignments.map(
      (assignment) => assignment.status === 'removed'
        ? null
        : assignment.execution.lease.sessionId,
    ),
  ]);

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
  await writeCoreWithUpdatedBindings(context, (bindings, nowIso) =>
    bindings.map((binding) =>
      binding.catActorId === createCatActorId(catId) || binding.bossCatActorId === createCatActorId(catId)
        ? {
            ...binding,
            status: 'disabled',
            updatedAt: nowIso,
          }
        : binding,
    ));
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
  const workspace = await ensureChannelWorkspace({
    channelId,
    repoPath: refreshedChannel.repoPath,
    chatCwd: refreshedChannel.chatCwd,
    chatStatePath: context.dependencies.config.chatStatePath,
  });
  if (workspace.nextChatCwd && refreshedChannel.chatCwd !== workspace.nextChatCwd) {
    nextState = setChannelChatCwd(nextState, channelId, workspace.nextChatCwd, now);
  }
  const resolvedChannel = requireChannel(nextState, channelId);
  const spawnCwd = (
    workspace.workspacePath
    ?? resolvedChannel.repoPath
    ?? resolvedChannel.chatCwd
    ?? resolvedChannel.orchestratorLease.cwd
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
  await closeSessionIds(context, collectCatSessionIds(currentState, catId));
  const nextState = deleteCat(currentState, catId, now);
  await context.dependencies.chatStore.write(nextState);
  await writeCoreWithUpdatedBindings(context, (bindings) =>
    bindings.filter((binding) =>
      binding.catActorId !== createCatActorId(catId) && binding.bossCatActorId !== createCatActorId(catId),
    ));
}

