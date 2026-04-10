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
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../../state/runtimeActions.js';
import {
  appendMessage,
  replaceState,
  requireChannel,
  selectChannel,
  touchParallelChatGroup,
} from '../../state/model/index.js';
import { createMergedDispatchChatStore } from '../../state/runtime-dispatch/merge.js';
import type {
  CancelParallelChatGroupInput,
  ParallelChatDispatchResponse,
  ParallelChatDispatchResult,
  RelayParallelChatMessageInput,
  SendChannelMessageInput,
  SendParallelChatMessageInput,
  ChatState,
} from '../contracts.js';
import { persistAttachmentsForChannels } from '../attachmentSupport.js';
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

class ParallelChatAttachmentWorkspaceError extends Error {
  readonly channelIds: string[];

  constructor(channelIds: string[]) {
    super('parallel_attachment_workspace_required');
    this.name = 'ParallelChatAttachmentWorkspaceError';
    this.channelIds = channelIds;
  }
}

function buildAttachedFilesMessageBody(
  body: string,
  attachments: Array<{ relativePath: string }>,
): string {
  if (attachments.length === 0) {
    return body;
  }

  const refs = attachments.map((attachment) => `- ${attachment.relativePath}`).join('\n');
  return `[Attached files in working directory:]\n${refs}\n\n${body}`;
}

type ParallelChatGroupState = ChatState['parallelChatGroups'][number];

interface PreparedParallelChatDispatch {
  state: ChatState;
  activeChannelId: string;
  channelInputs: Map<string, SendChannelMessageInput>;
}

interface BegunParallelChatDispatch {
  channelId: string;
  begun: Awaited<ReturnType<typeof beginChannelMessageDispatch>> | null;
  status: 'sent' | 'error' | 'skipped';
  sourceMessageId?: string;
  error?: string;
}

interface StagedParallelChatDispatch {
  groupId: string;
  now: Date;
  nowIso: string;
  lockedChannelIds: string[];
  acknowledgedState: ChatState;
  begunDispatches: BegunParallelChatDispatch[];
}

async function dispatchParallelChatBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    sharedAttachments?: NonNullable<SendParallelChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
    prepare: (
      state: ChatState,
      group: ParallelChatGroupState,
    ) => Promise<PreparedParallelChatDispatch>;
  },
): Promise<ParallelChatDispatchResponse> {
  const staged = await withLockedParallelChatGroup(
    context,
    options.groupId,
    async (lockedState, lockedGroup) => {
      const prepared = await options.prepare(lockedState, lockedGroup);
      return stageParallelChatBodies(context, {
        groupId: options.groupId,
        state: prepared.state,
        activeChannelId: prepared.activeChannelId,
        channelInputs: prepared.channelInputs,
        lockedChannelIds: lockedGroup.memberChannelIds,
        sharedAttachments: options.sharedAttachments,
        persistAcknowledgedStateBeforeDispatch: options.persistAcknowledgedStateBeforeDispatch,
      });
    },
  );

  return finalizeParallelChatBodies(context, staged);
}

async function acknowledgeParallelChatBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    sharedAttachments?: NonNullable<SendParallelChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
    prepare: (
      state: ChatState,
      group: ParallelChatGroupState,
    ) => Promise<PreparedParallelChatDispatch>;
  },
): Promise<{
  staged: StagedParallelChatDispatch;
  response: ParallelChatDispatchResponse;
}> {
  const staged = await withLockedParallelChatGroup(
    context,
    options.groupId,
    async (lockedState, lockedGroup) => {
      const prepared = await options.prepare(lockedState, lockedGroup);
      return stageParallelChatBodies(context, {
        groupId: options.groupId,
        state: prepared.state,
        activeChannelId: prepared.activeChannelId,
        channelInputs: prepared.channelInputs,
        lockedChannelIds: lockedGroup.memberChannelIds,
        sharedAttachments: options.sharedAttachments,
        persistAcknowledgedStateBeforeDispatch: options.persistAcknowledgedStateBeforeDispatch,
      });
    },
  );

  const appShell = await buildAppShellPayload(
    context.dependencies,
    staged.acknowledgedState,
  );
  return {
    staged,
    response: {
      appShell,
      groupId: staged.groupId,
      phase: 'acknowledged',
      results: staged.begunDispatches.map((dispatch) => ({
        channelId: dispatch.channelId,
        status: dispatch.status,
        ...(dispatch.sourceMessageId ? { sourceMessageId: dispatch.sourceMessageId } : {}),
        ...(dispatch.error ? { error: dispatch.error } : {}),
      })),
    },
  };
}

