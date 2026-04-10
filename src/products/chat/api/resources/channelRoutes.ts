import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../../state/runtimeActions.js';
import {
  buildChannelView,
  requireChannel,
  setChannelPendingExecutionTarget,
  toChannelSummary,
} from '../../state/model/index.js';
import { repairChannelReadState } from '../channelRepair.js';
import { createMergedDispatchChatStore } from '../../state/runtime-dispatch/merge.js';
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
  requireValidChatScopeId,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  channelDispatchCancellationRegistry,
} from '../../state/runtime-dispatch/cancellation.js';
import { publishRoomMutation } from '../transportEventPublisher.js';
import { routeChatChannelAttachmentResourceApi } from './channelAttachmentRoutes.js';
import { routeChatChannelRuntimeResourceApi } from './channelRuntimeRoutes.js';

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


async function handleRestListChannels(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      channels: state.channels.map((channel) => toChannelSummary(channel)),
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
    const persisted = await persistCreatedChannel(context, body);
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

      sendJson(context.response, 200, {
        channel: toChannelSummary(requireChannel(persisted, channelId)),
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
    if (!acknowledgedDispatch.preparedTurn) {
      return;
    }
    void (async () => {
      const dispatchNow = nowFrom(context.dependencies);
      const dispatchChatStore = createMergedDispatchChatStore({
        chatStore: context.dependencies.chatStore,
        mutationGate: context.dependencies.mutationGate,
        channelId,
        baselineState: acknowledgedDispatch.state,
        now: () => nowFrom(context.dependencies),
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
