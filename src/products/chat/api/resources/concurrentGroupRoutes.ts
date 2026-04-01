import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../../shared/http.js';
import {
  buildConcurrentChatMemberLabel,
  buildConcurrentRelayPrompt,
} from '../../shared/concurrentChats.js';
import { routeChannelMessage } from '../../state/runtimeActions.js';
import {
  createConcurrentGroup,
  replaceState,
  requireChannel,
  selectChannel,
  touchConcurrentGroup,
} from '../../state/model/index.js';
import type {
  ConcurrentChatDispatchResponse,
  ConcurrentChatDispatchResult,
  CreateConcurrentChatGroupInput,
  RelayConcurrentChatMessageInput,
  SendConcurrentChatMessageInput,
  ChatState,
} from '../contracts.js';
import {
  buildAppShellPayload,
  handleRestError,
  nowFrom,
  sendRestError,
  type ChatApiRouteContext,
} from '../routeSupport.js';

function requireConcurrentGroup(
  state: ChatState,
  groupId: string,
): ChatState['concurrentGroups'][number] {
  const group = state.concurrentGroups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Concurrent group not found: ${groupId}`);
  }

  return group;
}

async function dispatchConcurrentBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    state: ChatState;
    activeChannelId: string;
    channelBodies: Map<string, string>;
  },
): Promise<ConcurrentChatDispatchResponse> {
  const now = nowFrom(context.dependencies);
  const nowIso = now.toISOString();
  const baseState = selectChannel(options.state, options.activeChannelId, now);
  const dispatches = await Promise.all(
    [...options.channelBodies.entries()].map(async ([channelId, body]) => {
      const trimmedBody = body.trim();
      if (!trimmedBody) {
        return {
          channelId,
          status: 'skipped' as const,
          state: null,
        };
      }

      try {
        const dispatch = await routeChannelMessage(
          baseState,
          channelId,
          { body: trimmedBody },
          context.dependencies.runtimeClient,
          now,
          {
            companionStore: context.dependencies.companionStore,
            memoryService: context.dependencies.memoryService,
            chatStatePath: context.dependencies.config.chatStatePath,
            runtimeDataDir: context.dependencies.config.runtimeDataDir,
            runtimeRecovery: {
              staleSessionRetryLimit: context.dependencies.config.runtimeStaleSessionRetryLimit,
            },
          },
        );
        const failedResults = dispatch.results.filter((result) => result.status === 'error');
        return {
          channelId,
          status: failedResults.length > 0 ? 'error' as const : 'sent' as const,
          sourceMessageId: dispatch.results[0]?.sourceMessageId,
          error: failedResults.length > 0
            ? failedResults.map((result) => result.error || 'Runtime dispatch failed.').join(' ')
            : undefined,
          state: dispatch.state,
        };
      } catch (error) {
        return {
          channelId,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Failed to dispatch parallel chat turn.',
          state: null,
        };
      }
    }),
  );

  let mergedState = baseState;
  const results: ConcurrentChatDispatchResult[] = [];
  for (const dispatch of dispatches) {
    if (dispatch.state) {
      mergedState = replaceState(
        mergedState,
        requireChannel(dispatch.state, dispatch.channelId),
      );
    }
    results.push({
      channelId: dispatch.channelId,
      status: dispatch.status,
      ...(dispatch.sourceMessageId ? { sourceMessageId: dispatch.sourceMessageId } : {}),
      ...(dispatch.error ? { error: dispatch.error } : {}),
    });
  }

  touchConcurrentGroup(mergedState, options.groupId, nowIso, nowIso);
  const persisted = await context.dependencies.chatStore.write(mergedState);
  const appShell = await buildAppShellPayload(context.dependencies, persisted);
  return {
    appShell,
    groupId: options.groupId,
    results,
  };
}

async function handleCreateConcurrentGroup(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateConcurrentChatGroupInput>(context.request);
    if (!Array.isArray(body.targets) || body.targets.length < 2) {
      sendRestError(
        context,
        400,
        'compare_targets_required',
        'Parallel chats require at least two model targets.',
      );
      return;
    }
    const title = body.title?.trim();
    if (!title) {
      sendRestError(context, 400, 'title_required', 'Parallel chat title must not be empty.');
      return;
    }

    const nextState = createConcurrentGroup(
      await context.dependencies.chatStore.read(),
      {
        title,
        repoPath: body.repoPath,
        responseLanguage: body.responseLanguage,
        targets: body.targets,
      },
      nowFrom(context.dependencies),
    );
    const groupId = nextState.concurrentGroups[0]?.id ?? '';
    const persisted = await context.dependencies.chatStore.write(nextState);
    const appShell = await buildAppShellPayload(context.dependencies, persisted);
    const group = appShell.chat.concurrentGroups.find((candidate) => candidate.id === groupId);
    if (!group) {
      throw new Error('Parallel chat group was created but not returned in the app shell.');
    }

    sendJson(context.response, 201, {
      appShell,
      group,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleSendConcurrentGroupMessage(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<SendConcurrentChatMessageInput>(context.request);
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      sendRestError(
        context,
        400,
        'compare_attachments_not_supported',
        'Shared attachments are not supported in Parallel chat yet. Switch this turn to only the current chat.',
      );
      return;
    }

    const state = await context.dependencies.chatStore.read();
    const group = requireConcurrentGroup(state, groupId);
    if (!group.memberChannelIds.includes(body.activeChannelId)) {
      sendRestError(
        context,
        400,
        'channel_not_in_compare_group',
        'The active chat is not part of this Parallel chat group.',
      );
      return;
    }

    const response = await dispatchConcurrentBodies(context, {
      groupId,
      state,
      activeChannelId: body.activeChannelId,
      channelBodies: new Map(group.memberChannelIds.map((channelId) => [channelId, body.body])),
    });
    sendJson(context.response, 200, response);
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRelayConcurrentGroupMessage(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<RelayConcurrentChatMessageInput>(context.request);
    const state = await context.dependencies.chatStore.read();
    const group = requireConcurrentGroup(state, groupId);
    if (!group.memberChannelIds.includes(body.activeChannelId)) {
      sendRestError(
        context,
        400,
        'channel_not_in_compare_group',
        'The active chat is not part of this Parallel chat group.',
      );
      return;
    }
    if (!group.memberChannelIds.includes(body.sourceChannelId)) {
      sendRestError(
        context,
        400,
        'source_channel_not_in_compare_group',
        'The source chat is not part of this Parallel chat group.',
      );
      return;
    }

    const sourceChannel = requireChannel(state, body.sourceChannelId);
    const sourceMessage = sourceChannel.messages.find((message) => message.id === body.sourceMessageId) ?? null;
    if (!sourceMessage || !sourceMessage.body.trim()) {
      sendRestError(
        context,
        400,
        'source_message_required',
        'The selected reply could not be relayed.',
      );
      return;
    }

    const targetChannelIds = body.targetPolicy === 'single'
      ? [body.targetChannelId ?? '']
      : group.memberChannelIds.filter((channelId) => channelId !== body.sourceChannelId);
    const normalizedTargetChannelIds = targetChannelIds.filter((channelId) =>
      channelId
      && channelId !== body.sourceChannelId
      && group.memberChannelIds.includes(channelId),
    );
    if (normalizedTargetChannelIds.length === 0) {
      sendRestError(
        context,
        400,
        'compare_targets_required',
        'No parallel chat targets were selected for this relay.',
      );
      return;
    }

    const sourceMemberLabel = buildConcurrentChatMemberLabel({
      provider: sourceChannel.pendingProvider ?? state.globalOrchestrator.executionTarget.provider,
      instance:
        sourceChannel.pendingInstance
        ?? state.globalOrchestrator.executionTarget.instance
        ?? null,
      model:
        sourceChannel.pendingModel
        ?? state.globalOrchestrator.executionTarget.model
        ?? null,
      modelSelection:
        sourceChannel.pendingModelSelection
        ?? state.globalOrchestrator.executionModelSelection
        ?? null,
    });
    const relayBody = buildConcurrentRelayPrompt({
      command: body.command,
      sourceMemberLabel,
      sourceBody: sourceMessage.body,
    });

    const response = await dispatchConcurrentBodies(context, {
      groupId,
      state,
      activeChannelId: body.activeChannelId,
      channelBodies: new Map(normalizedTargetChannelIds.map((channelId) => [channelId, relayBody])),
    });
    sendJson(context.response, 200, response);
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeConcurrentGroupResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/concurrent-groups') {
    if (context.method === 'POST') {
      await handleCreateConcurrentGroup(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const concurrentGroupMessagesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/messages$/u,
  );
  if (concurrentGroupMessagesMatch) {
    if (context.method === 'POST') {
      await handleSendConcurrentGroupMessage(context, concurrentGroupMessagesMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const concurrentGroupRelayMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/relay$/u,
  );
  if (concurrentGroupRelayMatch) {
    if (context.method === 'POST') {
      await handleRelayConcurrentGroupMessage(context, concurrentGroupRelayMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  return false;
}
