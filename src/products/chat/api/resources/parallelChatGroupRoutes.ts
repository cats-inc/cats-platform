import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../../shared/http.js';
import {
  buildParallelChatMemberLabel,
  buildParallelChatRelayIncomingNote,
  buildParallelChatRelayOutgoingNote,
  buildParallelChatRelayPrompt,
  findParallelChatRelayCommand,
  normalizeParallelChatRelayCommand,
} from '../../shared/parallelChats.js';
import {
  appendMessage,
  requireChannel,
} from '../../state/model/index.js';
import type {
  CancelParallelChatGroupInput,
  RelayParallelChatMessageInput,
  SendParallelChatMessageInput,
} from '../contracts.js';
import {
  buildAppShellPayload,
  cancelSessionIds,
  collectActiveChannelSessionIds,
  handleRestError,
  hasActiveChannelTurn,
  nowFrom,
  sendRestError,
  waitForCancelledChannelTurns,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  handleCreateParallelChatGroup,
  handleDeleteParallelChatGroup,
  handlePatchParallelChatGroup,
  handleUngroupParallelChatGroup,
} from './parallelChatGroupCrudRoutes.js';
import {
  channelDispatchCancellationRegistry,
  DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
} from '../../state/runtime-dispatch/cancellation.js';
import {
  acknowledgeParallelChatBodies,
  dispatchParallelChatBodies,
  finalizeParallelChatBodies,
  ParallelChatAttachmentWorkspaceError,
} from './parallelChatGroupDispatch.js';
import {
  logParallelChatFinalizeError,
  publishParallelChatMutationEvents,
  requireParallelChatGroup,
  runLockedChannels,
  withLockedParallelChatGroup,
} from './parallelChatGroupSupport.js';

class RelayResponseSentError extends Error {
  constructor() {
    super('relay_response_sent');
    this.name = 'RelayResponseSentError';
  }
}

async function handleSendParallelChatGroupMessage(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<SendParallelChatMessageInput>(context.request);

    const state = await context.dependencies.chatStore.read();
    const group = requireParallelChatGroup(state, groupId);
    if (!group.memberChannelIds.includes(body.activeChannelId)) {
      sendRestError(
        context,
        400,
        'channel_not_in_compare_group',
        'The active chat is not part of this Parallel chat group.',
      );
      return;
    }

    const acknowledged = await acknowledgeParallelChatBodies(context, {
      groupId,
      sharedAttachments: body.attachments,
      persistAcknowledgedStateBeforeDispatch: true,
      prepare: async (lockedState, lockedGroup) => ({
        state: lockedState,
        activeChannelId: body.activeChannelId,
        channelInputs: new Map(
          lockedGroup.memberChannelIds.map((channelId) => [channelId, { body: body.body }]),
        ),
      }),
    });
    sendJson(context.response, 200, acknowledged.response);
    publishParallelChatMutationEvents(
      context,
      acknowledged.staged.lockedChannelIds,
      'message_added',
    );
    if (acknowledged.staged.begunDispatches.some((dispatch) => dispatch.begun && dispatch.status === 'sent')) {
      void finalizeParallelChatBodies(context, acknowledged.staged)
        .catch((error) => {
          logParallelChatFinalizeError(error);
        })
        .finally(() => {
          publishParallelChatMutationEvents(
            context,
            acknowledged.staged.lockedChannelIds,
            'updated',
          );
        });
    }
  } catch (error) {
    if (error instanceof ParallelChatAttachmentWorkspaceError) {
      const noun = error.channelIds.length === 1 ? 'chat has' : 'chats have';
      sendRestError(
        context,
        409,
        'parallel_attachment_workspace_required',
        `One or more parallel ${noun} no attachment workspace. Select a folder or activate the chats first.`,
      );
      return;
    }
    handleRestError(context, error);
  }
}

