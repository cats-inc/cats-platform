import type { AppConfig } from '../../../config.js';
import { createCatActorId } from '../../../core/actors.js';
import type { GuideCatRecord } from '../../../core/types.js';
import type { TelegramPollingSupervisor } from '../../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../../platform/transports/telegram/relay/index.js';
import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type {
  ProviderCapabilityBootstrapConfig,
  ProviderCapabilityBootstrapDiagnosticSink,
} from '../../../platform/supervision/index.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import type { ChatEventHub } from './chatEventHub.js';
import type { ProviderAgentDecisionRequester } from '../state/runtime-dispatch/routing.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../platform/memory/runtimeMaintenance.js';
import { escapeContentDispositionFilename } from '../shared/channelPaths.js';
import { sendJson, type RouteContext } from '../../../shared/http.js';
import { readDesktopHostBootstrapAttemptId } from '../../../shared/desktopHostState.js';
import { readPlatformPreferences } from '../../../shared/platformPreferences.js';
import { normalizePlatformSurface } from '../../../shared/platformSurfaces.js';
import { createExplicitProviderModelSelection } from '../../../shared/providerSelection.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  ensurePlatformScopeId,
  resolvePlatformScopeIdPathFromChatState,
} from '../../../shared/platformScopeId.js';
import { parseRuntimeSessionPolicyCreateInput } from '../../../shared/runtimeSessionPolicy.js';
import {
  publishTelegramBridgeResult,
  readTelegramPollingContext,
} from '../../../server/routes/telegram.js';
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
  resolveChannelCanonicalIdentity,
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
import { repairChannelReadState } from './channelRepair.js';
import { createAppShell } from '../state/shell.js';
import type { CompanionBoxStore } from '../state/companion-box/index.js';
import type { CompanionActivityStore } from '../companion/activityStore.js';
import type { ChatStore } from '../state/store.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
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
import { resolveChannelRuntimeSessionPolicy } from '../state/runtime-session/policy.js';
import {
  appendClosedRuntimeSessionFailureMessage,
  appendFailedRuntimeSessionMessage,
  appendStartedRuntimeSessionMessage,
  resolveChannelLifecycleCanonicalMetadata,
  resolveRuntimeEnvelopeCanonicalMetadata,
} from '../state/runtime-session/shared.js';
import {
  catParticipatesInChat,
  collectCatSessionIds,
  collectLinkedChannelSessionIds,
  seedBossCatGreeting,
} from './routeStateSupport.js';
import {
  collectChannelLeaseAttachments,
  resolveOrchestratorLeaseAttachment,
  resolveParticipantLeaseAttachment,
} from '../shared/channelParticipants.js';
import {
  queueGuideCatAssistRefresh,
  resolveChatGuideCatAssistReadModel,
} from './guideCatAssist.js';
export { mapChannelCat } from './routeStateSupport.js';
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
  type ProductDeleteRuntimeCleanupSummary,
} from './routeSessions.js';
export {
  maybeAutoResumeRecoveredCatContinuation,
  maybeAutoResumeRecoveredOrchestratorContinuation,
} from './routeContinuationRecovery.js';
import { maybeAutoResumeRecoveredCatContinuation } from './routeContinuationRecovery.js';
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
  companionActivityStore: CompanionActivityStore;
  memoryService: CatsMemoryService;
  eventHub?: ChatEventHub;
  providerAgentDecisionRequester?: ProviderAgentDecisionRequester;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
  now?: () => Date;
}

export type ChatApiRouteContext = RouteContext<ChatApiDependencies>;

export const CHAT_API_SLICE = 'chat';
export const DEFAULT_CHAT_SCOPE_ID = 'default';

export function nowFrom(dependencies: ChatApiDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

export async function enqueueGuideCatAssistRefreshIfRuntimeReachable(
  dependencies: ChatApiDependencies,
  options: {
    guideCat: GuideCatRecord | null;
    ownerDisplayName?: string | null;
    now?: Date;
  },
): Promise<void> {
  if (!options.guideCat) {
    return;
  }

  try {
    const runtime = await dependencies.runtimeClient.getHealth();
    queueGuideCatAssistRefresh({
      chatStatePath: dependencies.config.chatStatePath,
      guideCat: options.guideCat,
      ownerDisplayName: options.ownerDisplayName,
      runtimeReachable: runtime.reachable,
      now: options.now ?? nowFrom(dependencies),
    });
  } catch {
    // Mutation already succeeded. Assist refresh stays best-effort.
  }
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
    eventHub,
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
      onBridgeResult: (bridgeResult) => publishTelegramBridgeResult(eventHub, bridgeResult),
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
      core,
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
      outboundFanoutEnabled: binding.outboundFanoutEnabled !== false,
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
  // PLAN-077 Slice 17: ensure the platform-host product data scope id
  // exists, generating a fresh UUIDv4 on first launch. The same id flows
  // to renderers via the app-shell envelope and into the
  // `cats://companion/v1/<scopeId>/...` reference resolver.
  const scopeId = await ensurePlatformScopeId({
    filePath: resolvePlatformScopeIdPathFromChatState(dependencies.config.chatStatePath),
  });
  const guideCatAssist = await resolveChatGuideCatAssistReadModel({
    chatStatePath: dependencies.config.chatStatePath,
    guideCat: core.guideCat,
    ownerDisplayName: core.ownerProfile.displayName,
    runtimeReachable: runtime.reachable,
  });
  queueGuideCatAssistRefresh({
    chatStatePath: dependencies.config.chatStatePath,
    guideCat: core.guideCat,
    ownerDisplayName: core.ownerProfile.displayName,
    runtimeReachable: runtime.reachable,
    now: nowFrom(dependencies),
    readModel: guideCatAssist,
  });

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
      lobbyGuideCatAssist: guideCatAssist.lobby,
      newChatAssist: guideCatAssist.newChatByMode,
      codeGuideCatAssist: guideCatAssist.newCode,
      runtimeSetup,
      scopeId,
    },
  );
}

