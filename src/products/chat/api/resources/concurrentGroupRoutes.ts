import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../../shared/http.js';
import {
  buildConcurrentChatMemberLabel,
  buildConcurrentRelayIncomingNote,
  buildConcurrentRelayOutgoingNote,
  buildConcurrentRelayPrompt,
  findConcurrentRelayCommand,
  normalizeConcurrentRelayCommand,
} from '../../shared/concurrentChats.js';
import {
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../../state/runtimeActions.js';
import {
  appendMessage,
  createConcurrentGroup,
  replaceState,
  requireChannel,
  selectChannel,
  touchConcurrentGroup,
} from '../../state/model/index.js';
import type {
  CancelConcurrentChatGroupInput,
  ConcurrentChatDispatchResponse,
  ConcurrentChatDispatchResult,
  CreateConcurrentChatGroupInput,
  RelayConcurrentChatMessageInput,
  SendChannelMessageInput,
  SendConcurrentChatMessageInput,
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
  persistDeletedConcurrentGroup,
  persistRenamedConcurrentGroup,
  persistUngroupedConcurrentGroup,
  sendRestError,
  waitForCancelledChannelTurns,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import type { UpdateConcurrentChatGroupInput } from '../contracts.js';
import {
  channelDispatchCancellationRegistry,
  DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
} from '../../state/runtime-dispatch/cancellation.js';
import { publishRoomMutation } from '../transportEventPublisher.js';

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

class RelayResponseSentError extends Error {
  constructor() {
    super('relay_response_sent');
    this.name = 'RelayResponseSentError';
  }
}

class ConcurrentAttachmentWorkspaceError extends Error {
  readonly channelIds: string[];

  constructor(channelIds: string[]) {
    super('parallel_attachment_workspace_required');
    this.name = 'ConcurrentAttachmentWorkspaceError';
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

type ConcurrentGroupState = ChatState['concurrentGroups'][number];

interface PreparedConcurrentDispatch {
  state: ChatState;
  activeChannelId: string;
  channelInputs: Map<string, SendChannelMessageInput>;
}

interface BegunConcurrentDispatch {
  channelId: string;
  begun: Awaited<ReturnType<typeof beginChannelMessageDispatch>> | null;
  status: 'sent' | 'error' | 'skipped';
  sourceMessageId?: string;
  error?: string;
}

interface StagedConcurrentDispatch {
  groupId: string;
  now: Date;
  nowIso: string;
  lockedChannelIds: string[];
  acknowledgedState: ChatState;
  begunDispatches: BegunConcurrentDispatch[];
}

function publishConcurrentMutationEvents(
  context: ChatApiRouteContext,
  channelIds: string[],
  kind: 'created' | 'updated' | 'message_added' = 'updated',
): void {
  const timestamp = new Date().toISOString();
  for (const channelId of [...new Set(channelIds)]) {
    publishRoomMutation(context.dependencies.eventHub, channelId, kind);
  }
  context.dependencies.eventHub?.emit({
    kind: 'recents_changed',
    timestamp,
  });
}

async function runLockedChannels<T>(
  context: ChatApiRouteContext,
  channelIds: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const orderedChannelIds = [...new Set(channelIds)].sort();

  const runLocked = async (index: number): Promise<T> => {
    if (index >= orderedChannelIds.length) {
      return operation();
    }

    return context.dependencies.mutationGate.run(
      orderedChannelIds[index]!,
      () => runLocked(index + 1),
    );
  };

  return runLocked(0);
}

async function withLockedConcurrentGroup<T>(
  context: ChatApiRouteContext,
  groupId: string,
  operation: (
    state: ChatState,
    group: ConcurrentGroupState,
  ) => Promise<T>,
): Promise<T> {
  const state = await context.dependencies.chatStore.read();
  const group = requireConcurrentGroup(state, groupId);

  return runLockedChannels(
    context,
    group.memberChannelIds,
    async () => {
      const lockedState = await context.dependencies.chatStore.read();
      return operation(lockedState, requireConcurrentGroup(lockedState, groupId));
    },
  );
}

async function dispatchConcurrentBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    sharedAttachments?: NonNullable<SendConcurrentChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
    prepare: (
      state: ChatState,
      group: ConcurrentGroupState,
    ) => Promise<PreparedConcurrentDispatch>;
  },
): Promise<ConcurrentChatDispatchResponse> {
  const staged = await withLockedConcurrentGroup(
    context,
    options.groupId,
    async (lockedState, lockedGroup) => {
      const prepared = await options.prepare(lockedState, lockedGroup);
      return stageConcurrentBodies(context, {
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

  return finalizeConcurrentBodies(context, staged);
}

async function acknowledgeConcurrentBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    sharedAttachments?: NonNullable<SendConcurrentChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
    prepare: (
      state: ChatState,
      group: ConcurrentGroupState,
    ) => Promise<PreparedConcurrentDispatch>;
  },
): Promise<{
  staged: StagedConcurrentDispatch;
  response: ConcurrentChatDispatchResponse;
}> {
  const staged = await withLockedConcurrentGroup(
    context,
    options.groupId,
    async (lockedState, lockedGroup) => {
      const prepared = await options.prepare(lockedState, lockedGroup);
      return stageConcurrentBodies(context, {
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

async function stageConcurrentBodies(
  context: ChatApiRouteContext,
  options: {
    groupId: string;
    state: ChatState;
    activeChannelId: string;
    channelInputs: Map<string, SendChannelMessageInput>;
    lockedChannelIds: string[];
    sharedAttachments?: NonNullable<SendConcurrentChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
  },
): Promise<StagedConcurrentDispatch> {
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
      throw new ConcurrentAttachmentWorkspaceError(missingAttachmentChannelIds);
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

  const begunDispatches: BegunConcurrentDispatch[] = [];
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
    touchConcurrentGroup(mergedState, options.groupId, nowIso, nowIso);
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

async function finalizeConcurrentBodies(
  context: ChatApiRouteContext,
  staged: StagedConcurrentDispatch,
): Promise<ConcurrentChatDispatchResponse> {
  const dispatches = await Promise.all(
    staged.begunDispatches.map(async (dispatch) => {
      if (!dispatch.begun || dispatch.status !== 'sent') {
        return {
          channelId: dispatch.channelId,
          status: dispatch.status,
          sourceMessageId: dispatch.sourceMessageId,
          error: dispatch.error,
          state: null,
        };
      }

      try {
        const completed = await continueBegunChannelMessageDispatch(
          dispatch.begun,
          dispatch.channelId,
          context.dependencies.runtimeClient,
          staged.now,
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
        const failedResults = completed.results.filter((result) => result.status === 'error');
        return {
          channelId: dispatch.channelId,
          status: failedResults.length > 0 ? 'error' as const : 'sent' as const,
          sourceMessageId: completed.results[0]?.sourceMessageId,
          error: failedResults.length > 0
            ? failedResults.map((result) => result.error || 'Runtime dispatch failed.').join(' ')
            : undefined,
          state: completed.state,
        };
      } catch (error) {
        const settled = await settleBegunChannelMessageDispatchFailure(
          dispatch.begun,
          dispatch.channelId,
          error,
          staged.now,
          {
            chatStore: context.dependencies.chatStore,
          },
        );
        return {
          channelId: dispatch.channelId,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Failed to dispatch parallel chat turn.',
          state: settled.state,
        };
      }
    }),
  );

  return runLockedChannels(
    context,
    staged.lockedChannelIds,
    async () => {
      let mergedState = await context.dependencies.chatStore.read();
      const results: ConcurrentChatDispatchResult[] = [];

      for (const dispatch of dispatches) {
        if (dispatch.state && mergedState.channels.some((channel) => channel.id === dispatch.channelId)) {
          mergedState = replaceState(
            mergedState,
            requireChannel(dispatch.state, dispatch.channelId),
          );
          if (mergedState.selectedChannelId === dispatch.channelId) {
            requireChannel(mergedState, dispatch.channelId).unreadCount = 0;
          }
        }
        results.push({
          channelId: dispatch.channelId,
          status: dispatch.status,
          ...(dispatch.sourceMessageId ? { sourceMessageId: dispatch.sourceMessageId } : {}),
          ...(dispatch.error ? { error: dispatch.error } : {}),
        });
      }

      if (mergedState.concurrentGroups.some((group) => group.id === staged.groupId)) {
        touchConcurrentGroup(mergedState, staged.groupId, staged.nowIso, staged.nowIso);
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

async function handlePatchConcurrentGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateConcurrentChatGroupInput>(context.request);
    const title = body.title?.trim();
    if (!title) {
      sendRestError(context, 400, 'title_required', 'Parallel chat title must not be empty.');
      return;
    }

    await persistRenamedConcurrentGroup(context, groupId, title);
    sendJson(context.response, 200, { updated: true, groupId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleUngroupConcurrentGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    await persistUngroupedConcurrentGroup(context, groupId);
    sendJson(context.response, 200, { ungrouped: true, groupId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleDeleteConcurrentGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    await persistDeletedConcurrentGroup(context, groupId);
    sendJson(context.response, 200, { deleted: true, groupId });
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

    const acknowledged = await acknowledgeConcurrentBodies(context, {
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
    publishConcurrentMutationEvents(
      context,
      acknowledged.staged.lockedChannelIds,
      'message_added',
    );
    if (acknowledged.staged.begunDispatches.some((dispatch) => dispatch.begun && dispatch.status === 'sent')) {
      void finalizeConcurrentBodies(context, acknowledged.staged)
        .catch(() => {})
        .finally(() => {
          publishConcurrentMutationEvents(
            context,
            acknowledged.staged.lockedChannelIds,
            'updated',
          );
        });
    }
  } catch (error) {
    if (error instanceof ConcurrentAttachmentWorkspaceError) {
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

async function handleCancelConcurrentGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<CancelConcurrentChatGroupInput>(context.request);
    const now = nowFrom(context.dependencies);
    const nowIso = now.toISOString();
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

async function handleRelayConcurrentGroupMessage(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<RelayConcurrentChatMessageInput>(context.request);
    const normalizedCommand = normalizeConcurrentRelayCommand(body.command);
    if (!normalizedCommand) {
      sendRestError(
        context,
        400,
        'invalid_relay_command',
        'The selected relay command is not supported.',
      );
      return;
    }
    const response = await dispatchConcurrentBodies(context, {
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
        const commandDefinition = findConcurrentRelayCommand(normalizedCommand);
        const targetMemberLabels = normalizedTargetChannelIds.map((channelId) => {
          const targetChannel = requireChannel(state, channelId);
          return buildConcurrentChatMemberLabel({
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
        const relayBody = buildConcurrentRelayPrompt({
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
            body: buildConcurrentRelayOutgoingNote({
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
              body: buildConcurrentRelayIncomingNote({
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

  const concurrentGroupDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)$/u,
  );
  if (concurrentGroupDetailMatch) {
    if (context.method === 'PATCH') {
      await handlePatchConcurrentGroup(context, concurrentGroupDetailMatch[0]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteConcurrentGroup(context, concurrentGroupDetailMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PATCH', 'DELETE']);
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

  const concurrentGroupCancelMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/cancel$/u,
  );
  if (concurrentGroupCancelMatch) {
    if (context.method === 'POST') {
      await handleCancelConcurrentGroup(context, concurrentGroupCancelMatch[0]!);
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

  const concurrentGroupUngroupMatch = matchRoute(
    context.url.pathname,
    /^\/api\/concurrent-groups\/([^/]+)\/ungroup$/u,
  );
  if (concurrentGroupUngroupMatch) {
    if (context.method === 'POST') {
      await handleUngroupConcurrentGroup(context, concurrentGroupUngroupMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  return false;
}