async function handleCancelParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<CancelParallelChatGroupInput>(context.request);
    const now = nowFrom(context.dependencies);
    const nowIso = now.toISOString();
    const state = await context.dependencies.chatStore.read();
    const group = requireParallelChatGroup(state, groupId);
    if (!group.memberChannelIds.includes(body.activeChannelId)) {
      sendRestError(
        context,
        400,
        'channel_not_in_compare_group',
        'The active chat is not part of this Parallel chat group.',
      );
      return;
    }

    const activeTargetChannelIds = group.memberChannelIds.filter((channelId) =>
      hasActiveChannelTurn(requireChannel(state, channelId)),
    );
    const sessionIds = group.memberChannelIds.flatMap((channelId) =>
      collectActiveChannelSessionIds(requireChannel(state, channelId)),
    );
    for (const channelId of activeTargetChannelIds) {
      channelDispatchCancellationRegistry.request(
        channelId,
        nowIso,
        DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
      );
    }

    const cancelledSessionCount = await cancelSessionIds(context, sessionIds);
    const settledState = await waitForCancelledChannelTurns(
      context,
      activeTargetChannelIds,
    );
    const appShell = await buildAppShellPayload(context.dependencies, settledState);
    sendJson(context.response, 200, {
      appShell,
      groupId,
      cancellation: {
        activeChannelId: body.activeChannelId,
        cancelledAt: nowIso,
        targetChannelIds: activeTargetChannelIds,
        cancelledSessionCount,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRelayParallelChatGroupMessage(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<RelayParallelChatMessageInput>(context.request);
    const normalizedCommand = normalizeParallelChatRelayCommand(body.command);
    if (!normalizedCommand) {
      sendRestError(
        context,
        400,
        'invalid_relay_command',
        'The selected relay command is not supported.',
      );
      return;
    }
    const response = await dispatchParallelChatBodies(context, {
      groupId,
      persistAcknowledgedStateBeforeDispatch: true,
      prepare: async (state, group) => {
        if (!group.memberChannelIds.includes(body.activeChannelId)) {
          sendRestError(
            context,
            400,
            'channel_not_in_compare_group',
            'The active chat is not part of this Parallel chat group.',
          );
          throw new RelayResponseSentError();
        }
        if (!group.memberChannelIds.includes(body.sourceChannelId)) {
          sendRestError(
            context,
            400,
            'source_channel_not_in_compare_group',
            'The source chat is not part of this Parallel chat group.',
          );
          throw new RelayResponseSentError();
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
          throw new RelayResponseSentError();
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
          throw new RelayResponseSentError();
        }

        const sourceMemberLabel = buildParallelChatMemberLabel({
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
        const commandDefinition = findParallelChatRelayCommand(normalizedCommand);
        const targetMemberLabels = normalizedTargetChannelIds.map((channelId) => {
          const targetChannel = requireChannel(state, channelId);
          return buildParallelChatMemberLabel({
            provider: targetChannel.pendingProvider ?? state.globalOrchestrator.executionTarget.provider,
            instance:
              targetChannel.pendingInstance
              ?? state.globalOrchestrator.executionTarget.instance
              ?? null,
            model:
              targetChannel.pendingModel
              ?? state.globalOrchestrator.executionTarget.model
              ?? null,
            modelSelection:
              targetChannel.pendingModelSelection
              ?? state.globalOrchestrator.executionModelSelection
              ?? null,
          });
        });
        const relayBody = buildParallelChatRelayPrompt({
          command: normalizedCommand,
          sourceMemberLabel,
          sourceBody: sourceMessage.body,
        });

        const now = nowFrom(context.dependencies);
        let relayState = appendMessage(
          state,
          body.sourceChannelId,
          {
            senderKind: 'system',
            senderName: 'Chat',
            body: buildParallelChatRelayOutgoingNote({
              command: normalizedCommand,
              sourceMessageId: body.sourceMessageId,
              targetMemberLabels,
            }),
          },
          now,
          {
            metadata: {
              event: 'parallel_relay_outgoing',
              relayCommand: normalizedCommand,
              relayCommandLabel: commandDefinition.label,
              sourceMessageId: body.sourceMessageId,
              sourceChannelId: body.sourceChannelId,
              targetChannelIds: normalizedTargetChannelIds,
            },
            incrementUnread: false,
          },
        ).state;

        for (const targetChannelId of normalizedTargetChannelIds) {
          relayState = appendMessage(
            relayState,
            targetChannelId,
            {
              senderKind: 'system',
              senderName: 'Chat',
              body: buildParallelChatRelayIncomingNote({
                command: normalizedCommand,
                sourceMessageId: body.sourceMessageId,
                sourceMemberLabel,
              }),
            },
            now,
            {
              metadata: {
                event: 'parallel_relay_incoming',
                relayCommand: normalizedCommand,
                relayCommandLabel: commandDefinition.label,
                sourceMessageId: body.sourceMessageId,
                sourceChannelId: body.sourceChannelId,
                sourceMemberLabel,
              },
              incrementUnread: false,
            },
          ).state;
        }

        return {
          state: relayState,
          activeChannelId: body.activeChannelId,
          channelInputs: new Map(normalizedTargetChannelIds.map((channelId) => [
            channelId,
            {
              body: relayBody,
              messageMetadata: {
                event: 'parallel_relay_prompt',
                relayCommand: normalizedCommand,
                relayCommandLabel: commandDefinition.label,
                sourceMessageId: body.sourceMessageId,
                sourceChannelId: body.sourceChannelId,
                sourceMemberLabel,
                verbosity: 'verbose',
              },
            },
          ])),
        };
      },
    });
    sendJson(context.response, 200, response);
  } catch (error) {
    if (error instanceof RelayResponseSentError) {
      return;
    }
    handleRestError(context, error);
  }
}

export async function routeParallelChatGroupResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/concurrent-groups') {
    if (context.method === 'POST') {
      await handleCreateParallelChatGroup(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const parallelChatGroupDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)$/u,
  );
  if (parallelChatGroupDetailMatch) {
    if (context.method === 'PATCH') {
      await handlePatchParallelChatGroup(context, parallelChatGroupDetailMatch[0]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteParallelChatGroup(context, parallelChatGroupDetailMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PATCH', 'DELETE']);
    return true;
  }

  const parallelChatGroupMessagesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/messages$/u,
  );
  if (parallelChatGroupMessagesMatch) {
    if (context.method === 'POST') {
      await handleSendParallelChatGroupMessage(context, parallelChatGroupMessagesMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const parallelChatGroupCancelMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/cancel$/u,
  );
  if (parallelChatGroupCancelMatch) {
    if (context.method === 'POST') {
      await handleCancelParallelChatGroup(context, parallelChatGroupCancelMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const parallelChatGroupRelayMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/relay$/u,
  );
  if (parallelChatGroupRelayMatch) {
    if (context.method === 'POST') {
      await handleRelayParallelChatGroupMessage(context, parallelChatGroupRelayMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const parallelChatGroupUngroupMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/ungroup$/u,
  );
  if (parallelChatGroupUngroupMatch) {
    if (context.method === 'POST') {
      await handleUngroupParallelChatGroup(context, parallelChatGroupUngroupMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  return false;
}