export async function persistCreatedChannel(
  context: ChatApiRouteContext,
  input: CreateChatChannelInput,
): Promise<ChatState> {
  // Single parse step at the HTTP boundary: validate the raw policy payload
  // and resolve it into a fully narrowed RuntimeSessionPolicy at the same
  // time, instead of running validate-then-resolve as two separate stages.
  const parsed = parseRuntimeSessionPolicyCreateInput({
    repoPath: input.repoPath,
    policy: {
      workspaceKind: input.runtimeWorkspaceKind,
      workspaceAccess: input.runtimeWorkspaceAccess,
      permissionMode: input.runtimePermissionMode,
    },
  });
  if (!parsed.ok) {
    throw new ChatApiError(
      400,
      parsed.issue.code,
      parsed.issue.message,
      parsed.issue.details,
    );
  }

  const now = nowFrom(context.dependencies);
  const requestedRoomMode = input.roomMode ?? (input.entryKind === 'direct' ? 'direct_cat_chat' : 'boss_chat');
  const requestedComposerMode = input.composerMode ?? (input.entryKind === 'solo' ? 'solo' : null);
  let nextState = createChannel(
    await context.dependencies.chatStore.read(),
    input,
    now,
    { prevalidatedRuntimePolicy: parsed.policy },
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

export function resolveCreateOriginSurface(
  originSurface: unknown,
  options: {
    targetNoun: string;
  },
): PlatformSurfaceId {
  if (originSurface === undefined || originSurface === null) {
    throw new ChatApiError(
      400,
      'origin_surface_required',
      `${options.targetNoun} originSurface is required.`,
    );
  }

  const explicitSurface = normalizePlatformSurface(originSurface);
  if (explicitSurface) {
    return explicitSurface;
  }

  throw new ChatApiError(
    400,
    'invalid_origin_surface',
    `${options.targetNoun} originSurface must be one of: chat, work, code.`,
    {
      received: originSurface,
    },
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
): Promise<ProductDeleteRuntimeCleanupSummary> {
  const currentState = await context.dependencies.chatStore.read();
  const channel = requireChannel(currentState, channelId);

  const runtimeCleanup = await cleanupSessionsForProductDelete(
    context,
    collectLinkedChannelSessionIds(channel),
  );

  await context.dependencies.chatStore.write(
    deleteChannel(currentState, channelId),
  );
  return runtimeCleanup;
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
  const previousSessionId = existingAssignment
    ? resolveParticipantLeaseAttachment(currentChannel, existingAssignment.participantId)?.sessionId ?? null
    : null;
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
      nextState = appendClosedRuntimeSessionFailureMessage(
        nextState,
        channelId,
        {
          ...resolveChannelLifecycleCanonicalMetadata(nextState, channelId),
          target: {
            participantKind: 'cat',
            participantId: existingAssignment?.participantId ?? input.catId,
            participantName: cat.name,
          },
          sessionId: previousSessionId,
          body: `Failed to close ${cat.name}'s previous session cleanly: ${
            closeError instanceof Error ? closeError.message : 'Unknown runtime error'
          }`,
          now,
        },
      );
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
  const assignmentTargetId = updatedCat?.participantId ?? input.catId;
  const resolvedChannel = requireChannel(nextState, channelId);
  const orchestratorAttachment = resolveOrchestratorLeaseAttachment(resolvedChannel);
  const spawnCwd = (
    resolveChannelSpawnCwd(resolvedChannel.repoPath, resolvedChannel.chatCwd)
    ?? (
      isRuntimeSessionWorkspacePath(orchestratorAttachment?.cwd)
        ? orchestratorAttachment?.cwd ?? null
        : null
    )
    ?? null
  );
  const channelIsLive = refreshedChannel.status === 'active'
    || collectChannelLeaseAttachments(refreshedChannel, {
      statuses: ['ready', 'initializing'],
    }).some((attachment) => attachment.participantId !== updatedCat?.participantId);
  const updatedCatSessionId = updatedCat
    ? resolveParticipantLeaseAttachment(refreshedChannel, updatedCat.participantId)?.sessionId ?? null
    : null;
  const needsSession = updatedCat
    && updatedCat.status === 'active'
    && !updatedCatSessionId
    && (isNew || targetChanged || channelIsLive)
    && Boolean(spawnCwd);

  if (needsSession) {
    const canonicalIdentity = resolveChannelCanonicalIdentity(nextState, channelId);
    let conversationId: string | null = canonicalIdentity.conversationId;
    let containerId: string | null = canonicalIdentity.containerId;
    let transportBindingId: string | null = null;
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
        null,
        now,
        context.dependencies.companionStore,
      );
      const sessionPolicy = resolveChannelRuntimeSessionPolicy(resolvedChannel);
      ({
        conversationId,
        containerId,
        transportBindingId,
      } = resolveRuntimeEnvelopeCanonicalMetadata(
        nextState,
        channelId,
        runtimeEnvelope.context,
      ));
      const { spawnCwd: sessionPolicySpawnCwd, ...runtimePolicy } = sessionPolicy;
      const effectiveWorkspaceKind = (
        spawnCwd
        && !sessionPolicySpawnCwd
        && runtimePolicy.workspaceKind === 'sandbox'
      )
        ? 'source'
        : runtimePolicy.workspaceKind;
      const session = await context.dependencies.runtimeClient.createSession({
        provider: updatedCat.execution.target.provider,
        instance: updatedCat.execution.target.instance,
        model: updatedCat.execution.target.model,
        modelSelection:
          updatedCat.execution.modelSelection
          ?? createExplicitProviderModelSelection(updatedCat.execution.target.model),
        cwd: spawnCwd ?? sessionPolicySpawnCwd ?? undefined,
        ...runtimePolicy,
        workspaceKind: effectiveWorkspaceKind,
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
      if (!spawnCwd && !sessionPolicySpawnCwd && session.cwd) {
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = setChannelStatus(nextState, channelId, 'active', now);
      const cat = requireCat(nextState, input.catId);
      nextState = appendStartedRuntimeSessionMessage(
        nextState,
        channelId,
        {
          target: {
            participantKind: 'cat',
            participantId: assignmentTargetId,
            participantName: cat.name,
          },
          provider: session.provider,
          instance: updatedCat.execution.target.instance ?? null,
          session,
          now,
          containerId,
          conversationId,
          transportBindingId,
        },
      );
    } catch (sessionError) {
      const errorMessage = sessionError instanceof Error ? sessionError.message : 'Unknown runtime error';
      nextState = setChannelCatLease(nextState, channelId, input.catId, {
        status: 'error',
        lastError: errorMessage,
      }, now);
      const cat = requireCat(nextState, input.catId);
      nextState = appendFailedRuntimeSessionMessage(
        nextState,
        channelId,
        {
          target: {
            participantKind: 'cat',
            participantId: assignmentTargetId,
            participantName: cat.name,
          },
          provider: updatedCat.execution.target.provider,
          instance: updatedCat.execution.target.instance ?? null,
          error: errorMessage,
          now,
          containerId,
          conversationId,
          transportBindingId,
        },
      );
    }
  }

  const persisted = await context.dependencies.chatStore.write(nextState);
  const persistedChannel = requireChannel(persisted, channelId);
  const persistedAssignment = persistedChannel.catAssignments.find(
    (candidate) => candidate.catId === input.catId,
  );
  const recoveredSessionId = persistedAssignment
    ? resolveParticipantLeaseAttachment(persistedChannel, persistedAssignment.participantId)?.sessionId ?? null
    : null;
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
    await maybeAutoResumeRecoveredCatContinuation(
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
  const activeSessionId = resolveParticipantLeaseAttachment(channel, assignment.participantId)?.sessionId ?? null;

  if (activeSessionId) {
    try {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId: activeSessionId,
        requestedPhase: 'pre_reset',
        memoryService: context.dependencies.memoryService,
        companionStore: context.dependencies.companionStore,
        coreStore: context.dependencies.chatStore,
        now: context.dependencies.now?.(),
      });
      await context.dependencies.runtimeClient.closeSession(
        activeSessionId,
      );
    } catch (closeError) {
      nextState = appendClosedRuntimeSessionFailureMessage(
        nextState,
        channelId,
        {
          ...resolveChannelLifecycleCanonicalMetadata(nextState, channelId),
          target: {
            participantKind: 'cat',
            participantId: assignment.participantId,
            participantName: cat.name,
          },
          sessionId: activeSessionId,
          body: `Failed to close ${cat.name}'s session cleanly: ${
            closeError instanceof Error ? closeError.message : 'Unknown runtime error'
          }`,
          now,
        },
      );
    }
  }

  await context.dependencies.chatStore.write(nextState);
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
