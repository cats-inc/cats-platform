import {
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../../state/runtimeActions.js';
import { notifyStreamTargetChanged } from './streamTargetSignal.js';
import {
  replaceState,
  requireChannel,
  selectChannel,
  touchParallelChatGroup,
} from '../../state/model/index.js';
import { createMergedDispatchChatStore } from '../../state/runtime-dispatch/merge.js';
import type {
  ParallelChatDispatchResponse,
  ParallelChatDispatchResult,
  SendChannelMessageInput,
  SendParallelChatMessageInput,
  ChatState,
  ChannelDispatchOrchestratorSummary,
} from '../contracts.js';
import { persistAttachmentsForChannels } from '../attachmentSupport.js';
import {
  buildAppShellPayload,
  nowFrom,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  buildChannelDispatchOrchestratorSummaryFromBegun,
} from '../orchestratorDispatchResponse.js';
import {
  channelDispatchCancellationRegistry,
} from '../../state/runtime-dispatch/cancellation.js';
import {
  publishParallelChatMutationEvents,
  withLockedParallelChatGroup,
  runLockedChannels,
} from './parallelChatGroupSupport.js';

function resolveParallelDispatchMutationKind(
  previousChannel: ReturnType<typeof requireChannel>,
  persistedChannel: ReturnType<typeof requireChannel>,
): 'updated' | 'message_added' {
  return persistedChannel.messages.length > previousChannel.messages.length
    ? 'message_added'
    : 'updated';
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
  orchestrator?: ChannelDispatchOrchestratorSummary;
}

export interface StagedParallelChatDispatch {
  groupId: string;
  now: Date;
  nowIso: string;
  lockedChannelIds: string[];
  acknowledgedState: ChatState;
  begunDispatches: BegunParallelChatDispatch[];
}

export class ParallelChatAttachmentWorkspaceError extends Error {
  readonly channelIds: string[];

  constructor(channelIds: string[]) {
    super('parallel_attachment_workspace_required');
    this.name = 'ParallelChatAttachmentWorkspaceError';
    this.channelIds = channelIds;
  }
}

export async function dispatchParallelChatBodies(
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

export async function acknowledgeParallelChatBodies(
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
        ...(dispatch.orchestrator ? { orchestrator: dispatch.orchestrator } : {}),
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
          providerCapabilityBootstrapConfig:
            context.dependencies.providerCapabilityBootstrapConfig,
          cancellationRegistry: channelDispatchCancellationRegistry,
          onStateWritten: notifyStreamTargetChanged,
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
        orchestrator: buildChannelDispatchOrchestratorSummaryFromBegun(channelId, begun),
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

export async function finalizeParallelChatBodies(
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
          orchestrator: dispatch.orchestrator,
        };
      }

      try {
        const dispatchChatStore = createMergedDispatchChatStore({
          chatStore: context.dependencies.chatStore,
          mutationGate: context.dependencies.mutationGate,
          channelId: dispatch.channelId,
          baselineState: dispatch.begun.state,
          now: () => nowFrom(context.dependencies),
          onPersistMergedState: ({ previousState, persistedState, channelId }) => {
            if (!previousState.channels.some((channel) => channel.id === channelId)) {
              return;
            }
            if (!persistedState.channels.some((channel) => channel.id === channelId)) {
              return;
            }
            publishParallelChatMutationEvents(
              context,
              [channelId],
              resolveParallelDispatchMutationKind(
                requireChannel(previousState, channelId),
                requireChannel(persistedState, channelId),
              ),
            );
          },
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
            onStateWritten: notifyStreamTargetChanged,
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
          orchestrator: dispatch.orchestrator,
        };
      } catch (error) {
        return {
          kind: 'failed' as const,
          channelId: dispatch.channelId,
          begun: dispatch.begun,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Failed to dispatch parallel chat turn.',
          sourceMessageId: dispatch.begun.results[0]?.sourceMessageId,
          orchestrator: dispatch.orchestrator,
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
            ...(dispatch.orchestrator ? { orchestrator: dispatch.orchestrator } : {}),
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
              onStateWritten: notifyStreamTargetChanged,
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
          ...(dispatch.orchestrator ? { orchestrator: dispatch.orchestrator } : {}),
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
