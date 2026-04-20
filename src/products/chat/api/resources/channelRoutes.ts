import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  beginChannelMessageRetryDispatch,
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../../state/runtimeActions.js';
import {
  buildChannelView,
  requireChannel,
  resetSoloChannelContinuity,
  resolveChannelCanonicalIdentity,
  setChannelPendingExecutionTarget,
  toChannelSummary,
} from '../../state/model/index.js';
import { repairChannelReadState } from '../channelRepair.js';
import { createMergedDispatchChatStore } from '../../state/runtime-dispatch/merge.js';
import { notifyStreamTargetChanged } from './streamTargetSignal.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { resolveRoomRoutingState } from '../../state/room-routing/index.js';
import type {
  CreateChatChannelInput,
  SendChannelMessageInput,
  UpdateChannelInput,
  UpdateChannelParticipantInput,
} from '../contracts.js';
import {
  buildAppShellPayload,
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  nowFrom,
  persistCreatedChannel,
  persistDeletedChannel,
  persistRenamedChannel,
  persistUpdatedChannelParticipant,
  resolveCreateOriginSurface,
  requireValidChatScopeId,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  channelDispatchCancellationRegistry,
} from '../../state/runtime-dispatch/cancellation.js';
import { publishRoomMutation } from '../transportEventPublisher.js';
import { routeChatChannelAttachmentResourceApi } from './channelAttachmentRoutes.js';
import { routeChatChannelRuntimeResourceApi } from './channelRuntimeRoutes.js';
import type { CatsCoreState, TurnRecord } from '../../../../core/types.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import {
  buildCanonicalChatUserMessage,
  readChatCoreTurnMetadataString,
} from '../../state/chatCoreInterop.js';

function publishChannelMutationEvents(
  context: ChatApiRouteContext,
  channelId: string,
  kind: 'created' | 'updated' | 'message_added' = 'updated',
): void {
  publishRoomMutation(context.dependencies.eventHub, channelId, kind);
  context.dependencies.eventHub?.emit({
    kind: 'recents_changed',
    channelId,
    timestamp: new Date().toISOString(),
  });
}

function resolvePersistedChannelMutationKind(
  previousState: ReturnType<typeof requireChannel>,
  persistedState: ReturnType<typeof requireChannel>,
): 'updated' | 'message_added' {
  return persistedState.messages.length > previousState.messages.length
    ? 'message_added'
    : 'updated';
}

function logBackgroundDispatchPersistenceError(
  channelId: string,
  error: unknown,
): void {
  const detail = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
  process.stderr.write(
    `[cats-chat-dispatch] failed to persist finalized dispatch for ${channelId}: ${detail}\n`,
  );
}

function logContinuityResetCleanupError(
  channelId: string,
  error: unknown,
): void {
  const detail = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
  process.stderr.write(
    `[cats-chat-reset] failed to close runtime session for ${channelId}: ${detail}\n`,
  );
}

function buildRestErrorPayload(code: string, message: string): {
  error: {
    code: string;
    message: string;
  };
} {
  return {
    error: {
      code,
      message,
    },
  };
}

function findLatestUserMessageId(
  channel: ReturnType<typeof requireChannel>,
  core?: CatsCoreState,
): string | null {
  let latestTranscriptUserId: string | null = null;
  let latestTranscriptUserCreatedAt: string | null = null;
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index];
    if (message.senderKind === 'user') {
      latestTranscriptUserId = message.id;
      latestTranscriptUserCreatedAt = message.createdAt;
      break;
    }
  }

  if (!core) {
    return latestTranscriptUserId;
  }

  const latestCanonicalUserTurn = findLatestCanonicalUserTurn(core, channel.id);
  const latestCanonicalUserId = readChatCoreTurnMetadataString(
    latestCanonicalUserTurn,
    'sourceMessageId',
  );
  if (!latestCanonicalUserId) {
    return latestTranscriptUserId;
  }
  if (!latestTranscriptUserCreatedAt) {
    return latestCanonicalUserId;
  }

  return latestCanonicalUserTurn
    && latestCanonicalUserTurn.createdAt.localeCompare(latestTranscriptUserCreatedAt) >= 0
    ? latestCanonicalUserId
    : latestTranscriptUserId;
}

