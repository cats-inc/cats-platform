import type { AppConfig } from '../../../config.js';
import { createCatActorId } from '../../../core/model.js';
import type { TelegramPollingSupervisor } from '../../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../../platform/transports/telegram/relay.js';
import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../platform/memory/runtimeMaintenance.js';
import { escapeContentDispositionFilename } from '../shared/channelPaths.js';
import { sendJson, type RouteContext } from '../../../shared/http.js';
import {
  appendMessage,
  assignCatToChannel,
  buildChannelExportFilename,
  buildChannelView,
  createChannel,
  createCat,
  deleteChannel,
  deleteCat,
  exportChannel,
  requireChannel,
  requireCat,
  removeCatFromChannel,
  resolveOrchestratorDisplayName,
  setChannelCatLease,
  setChannelChatCwd,
  setChannelStatus,
} from '../state/model.js';
import { formatSessionStartedMessage } from '../state/runtimeMessages.js';
import { createAppShell } from '../state/shell.js';
import type { CompanionBoxStore } from '../state/companionBoxStore.js';
import type { ChatStore } from '../state/store.js';
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
      roomMode: binding.roomMode ?? (matchedCat?.id === resolvedState.bossCatId ? 'boss_chat' : 'direct_cat_chat'),
      isBossBinding: Boolean(resolvedState.bossCatId && matchedCat?.id === resolvedState.bossCatId),
      status: binding.status,
      updatedAt: binding.updatedAt,
      webhookPath: `/api/transports/telegram/webhook/${binding.id}`,
      hasBotToken: Boolean(binding.botToken),
      hasWebhookSecret: Boolean(binding.webhookSecret),
    };
  });

  return createAppShell(
    dependencies.config,
    runtime,
    resolvedState,
    nowFrom(dependencies),
    {
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      botBindings,
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
        now: context.dependencies.now?.(),
      });
      await context.dependencies.runtimeClient.closeSession(sessionId);
    }),
  );
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
  const spawnCwd = (
    refreshedChannel.repoPath
    ?? refreshedChannel.chatCwd
    ?? refreshedChannel.orchestratorLease.cwd
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
      const session = await context.dependencies.runtimeClient.createSession({
        provider: updatedCat.execution.target.provider,
        instance: updatedCat.execution.target.instance,
        model: updatedCat.execution.target.model,
        cwd: spawnCwd,
        sharingMode: spawnCwd ? 'shared' : undefined,
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

  return {
    persisted: await context.dependencies.chatStore.write(nextState),
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
  const nextState = deleteCat(await context.dependencies.chatStore.read(), catId);
  await context.dependencies.chatStore.write(nextState);
}