async function stageParallelChatBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    state: ChatState;
    activeChannelId: string;
    channelInputs: Map<string, SendChannelMessageInput>;
    lockedChannelIds: string[];
    sharedAttachments?: NonNullable<SendParallelChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
  },
): Promise<StagedParallelChatDispatch> {
  const now = nowFrom(context.dependencies);
  const nowIso = now.toISOString();
  const baseState = selectChannel(options.state, options.activeChannelId, now);
  let acknowledgedState = baseState;
  const hasSharedAttachments = Boolean(options.sharedAttachments?.length);

  let effectiveChannelInputs = options.channelInputs;
  if (options.sharedAttachments?.length) {
    const attachmentsByChannelId = await persistAttachmentsForChannels({
      state: acknowledgedState,
      channelIds: [...options.channelInputs.keys()],
      files: options.sharedAttachments,
      runtimeDataDir: context.dependencies.config.runtimeDataDir,
    });
    const missingAttachmentChannelIds = [...options.channelInputs.keys()].filter((channelId) =>
      !attachmentsByChannelId.has(channelId));
    if (missingAttachmentChannelIds.length > 0) {
      throw new ParallelChatAttachmentWorkspaceError(missingAttachmentChannelIds);
    }

    effectiveChannelInputs = new Map(
      [...options.channelInputs.entries()].map(([channelId, input]) => {
        const attachments = attachmentsByChannelId.get(channelId) ?? [];
        if (attachments.length === 0) {
          return [channelId, input];
        }
        return [
          channelId,
          {
            ...input,
            body: buildAttachedFilesMessageBody(input.body, attachments),
          },
        ];
      }),
    );
  }

  const begunDispatches: BegunParallelChatDispatch[] = [];
  for (const [channelId, input] of effectiveChannelInputs.entries()) {
    const trimmedBody = input.body.trim();
    if (!trimmedBody) {
      begunDispatches.push({
        channelId,
        begun: null,
        status: 'skipped',
      });
      continue;
    }

    try {
      const begun = await beginChannelMessageDispatch(
        acknowledgedState,
        channelId,
        { ...input, body: trimmedBody },
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
          cancellationRegistry: channelDispatchCancellationRegistry,
        },
      );
      acknowledgedState = replaceState(
        acknowledgedState,
        requireChannel(begun.state, channelId),
      );
      begunDispatches.push({
        channelId,
        begun,
        status: 'sent',
        sourceMessageId: begun.results[0]?.sourceMessageId,
      });
    } catch (error) {
      begunDispatches.push({
        channelId,
        begun: null,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to dispatch parallel chat turn.',
      });
    }
  }

  let mergedState = acknowledgedState;
  if (options.persistAcknowledgedStateBeforeDispatch) {
    touchParallelChatGroup(mergedState, options.groupId, nowIso, nowIso);
    await context.dependencies.chatStore.write(mergedState);
  }

  return {
    groupId: options.groupId,
    now,
    nowIso,
    lockedChannelIds: [...options.lockedChannelIds],
    acknowledgedState: mergedState,
    begunDispatches,
  };
}

async function finalizeParallelChatBodies(
  context: ChatApiRouteContext,
  staged: StagedParallelChatDispatch,
): Promise<ParallelChatDispatchResponse> {
  const dispatches = await Promise.all(
    staged.begunDispatches.map(async (dispatch) => {
      if (!dispatch.begun || dispatch.status !== 'sent') {
        return {
          kind: 'noop' as const,
          channelId: dispatch.channelId,
          status: dispatch.status,
          sourceMessageId: dispatch.sourceMessageId,
          error: dispatch.error,
        };
      }

      try {
        const dispatchChatStore = createMergedDispatchChatStore({
          chatStore: context.dependencies.chatStore,
          mutationGate: context.dependencies.mutationGate,
          channelId: dispatch.channelId,
          baselineState: dispatch.begun.state,
          now: () => nowFrom(context.dependencies),
        });
        const completed = await continueBegunChannelMessageDispatch(
          dispatch.begun,
          dispatch.channelId,
          context.dependencies.runtimeClient,
          staged.now,
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
        const failedResults = completed.results.filter((result) => result.status === 'error');
        return {
          kind: 'completed' as const,
          channelId: dispatch.channelId,
          status: failedResults.length > 0 ? 'error' as const : 'sent' as const,
          sourceMessageId: completed.results[0]?.sourceMessageId,
          error: failedResults.length > 0
            ? failedResults.map((result) => result.error || 'Runtime dispatch failed.').join(' ')
            : undefined,
        };
      } catch (error) {
        return {
          kind: 'failed' as const,
          channelId: dispatch.channelId,
          begun: dispatch.begun,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Failed to dispatch parallel chat turn.',
          sourceMessageId: dispatch.begun.results[0]?.sourceMessageId,
          rawError: error,
        };
      }
    }),
  );

  return runLockedChannels(
    context,
    staged.lockedChannelIds,
    async () => {
      let mergedState = await context.dependencies.chatStore.read();
      const results: ParallelChatDispatchResult[] = [];

      for (const dispatch of dispatches) {
        if (!mergedState.channels.some((channel) => channel.id === dispatch.channelId)) {
          results.push({
            channelId: dispatch.channelId,
            status: dispatch.status,
            ...(dispatch.sourceMessageId ? { sourceMessageId: dispatch.sourceMessageId } : {}),
            ...(dispatch.error ? { error: dispatch.error } : {}),
          });
          continue;
        }

        if (dispatch.kind === 'failed') {
          const settled = await settleBegunChannelMessageDispatchFailure(
            dispatch.begun,
            dispatch.channelId,
            dispatch.rawError,
            staged.now,
            {
              latestState: mergedState,
            },
          );
          mergedState = settled.state;
        }

        if (dispatch.kind !== 'noop' && mergedState.selectedChannelId === dispatch.channelId) {
          requireChannel(mergedState, dispatch.channelId).unreadCount = 0;
        }
        results.push({
          channelId: dispatch.channelId,
          status: dispatch.status,
          ...(dispatch.sourceMessageId ? { sourceMessageId: dispatch.sourceMessageId } : {}),
          ...(dispatch.error ? { error: dispatch.error } : {}),
        });
      }

      if (mergedState.parallelChatGroups.some((group) => group.id === staged.groupId)) {
        touchParallelChatGroup(mergedState, staged.groupId, staged.nowIso, staged.nowIso);
      }
      const persisted = await context.dependencies.chatStore.write(mergedState);
      const appShell = await buildAppShellPayload(context.dependencies, persisted);
      return {
        appShell,
        groupId: staged.groupId,
        phase: 'completed' as const,
        results,
      };
    },
  );
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