function findLatestCanonicalUserTurn(
  core: CatsCoreState,
  channelId: string,
): TurnRecord | null {
  const { conversationId } = resolveChannelCanonicalIdentity(null, channelId);
  return core.turns
    .filter((turn) =>
      turn.conversationId === conversationId
      && readChatCoreTurnMetadataString(turn, 'sourceSenderKind') === 'user'
      && readChatCoreTurnMetadataString(turn, 'sourceMessageId'))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .at(0) ?? null;
}

function buildCanonicalRetryMessage(
  core: CatsCoreState,
  channelId: string,
  messageId: string,
): {
  id: string;
  senderKind: 'user';
  senderName: string;
  body: string;
  createdAt: string;
} | null {
  const message = buildCanonicalChatUserMessage(core, channelId, messageId);
  if (!message) {
    return null;
  }

  return {
    id: messageId,
    senderKind: message.senderKind,
    senderName: message.senderName,
    body: message.body,
    createdAt: message.createdAt,
  };
}

function hasCanonicalRetryableUserTurn(
  core: CatsCoreState | undefined,
  channelId: string,
  messageId: string,
): boolean {
  if (!core) {
    return false;
  }

  const latestCanonicalUserTurn = findLatestCanonicalUserTurn(core, channelId);
  if (!latestCanonicalUserTurn || latestCanonicalUserTurn.status !== 'failed') {
    return false;
  }

  return readChatCoreTurnMetadataString(latestCanonicalUserTurn, 'sourceMessageId') === messageId;
}

async function continueAcknowledgedChannelDispatchInBackground(
  context: ChatApiRouteContext,
  channelId: string,
  acknowledgedDispatch: Awaited<ReturnType<typeof beginChannelMessageDispatch>>,
): Promise<void> {
  if (!acknowledgedDispatch.preparedTurn) {
    return;
  }

  const dispatchNow = nowFrom(context.dependencies);
  const dispatchChatStore = createMergedDispatchChatStore({
    chatStore: context.dependencies.chatStore,
    mutationGate: context.dependencies.mutationGate,
    channelId,
    baselineState: acknowledgedDispatch.state,
    now: () => nowFrom(context.dependencies),
    onPersistMergedState: ({ previousState, persistedState }) => {
      if (!previousState.channels.some((channel) => channel.id === channelId)) {
        return;
      }
      if (!persistedState.channels.some((channel) => channel.id === channelId)) {
        return;
      }
      publishChannelMutationEvents(
        context,
        channelId,
        resolvePersistedChannelMutationKind(
          requireChannel(previousState, channelId),
          requireChannel(persistedState, channelId),
        ),
      );
    },
  });
  try {
    await continueBegunChannelMessageDispatch(
      acknowledgedDispatch,
      channelId,
      context.dependencies.runtimeClient,
      dispatchNow,
      {
        companionStore: context.dependencies.companionStore,
        memoryService: context.dependencies.memoryService,
        chatStore: dispatchChatStore,
        chatStatePath: context.dependencies.config.chatStatePath,
        runtimeDataDir: context.dependencies.config.runtimeDataDir,
        runtimeRecovery: {
          staleSessionRetryLimit: context.dependencies.config.runtimeStaleSessionRetryLimit,
        },
        cancellationRegistry: channelDispatchCancellationRegistry,
        onStateWritten: notifyStreamTargetChanged,
      },
    );
  } catch (error) {
    try {
      await context.dependencies.mutationGate.run(channelId, async () => {
        const latestState = await context.dependencies.chatStore.read();
        if (!latestState.channels.some((channel) => channel.id === channelId)) {
          return;
        }
        const settled = await settleBegunChannelMessageDispatchFailure(
          acknowledgedDispatch,
          channelId,
          error,
          dispatchNow,
          {
            latestState,
            onStateWritten: notifyStreamTargetChanged,
          },
        );
        if (settled.state.selectedChannelId === channelId) {
          requireChannel(settled.state, channelId).unreadCount = 0;
        }
        await context.dependencies.chatStore.write(settled.state);
      });
    } catch (persistError) {
      logBackgroundDispatchPersistenceError(channelId, persistError);
    }
    publishChannelMutationEvents(context, channelId, 'updated');
    return;
  }

  try {
    await context.dependencies.mutationGate.run(channelId, async () => {
      const latestState = await context.dependencies.chatStore.read();
      if (!latestState.channels.some((channel) => channel.id === channelId)) {
        return;
      }
      if (latestState.selectedChannelId === channelId) {
        requireChannel(latestState, channelId).unreadCount = 0;
        await context.dependencies.chatStore.write(latestState);
      }
    });
  } catch (persistError) {
    logBackgroundDispatchPersistenceError(channelId, persistError);
  }
  publishChannelMutationEvents(context, channelId, 'updated');
}


