import { isDeepStrictEqual } from 'node:util';
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
import { createMergedDispatchChatStore, mergeCompletedDispatchState } from '../../state/runtime-dispatch/merge.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import { readConversationsState, updateConversationsState } from '../scopedConversationState.js';
import { closeUnreferencedConversationSessions, trackCreatedRuntimeSessions } from '../conversationRuntimeCleanup.js';
import { ChatApiError } from '../routeErrors.js';
import { assertConversationWritable } from '../../../shared/conversationArchive.js';
import type {
  ParallelChatDispatchResponse,
  ParallelChatDispatchResult,
  SendChannelMessageInput,
  SendParallelChatMessageInput,
  ChatState,
  ChatChannelState,
  ChannelDispatchOrchestratorSummary,
} from '../contracts.js';
import { persistAttachmentsForChannels } from '../../state/channelAttachments.js';
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


/** A member turn without its own audience goes to every participant of that member. */
function withMemberAudience(
  state: ChatState,
  channelId: string,
  input: SendChannelMessageInput,
): SendChannelMessageInput {
  if (input.messageMetadata?.recipientParticipantIds?.length) {
    return input;
  }
  const recipientParticipantIds = resolveChannelParticipantAssignments(requireChannel(state, channelId))
    .filter((assignment) => assignment.status === 'active')
    .map((assignment) => assignment.participantId);
  return recipientParticipantIds.length > 0
    ? { ...input, messageMetadata: { ...input.messageMetadata, recipientParticipantIds } }
    : input;
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

/** Ignore ordinary lease progress; owner membership, execution and terminal changes invalidate preparation. */
function executionAdmission(channel: ChatChannelState) {
  const routing = channel.roomRouting, turn = routing?.workflow.activeTurn;
  return {
    repoPath: channel.repoPath, chatCwd: channel.chatCwd,
    runtimeWorkspaceKind: channel.runtimeWorkspaceKind, runtimeWorkspaceAccess: channel.runtimeWorkspaceAccess,
    runtimePermissionMode: channel.runtimePermissionMode, runtimeExecutionPolicy: channel.runtimeExecutionPolicy,
    coordinatorParticipantId: channel.coordinatorParticipantId,
    routing: routing ? { mode: routing.mode, defaultRecipientId: routing.defaultRecipientId,
      maxContinuations: routing.maxContinuations, maxDispatchesPerTurn: routing.maxDispatchesPerTurn,
      maxTargetVisitsPerTurn: routing.maxTargetVisitsPerTurn,
      turn: turn ? { id: turn.id, completedAt: turn.completedAt,
        terminal: ['completed', 'failed', 'cancelled'].includes(turn.status) ? turn.status : null } : null } : null,
    participants: resolveChannelParticipantAssignments(channel).map(({ execution, ...assignment }) => ({ ...assignment,
      execution: { target: execution.target, modelSelection: execution.modelSelection,
        sessionId: execution.lease.sessionId, laneId: execution.lease.laneId,
        terminal: ['closed', 'removed'].includes(execution.lease.status) ? execution.lease.status : null },
    })),
  };
}

function touchCurrentParallelGroup(state: ChatState, groupId: string, ids: readonly string[], nowIso: string): void {
  const group = state.parallelChatGroups.find(group => group.id === groupId);
  if (!group || !group.memberChannelIds.every(id => ids.includes(id))) return;
  touchParallelChatGroup(state, groupId, group.updatedAt > nowIso ? group.updatedAt : nowIso,
    group.lastMessageAt && group.lastMessageAt > nowIso ? group.lastMessageAt : nowIso);
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
        baselineState: lockedState,
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
        baselineState: lockedState,
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
    baselineState: ChatState;
    state: ChatState;
    activeChannelId: string;
    channelInputs: Map<string, SendChannelMessageInput>;
    lockedChannelIds: string[];
    sharedAttachments?: NonNullable<SendParallelChatMessageInput['attachments']>;
    persistAcknowledgedStateBeforeDispatch?: boolean;
  },
): Promise<StagedParallelChatDispatch> {
  // A broadcast must fail before a hot sibling starts Runtime work or attachments
  // are copied. Per-member failures are too late to reject a cold recipient.
  assertConversationWritable(requireChannel(options.baselineState, options.activeChannelId));
  for (const [id, input] of options.channelInputs) {
    if (input.body.trim() || options.sharedAttachments?.length) {
      assertConversationWritable(requireChannel(options.baselineState, id));
    }
  }
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
  const trackedBegins: Array<{ channelId: string; tracked: ReturnType<typeof trackCreatedRuntimeSessions> }> = [];
  try {
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
        const tracked = trackCreatedRuntimeSessions(context.dependencies.runtimeClient);
        trackedBegins.push({ channelId, tracked });
        const begun = await beginChannelMessageDispatch(
          acknowledgedState,
          channelId,
          withMemberAudience(acknowledgedState, channelId, { ...input, body: trimmedBody }),
          tracked.runtimeClient,
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
            providerCapabilityBootstrapDiagnosticSink:
              context.dependencies.providerCapabilityBootstrapDiagnosticSink,
            naturalProductIntentMode: context.dependencies.config.chatNaturalProductIntentMode,
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
      mergedState = await updateConversationsState(context.dependencies.chatStore, options.lockedChannelIds, (latest, scope) => {
        for (const dispatch of begunDispatches) {
          if (!dispatch.begun || dispatch.status !== 'sent') continue;
          const current = executionAdmission(requireChannel(latest, dispatch.channelId));
          if (!isDeepStrictEqual(current, executionAdmission(requireChannel(options.baselineState, dispatch.channelId)))
            && !isDeepStrictEqual(current, executionAdmission(requireChannel(acknowledgedState, dispatch.channelId)))) {
            throw new ChatApiError(409, 'conversation_changed', 'A parallel conversation changed while preparing dispatch. Reload and try again.');
          }
        }
        const replacements = new Map(latest.channels.map(channel => {
          const prepared = acknowledgedState.channels.find(value => value.id === channel.id);
          return [channel.id, prepared && prepared.updatedAt > channel.updatedAt
            ? { ...channel, updatedAt: prepared.updatedAt } : channel];
        }));
        const catalog = scope?.channelCatalog.map(channel => replacements.get(channel.id) ?? channel);
        for (const channelId of options.lockedChannelIds) {
          if (latest.channels.some((channel) => channel.id === channelId)) {
            if (isDeepStrictEqual(requireChannel(options.baselineState, channelId), requireChannel(acknowledgedState, channelId))) continue;
            latest = mergeCompletedDispatchState(latest, options.baselineState, acknowledgedState, channelId, now, catalog);
          }
        }
        touchCurrentParallelGroup(latest, options.groupId, options.lockedChannelIds, nowIso);
        latest.selectedChannelId = options.activeChannelId;
        requireChannel(latest, options.activeChannelId).unreadCount = 0;
        return latest;
      }, { excludeArchived: true, preflight: headers => {
        const group = headers.parallelChatGroups.find(group => group.id === options.groupId);
        if (!group || !isDeepStrictEqual(group.memberChannelIds, options.lockedChannelIds)
          || options.lockedChannelIds.some(id => !headers.channels.some(channel => channel.id === id))) {
          throw new ChatApiError(409, 'parallel_group_changed', 'The parallel conversation changed. Reload and try again.');
        }
        for (const channel of headers.channels) {
          const input = effectiveChannelInputs.get(channel.id);
          const baseline = requireChannel(options.baselineState, channel.id);
          const prepared = requireChannel(options.state, channel.id);
          if (channel.id === options.activeChannelId || input?.body.trim() || options.sharedAttachments?.length
            || !isDeepStrictEqual(baseline.messages, prepared.messages)) assertConversationWritable(channel);
        }
      } });
      for (const dispatch of begunDispatches) if (dispatch.begun) dispatch.begun.state = structuredClone(mergedState);
    }

    return {
      groupId: options.groupId,
      now,
      nowIso,
      lockedChannelIds: [...options.lockedChannelIds],
      acknowledgedState: mergedState,
      begunDispatches,
    };
  } finally {
    for (const { channelId, tracked } of trackedBegins) {
      await closeUnreferencedConversationSessions({ ...context.dependencies, runtimeClient: tracked.runtimeClient },
        channelId, [...tracked.pending]);
    }
  }
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

      const tracked = trackCreatedRuntimeSessions(context.dependencies.runtimeClient);
      try {
        const dispatchChatStore = createMergedDispatchChatStore({
          runtimeClient: tracked.runtimeClient,
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
          tracked.runtimeClient,
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
      } finally {
        await closeUnreferencedConversationSessions({ ...context.dependencies, runtimeClient: tracked.runtimeClient },
          dispatch.channelId, [...tracked.pending]);
      }
    }),
  );

  return runLockedChannels(
    context,
    staged.lockedChannelIds,
    async () => {
      const baseline = await readConversationsState(context.dependencies.chatStore, staged.lockedChannelIds, { excludeArchived: true });
      let mergedState = structuredClone(baseline);
      const results: ParallelChatDispatchResult[] = [];

      for (const dispatch of dispatches) {
        if (!mergedState.channels.some((channel) => channel.id === dispatch.channelId && channel.status !== 'archived')) {
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
          const currentTurn = requireChannel(mergedState, dispatch.channelId).roomRouting?.workflow.activeTurn;
          const expectedTurn = dispatch.begun.preparedTurn?.activeTurn;
          // A later owner turn owns its workflow; an old failure must not settle that turn.
          if (currentTurn && currentTurn.id !== expectedTurn?.id) {
            results.push({ channelId: dispatch.channelId, status: dispatch.status,
              ...(dispatch.sourceMessageId ? { sourceMessageId: dispatch.sourceMessageId } : {}),
              ...(dispatch.error ? { error: dispatch.error } : {}),
              ...(dispatch.orchestrator ? { orchestrator: dispatch.orchestrator } : {}) });
            continue;
          }
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

      const persisted = await updateConversationsState(context.dependencies.chatStore, staged.lockedChannelIds, (latest, scope) => {
        const replacements = new Map(latest.channels.map(channel => {
          const prepared = mergedState.channels.find(value => value.id === channel.id);
          return [channel.id, prepared && prepared.updatedAt > channel.updatedAt
            ? { ...channel, updatedAt: prepared.updatedAt } : channel];
        }));
        const catalog = scope?.channelCatalog.map(channel => replacements.get(channel.id) ?? channel);
        for (const dispatch of dispatches) {
          if (dispatch.kind !== 'noop'
            && latest.channels.some((channel) => channel.id === dispatch.channelId && channel.status !== 'archived')
            && baseline.channels.some((channel) => channel.id === dispatch.channelId)) {
            latest = mergeCompletedDispatchState(latest, baseline, mergedState, dispatch.channelId, staged.now, catalog);
          }
        }
        touchCurrentParallelGroup(latest, staged.groupId, latest.channels.map(channel => channel.id), staged.nowIso);
        return latest;
      }, { excludeArchived: true });
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