async function handleRestListChannels(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      channels: state.channels.map((channel) => toChannelSummary(channel, state)),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestCreateChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<CreateChatChannelInput>(context.request);
    const originSurface = resolveCreateOriginSurface(body.originSurface, {
      targetNoun: 'Channel create request',
      telemetryTarget: 'channel',
    });
    const persisted = await persistCreatedChannel(context, {
      ...body,
      originSurface,
    });
    const createdChannelId = persisted.selectedChannelId;
    if (!createdChannelId) {
      throw new Error('Failed to select created channel');
    }
    sendJson(context.response, 201, {
      channel: buildChannelView(persisted, createdChannelId),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    let state = await context.dependencies.chatStore.read();
    state = await repairChannelReadState(
      {
        chatStore: context.dependencies.chatStore,
        mutationGate: context.dependencies.mutationGate,
        runtimeDataDir: context.dependencies.config.runtimeDataDir,
        now: context.dependencies.now,
      },
      channelId,
      state,
    );
    sendJson(context.response, 200, {
      channel: buildChannelView(state, channelId),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestPatchChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<UpdateChannelInput>(context.request);
    await context.dependencies.mutationGate.run(channelId, async () => {
      let persisted = await context.dependencies.chatStore.read();

      if (body.title !== undefined) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) {
          sendJson(context.response, 400, { error: 'title_required', message: 'Title must not be empty.' });
          return;
        }
        persisted = await persistRenamedChannel(context, channelId, title);
      }

      if (
        body.pendingProvider !== undefined
        || body.pendingModel !== undefined
        || body.pendingInstance !== undefined
        || body.pendingModelSelection !== undefined
      ) {
        const nextState = setChannelPendingExecutionTarget(persisted, channelId, {
          provider: body.pendingProvider,
          model: body.pendingModel,
          instance: body.pendingInstance,
          modelSelection: body.pendingModelSelection,
        }, nowFrom(context.dependencies));
        persisted = await context.dependencies.chatStore.write(nextState);
      }

      if (body.resetContinuity === true) {
        const currentChannel = requireChannel(persisted, channelId);
        if (currentChannel.composerMode !== 'solo' || isDirectLaneChannel(currentChannel)) {
          sendJson(context.response, 400, {
            error: 'continuity_reset_unsupported',
            message: 'Start fresh is currently only supported for solo chats.',
          });
          return;
        }
        const existingSessionId =
          currentChannel.orchestratorLease.sessionId?.trim() || null;
        if (existingSessionId) {
          await bestEffortFlushRuntimeSessionMemory({
            runtimeClient: context.dependencies.runtimeClient,
            sessionId: existingSessionId,
            requestedPhase: 'pre_reset',
            memoryService: context.dependencies.memoryService,
            companionStore: context.dependencies.companionStore,
            coreStore: context.dependencies.chatStore,
            now: nowFrom(context.dependencies),
          });
          try {
            await context.dependencies.runtimeClient.closeSession(existingSessionId);
          } catch (error) {
            logContinuityResetCleanupError(channelId, error);
          }
        }
        const nextState = resetSoloChannelContinuity(
          persisted,
          channelId,
          nowFrom(context.dependencies),
        );
        persisted = await context.dependencies.chatStore.write(nextState);
      }

      sendJson(context.response, 200, {
        channel: toChannelSummary(requireChannel(persisted, channelId), persisted),
      });
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestPatchChannelParticipant(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
  participantId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<UpdateChannelParticipantInput>(context.request);
    await context.dependencies.mutationGate.run(channelId, async () => {
      if (body.name === undefined && body.roleHint === undefined) {
        sendJson(context.response, 400, {
          error: 'participant_update_required',
          message: 'At least one participant field must be updated.',
        });
        return;
      }

      await persistUpdatedChannelParticipant(context, channelId, participantId, {
        name: body.name,
        roleHint: body.roleHint,
      });
      sendJson(context.response, 200, { updated: true, channelId, participantId });
      publishChannelMutationEvents(context, channelId);
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestDeleteChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    await context.dependencies.mutationGate.run(channelId, async () => {
      await persistDeletedChannel(context, channelId);
      sendJson(context.response, 200, { deleted: true, channelId });
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListMessages(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      messages: requireChannel(state, channelId).messages,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestSendMessage(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<SendChannelMessageInput>(context.request);
    let begunDispatch:
      | Awaited<ReturnType<typeof beginChannelMessageDispatch>>
      | null = null;

    await context.dependencies.mutationGate.run(channelId, async () => {
      const stateBefore = await context.dependencies.chatStore.read();
      begunDispatch = await beginChannelMessageDispatch(
        stateBefore,
        channelId,
        body,
        context.dependencies.runtimeClient,
        nowFrom(context.dependencies),
        {
          companionStore: context.dependencies.companionStore,
          memoryService: context.dependencies.memoryService,
          chatStore: context.dependencies.chatStore,
          chatStatePath: context.dependencies.config.chatStatePath,
          runtimeDataDir: context.dependencies.config.runtimeDataDir,
          runtimeRecovery: {
            staleSessionRetryLimit: context.dependencies.config.runtimeStaleSessionRetryLimit,
          },
          cancellationRegistry: channelDispatchCancellationRegistry,
          onStateWritten: notifyStreamTargetChanged,
        },
      );
      const appShell = await buildAppShellPayload(
        context.dependencies,
        begunDispatch.state,
      );

      sendJson(context.response, 200, {
        appShell,
        phase: 'acknowledged',
        message: begunDispatch.userMessage,
        results: begunDispatch.results,
        dispatch: {
          channelId,
          results: begunDispatch.results,
        },
      });
    });

    if (!begunDispatch) {
      throw new Error('Channel message dispatch did not produce an acknowledged state.');
    }
    const acknowledgedDispatch: Awaited<ReturnType<typeof beginChannelMessageDispatch>> =
      begunDispatch;

    publishChannelMutationEvents(context, channelId, 'message_added');
    void (async () => {
      await continueAcknowledgedChannelDispatchInBackground(
        context,
        channelId,
        acknowledgedDispatch,
      );
    })();
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestRetryMessage(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    let acknowledgedDispatch:
      | Awaited<ReturnType<typeof beginChannelMessageRetryDispatch>>
      | null = null;

    await context.dependencies.mutationGate.run(channelId, async () => {
      const state = await context.dependencies.chatStore.read();
      const core = await context.dependencies.chatStore.readCore();
      const channel = requireChannel(state, channelId);
      const roomRouting = resolveRoomRoutingState(channel.roomRouting);
      const retryMessage = channel.messages.find((message) => message.id === messageId)
        ?? buildCanonicalRetryMessage(core, channelId, messageId);
      if (!retryMessage) {
        sendJson(
          context.response,
          404,
          buildRestErrorPayload(
            'message_not_found',
            'Message not found.',
          ),
        );
        return;
      }
      if (retryMessage.senderKind !== 'user') {
        sendJson(
          context.response,
          400,
          buildRestErrorPayload(
            'message_retry_invalid_sender',
            'Only user messages can be retried.',
          ),
        );
        return;
      }
      if (roomRouting.workflow.activeTurn) {
        sendJson(
          context.response,
          409,
          buildRestErrorPayload(
            'message_retry_in_progress',
            'Cannot retry while this room already has an active turn.',
          ),
        );
        return;
      }
      if (findLatestUserMessageId(channel, core) !== messageId) {
        sendJson(
          context.response,
          409,
          buildRestErrorPayload(
            'message_retry_not_latest',
            'Only the latest acknowledged user message can be retried.',
          ),
        );
        return;
      }
      const retryAvailableFromWorkflow = roomRouting.lastOutcome?.sourceMessageId === messageId
        && roomRouting.lastOutcome.status === 'error';
      const retryAvailableFromCanonical = hasCanonicalRetryableUserTurn(core, channelId, messageId);
      if (!retryAvailableFromWorkflow && !retryAvailableFromCanonical) {
        sendJson(
          context.response,
          409,
          buildRestErrorPayload(
            'message_retry_not_available',
            'Retry is only available for the latest failed acknowledged user message.',
          ),
        );
        return;
      }

      acknowledgedDispatch = await beginChannelMessageRetryDispatch(
        state,
        channelId,
        messageId,
        context.dependencies.runtimeClient,
        nowFrom(context.dependencies),
        {
          companionStore: context.dependencies.companionStore,
          memoryService: context.dependencies.memoryService,
          chatStore: context.dependencies.chatStore,
          chatStatePath: context.dependencies.config.chatStatePath,
          runtimeDataDir: context.dependencies.config.runtimeDataDir,
          runtimeRecovery: {
            staleSessionRetryLimit: context.dependencies.config.runtimeStaleSessionRetryLimit,
          },
          cancellationRegistry: channelDispatchCancellationRegistry,
          onStateWritten: notifyStreamTargetChanged,
        },
      );
      const appShell = await buildAppShellPayload(
        context.dependencies,
        acknowledgedDispatch.state,
      );
      sendJson(context.response, 200, {
        appShell,
        phase: 'acknowledged',
        message: acknowledgedDispatch.userMessage,
        results: acknowledgedDispatch.results,
      });
    });

    if (!acknowledgedDispatch) {
      return;
    }

    publishChannelMutationEvents(context, channelId, 'updated');
    void (async () => {
      await continueAcknowledgedChannelDispatchInBackground(
        context,
        channelId,
        acknowledgedDispatch,
      );
    })();
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatChannelResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (await routeChatChannelAttachmentResourceApi(context)) {
    return true;
  }
  if (await routeChatChannelRuntimeResourceApi(context)) {
    return true;
  }

  if (context.url.pathname === '/api/channels') {
    if (context.method === 'GET') {
      await handleRestListChannels(context, DEFAULT_CHAT_SCOPE_ID);
      return true;
    }
    if (context.method === 'POST') {
      await handleRestCreateChannel(context, DEFAULT_CHAT_SCOPE_ID);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const canonicalChannelMessagesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/messages$/u,
  );
  if (canonicalChannelMessagesMatch) {
    if (context.method === 'GET') {
      await handleRestListMessages(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelMessagesMatch[0]!,
      );
      return true;
    }
    if (context.method === 'POST') {
      await handleRestSendMessage(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelMessagesMatch[0]!,
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const canonicalChannelMessageRetryMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/messages\/([^/]+)\/retry$/u,
  );
  if (canonicalChannelMessageRetryMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestRetryMessage(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelMessageRetryMatch[0]!,
      canonicalChannelMessageRetryMatch[1]!,
    );
    return true;
  }

  const canonicalChannelParticipantMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/participants\/([^/]+)$/u,
  );
  if (canonicalChannelParticipantMatch) {
    if (context.method !== 'PATCH') {
      sendMethodNotAllowed(context.response, ['PATCH']);
      return true;
    }
    await handleRestPatchChannelParticipant(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelParticipantMatch[0]!,
      canonicalChannelParticipantMatch[1]!,
    );
    return true;
  }

  const canonicalChannelDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)$/u,
  );
  if (canonicalChannelDetailMatch) {
    if (context.method === 'GET') {
      await handleRestGetChannel(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelDetailMatch[0]!,
      );
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestPatchChannel(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelDetailMatch[0]!,
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleRestDeleteChannel(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelDetailMatch[0]!,
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH', 'DELETE']);
    return true;
  }

  return false;
}
