import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { pushServerLiveTrace } from '../../../../shared/liveTrace.js';
import {
  buildRuntimeDeliveryContentBlocksFromResultPayload,
} from '../../../../platform/orchestration/index.js';
import { normalizeRuntimeContentBlock } from '../../../../shared/runtimeContentBlocks.js';
import { activateChannelSessions } from '../../state/runtimeActions.js';
import {
  resolveChannelCanonicalIdentity,
  requireChannel,
  setChannelOrchestratorLease,
  setChannelParticipantLease,
} from '../../state/model/index.js';
import {
  resolveChannelParticipantAssignments,
  resolveOrchestratorLeaseAttachment,
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import {
  buildAppShellPayload,
  cancelSessionIds,
  collectActiveChannelSessionIds,
  closeSessionIds,
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  hasActiveChannelTurn,
  maybeAutoResumeRecoveredOrchestratorContinuation,
  nowFrom,
  requireValidChatScopeId,
  sendChannelExport,
  waitForCancelledChannelTurns,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  channelDispatchCancellationRegistry,
  DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
} from '../../state/runtime-dispatch/cancellation.js';
import {
  buildChannelStreamTargetAttachKey,
  resolveChannelReadyStreamTargets,
  type ChannelStreamTarget,
  waitForChannelStreamTarget,
  writeSseEvent,
} from './channelStreamSupport.js';
import {
  awaitNextStreamTarget,
  notifyStreamTargetChanged,
  readStreamTargetSignalVersion,
} from './streamTargetSignal.js';
import { publishRoomMutation } from '../transportEventPublisher.js';

function buildStreamSpeakerPayload(input: {
  containerId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  sessionId?: string | null;
  laneId?: string | null;
  sourceMessageId?: string | null;
  identityParticipantId?: string | null;
  participantId?: string | null;
  catId?: string | null;
  speakerLabel?: string | null;
  sessionStartedAt?: string | null;
  requiresSessionStartConfirmation?: boolean;
  targetStateId?: string | null;
}): Record<string, unknown> {
  return {
    containerId: input.containerId ?? null,
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
    sessionId: input.sessionId ?? null,
    laneId: input.laneId ?? null,
    ...(input.sourceMessageId != null ? { sourceMessageId: input.sourceMessageId } : {}),
    identityParticipantId: input.identityParticipantId ?? input.participantId ?? null,
    participantId: input.participantId ?? null,
    catId: input.catId ?? null,
    speakerLabel: input.speakerLabel ?? null,
    sessionStartedAt: input.sessionStartedAt ?? null,
    requiresSessionStartConfirmation: input.requiresSessionStartConfirmation === true,
    ...(input.targetStateId != null ? { targetStateId: input.targetStateId } : {}),
  };
}

function publishStreamAttachMutationEvents(
  context: ChatApiRouteContext,
  channelId: string,
): void {
  publishRoomMutation(context.dependencies.eventHub, channelId, 'updated');
  context.dependencies.eventHub?.emit({
    kind: 'recents_changed',
    channelId,
    timestamp: new Date().toISOString(),
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function eventHasMaterializedContent(event: { event: string; data: Record<string, unknown> }): boolean {
  if (
    event.event === 'text'
    || event.event === 'tool_use'
    || event.event === 'tool_result'
    || event.event === 'content_block'
  ) {
    return true;
  }
  return normalizeRuntimeContentBlock(event.data) !== null;
}

function eventHasTextContent(event: { event: string; data: Record<string, unknown> }): boolean {
  if (event.event === 'text') {
    return typeof event.data.text === 'string' && event.data.text.length > 0;
  }

  const block = normalizeRuntimeContentBlock(event.data);
  return block?.kind === 'text' && block.text.length > 0;
}

function hasChannelActiveWorkflowTurn(
  channel: ReturnType<typeof requireChannel>,
): boolean {
  const status = channel.roomRouting?.workflow?.activeTurn?.status ?? null;
  return status === 'running' || status === 'pending';
}

async function readChannelReadyStreamSnapshot(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<{
  readyTargets: ChannelStreamTarget[];
  hasActiveWorkflowTurn: boolean;
  concurrentBarrierReleased: boolean;
  signalVersion: number;
}> {
  const signalVersion = readStreamTargetSignalVersion(channelId);
  const state = await context.dependencies.chatStore.read();
  const channel = requireChannel(state, channelId);
  const hasActiveWorkflowTurn = hasChannelActiveWorkflowTurn(channel);
  const activeTurn = channel.roomRouting?.workflow?.activeTurn ?? null;
  const activeConcurrentTargets = activeTurn?.workflowShape === 'concurrent'
    ? activeTurn.targetStatuses.filter((target) =>
      target.status === 'running' || target.status === 'pending')
    : [];
  const readyTargets = hasActiveWorkflowTurn
    ? resolveChannelReadyStreamTargets(channel)
    : [];
  const readyTargetStateIds = new Set(
    readyTargets
      .map((target) => target.targetStateId)
      .filter((targetStateId): targetStateId is string => typeof targetStateId === 'string'),
  );
  return {
    readyTargets,
    hasActiveWorkflowTurn,
    concurrentBarrierReleased:
      activeConcurrentTargets.length <= 1
      || activeConcurrentTargets.every((target) => readyTargetStateIds.has(target.id)),
    signalVersion,
  };
}

async function streamChannelTarget(input: {
  context: ChatApiRouteContext;
  channelId: string;
  emitEvent: (event: string, data: Record<string, unknown>) => void;
  target: ChannelStreamTarget;
  requestAbortSignal: AbortSignal;
}): Promise<void> {
  const { channelId, context, emitEvent, requestAbortSignal, target } = input;
  if (!target.sessionId || requestAbortSignal.aborted || context.response.writableEnded) {
    return;
  }

  const streamState = await context.dependencies.chatStore.read();
  const streamChannel = requireChannel(streamState, channelId);
  const activeTurn = streamChannel.roomRouting?.workflow?.activeTurn ?? null;
  const canonicalIdentity = resolveChannelCanonicalIdentity(streamState, channelId);
  const { containerId, conversationId } = canonicalIdentity;
  const turnId = typeof activeTurn?.id === 'string' && activeTurn.id.trim().length > 0
    ? activeTurn.id.trim()
    : null;
  const sourceMessageId = typeof activeTurn?.sourceMessageId === 'string'
    && activeTurn.sourceMessageId.trim().length > 0
    ? activeTurn.sourceMessageId.trim()
    : null;

  try {
    if (context.dependencies.config.debugLiveTrace) {
      pushServerLiveTrace({
        event: 'stream_attach_open',
        channelId,
        containerId,
        conversationId,
        turnId,
        laneId: target.laneId,
        sourceMessageId,
        targetStateId: target.targetStateId,
        sessionId: target.sessionId,
        participantId: target.participantId,
        catId: target.catId,
        speakerLabel: target.speakerLabel,
        reason: 'attach_ready_session',
      });
    }
    publishStreamAttachMutationEvents(context, channelId);
    emitEvent('progress', {
      type: 'progress',
      text: '',
      metadata: {
        kind: 'session',
      },
      ...buildStreamSpeakerPayload({
        ...target,
        containerId,
        conversationId,
        turnId,
        sourceMessageId,
      }),
    });

    let segmentCompleted = false;
    let segmentHasMaterializedContent = false;
    let segmentHasTextContent = false;
    const streamAbortController = new AbortController();
    const abortCurrentSegment = (): void => {
      if (!streamAbortController.signal.aborted) {
        streamAbortController.abort();
      }
    };
    const onRequestAbort = (): void => abortCurrentSegment();
    requestAbortSignal.addEventListener('abort', onRequestAbort, { once: true });

    try {
      await context.dependencies.runtimeClient.streamSession(
        target.sessionId,
        async (event) => {
          if (requestAbortSignal.aborted || context.response.writableEnded) {
            return;
          }
          if (event.event === 'result') {
            const synthesizedBlocks = buildRuntimeDeliveryContentBlocksFromResultPayload(event.data);
            const blocksToEmit = segmentHasMaterializedContent
              ? (segmentHasTextContent
                  ? []
                  : synthesizedBlocks.filter((block) => block.kind === 'text'))
              : synthesizedBlocks;
            for (const block of blocksToEmit) {
              emitEvent('content_block', {
                type: 'content_block',
                block,
                synthesizedFromResult: true,
                ...buildStreamSpeakerPayload({
                  ...target,
                  containerId,
                  conversationId,
                  turnId,
                  sourceMessageId,
                }),
              });
              segmentHasMaterializedContent = true;
              if (block.kind === 'text' && block.text.length > 0) {
                segmentHasTextContent = true;
              }
            }
          }
          emitEvent(event.event, {
            ...event.data,
            ...buildStreamSpeakerPayload({
              ...target,
              containerId,
              conversationId,
              turnId,
              sourceMessageId,
            }),
          });
          if (eventHasMaterializedContent(event)) {
            segmentHasMaterializedContent = true;
          }
          if (eventHasTextContent(event)) {
            segmentHasTextContent = true;
          }
          if (event.event === 'result' || event.event === 'error') {
            segmentCompleted = true;
            abortCurrentSegment();
          }
        },
        {
          signal: streamAbortController.signal,
        },
      );
    } catch (error) {
      const expectedBoundaryAbort =
        streamAbortController.signal.aborted && segmentCompleted && !requestAbortSignal.aborted;
      if (!expectedBoundaryAbort && !isAbortError(error)) {
        throw error;
      }
    } finally {
      requestAbortSignal.removeEventListener('abort', onRequestAbort);
    }

    if (!requestAbortSignal.aborted && !context.response.writableEnded) {
      publishStreamAttachMutationEvents(context, channelId);
    }
  } catch {
    if (!requestAbortSignal.aborted && !context.response.writableEnded) {
      if (context.dependencies.config.debugLiveTrace) {
        pushServerLiveTrace({
          event: 'stream_attach_error',
          channelId,
          containerId,
          conversationId,
          turnId,
          laneId: target.laneId,
          sourceMessageId,
          targetStateId: target.targetStateId,
          sessionId: target.sessionId,
          participantId: target.participantId,
          catId: target.catId,
          speakerLabel: target.speakerLabel,
          reason: 'runtime_stream_unavailable',
        });
      }
      emitEvent('error', {
        type: 'error',
        text: 'Runtime stream unavailable',
        ...buildStreamSpeakerPayload({
          ...target,
          containerId,
          conversationId,
          turnId,
          sourceMessageId,
        }),
      });
    }
  }
}

async function handleRestCancelChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const now = nowFrom(context.dependencies);
    const nowIso = now.toISOString();
    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    const shouldRequestCancellation = hasActiveChannelTurn(channel);

    if (shouldRequestCancellation) {
      channelDispatchCancellationRegistry.request(
        channelId,
        nowIso,
        DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
      );
    }
    const cancelledSessionCount = await cancelSessionIds(
      context,
      collectActiveChannelSessionIds(channel),
    );
    const settledState = await waitForCancelledChannelTurns(context, [channelId]);
    const appShell = await buildAppShellPayload(context.dependencies, settledState);
    sendJson(context.response, 200, {
      appShell,
      cancellation: {
        channelId,
        cancelledAt: nowIso,
        cancelledSessionCount,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestDeactivateChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    await context.dependencies.mutationGate.run(channelId, async () => {
      const now = nowFrom(context.dependencies);
      const state = await context.dependencies.chatStore.read();
      const channel = requireChannel(state, channelId);
      const sessionIds = collectActiveChannelSessionIds(channel);

      await closeSessionIds(context, sessionIds);

      let nextState = state;
      for (const assignment of resolveChannelParticipantAssignments(channel)) {
        const attachment = resolveParticipantLeaseAttachment(channel, assignment.participantId, {
          statuses: ['ready', 'initializing'],
        });
        if (attachment) {
          nextState = setChannelParticipantLease(
            nextState,
            channelId,
            assignment.participantId,
            { status: 'closed', sessionId: null },
            now,
          );
        }
      }
      if (resolveOrchestratorLeaseAttachment(channel, {
        statuses: ['ready', 'initializing'],
      })) {
        nextState = setChannelOrchestratorLease(
          nextState,
          channelId,
          { status: 'closed', sessionId: null },
          now,
        );
      }

      await context.dependencies.chatStore.write(nextState);
      notifyStreamTargetChanged(channelId);
      sendJson(context.response, 200, {
        deactivation: {
          channelId,
          closedAt: now.toISOString(),
          closedSessionCount: sessionIds.length,
        },
      });
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestActivateChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    await context.dependencies.mutationGate.run(channelId, async () => {
      const now = nowFrom(context.dependencies);
      const activation = await activateChannelSessions(
        await context.dependencies.chatStore.read(),
        channelId,
        context.dependencies.runtimeClient,
        now,
        {
          companionStore: context.dependencies.companionStore,
          memoryService: context.dependencies.memoryService,
          chatStatePath: context.dependencies.config.chatStatePath,
          runtimeDataDir: context.dependencies.config.runtimeDataDir,
        },
      );
      await context.dependencies.chatStore.write(activation.state);
      notifyStreamTargetChanged(channelId);
      if (activation.results.some((result) =>
        result.targetKind === 'orchestrator'
        && (result.status === 'started' || result.status === 'already_started'))) {
        await maybeAutoResumeRecoveredOrchestratorContinuation(context, channelId, now);
      }
      sendJson(context.response, 200, {
        activation: {
          channelId,
          startedAt: now.toISOString(),
          results: activation.results,
        },
      });
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestStreamChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  let sseHeadersSent = false;
  const abortController = new AbortController();
  context.response.on('close', () => abortController.abort());

  try {
    requireValidChatScopeId(chatScopeId);
    const streamTarget = await waitForChannelStreamTarget(
      context,
      channelId,
      abortController.signal,
    );

    if (abortController.signal.aborted) {
      return;
    }

    context.response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    sseHeadersSent = true;

    if (!streamTarget?.sessionId) {
      const settledState = await context.dependencies.chatStore.read();
      const canonicalIdentity = resolveChannelCanonicalIdentity(settledState, channelId);
      const { containerId, conversationId } = canonicalIdentity;
      if (context.dependencies.config.debugLiveTrace) {
        pushServerLiveTrace({
          event: 'stream_attach_closed',
          channelId,
          containerId,
          conversationId,
          turnId: null,
          laneId: streamTarget?.laneId ?? null,
          sourceMessageId: null,
          targetStateId: streamTarget?.targetStateId ?? null,
          participantId: streamTarget?.participantId ?? null,
          catId: streamTarget?.catId ?? null,
          speakerLabel: streamTarget?.speakerLabel ?? null,
          reason: 'no_session_after_wait',
        });
      }
      writeSseEvent(context, 'session_closed', {
        type: 'session_closed',
        ...buildStreamSpeakerPayload({
          ...(streamTarget ?? {}),
          containerId,
          conversationId,
        }),
      });
      context.response.end();
      return;
    }

    const completedAttachSignalVersions = new Map<string, number>();
    const activeStreams = new Map<string, Promise<void>>();
    const bufferedEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    let concurrentBarrierReleased = false;

    const emitStreamEvent = (event: string, data: Record<string, unknown>): void => {
      const isSessionGateProgress =
        event === 'progress'
        && typeof data.text === 'string'
        && data.text.length === 0
        && typeof data.metadata === 'object'
        && data.metadata !== null
        && (data.metadata as { kind?: unknown }).kind === 'session';
      if (!concurrentBarrierReleased && !isSessionGateProgress) {
        bufferedEvents.push({ event, data });
        return;
      }
      writeSseEvent(context, event, data);
    };

    const flushBufferedEvents = (): void => {
      while (bufferedEvents.length > 0) {
        const nextEvent = bufferedEvents.shift();
        if (!nextEvent) {
          continue;
        }
        writeSseEvent(context, nextEvent.event, nextEvent.data);
      }
    };

    const attachReadyTargets = (
      targets: ChannelStreamTarget[],
      signalVersion: number,
    ): void => {
      for (const target of targets) {
        const attachKey = buildChannelStreamTargetAttachKey(target);
        if (!attachKey || activeStreams.has(attachKey)) {
          continue;
        }
        if (completedAttachSignalVersions.get(attachKey) === signalVersion) {
          continue;
        }
        const attachSignalVersion = signalVersion;
        const streamPromise = streamChannelTarget({
          context,
          channelId,
          emitEvent: emitStreamEvent,
          target,
          requestAbortSignal: abortController.signal,
        }).finally(() => {
          activeStreams.delete(attachKey);
          completedAttachSignalVersions.set(attachKey, attachSignalVersion);
        });
        activeStreams.set(attachKey, streamPromise);
      }
    };

    attachReadyTargets([streamTarget], readStreamTargetSignalVersion(channelId));

    while (!abortController.signal.aborted && !context.response.writableEnded) {
      const snapshot = await readChannelReadyStreamSnapshot(context, channelId);
      attachReadyTargets(snapshot.readyTargets, snapshot.signalVersion);
      if (snapshot.concurrentBarrierReleased && !concurrentBarrierReleased) {
        concurrentBarrierReleased = true;
      }
      if (concurrentBarrierReleased) {
        flushBufferedEvents();
      }

      if (activeStreams.size === 0 && !snapshot.hasActiveWorkflowTurn) {
        break;
      }

      const loopAbortController = new AbortController();
      const onRequestAbort = (): void => loopAbortController.abort();
      abortController.signal.addEventListener('abort', onRequestAbort, { once: true });
      try {
        const waiters: Array<Promise<void>> = [];
        if (activeStreams.size > 0) {
          waiters.push(Promise.race(activeStreams.values()).then(() => {}));
        }
        waiters.push(
          awaitNextStreamTarget(channelId, snapshot.signalVersion, loopAbortController.signal),
        );
        await Promise.race(waiters);
      } finally {
        abortController.signal.removeEventListener('abort', onRequestAbort);
        loopAbortController.abort();
      }
    }

    if (!context.response.writableEnded) {
      context.response.end();
    }
  } catch (error) {
    if (sseHeadersSent) {
      try {
        writeSseEvent(context, 'error', {
          type: 'error',
          text: 'Proxy error',
        });
      } catch {
        /* response may already be closed */
      }
      if (!context.response.writableEnded) {
        context.response.end();
      }
    } else {
      handleRestError(context, error);
    }
  }
}

async function handleRestGetExport(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    sendChannelExport(
      context,
      await context.dependencies.chatStore.read(),
      channelId,
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatChannelRuntimeResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const canonicalChannelDeactivateMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/deactivate$/u,
  );
  if (canonicalChannelDeactivateMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestDeactivateChannel(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelDeactivateMatch[0]!,
    );
    return true;
  }

  const canonicalChannelCancelMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/cancel$/u,
  );
  if (canonicalChannelCancelMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestCancelChannel(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelCancelMatch[0]!,
    );
    return true;
  }

  const canonicalChannelActivationsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/activations$/u,
  );
  if (canonicalChannelActivationsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestActivateChannel(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelActivationsMatch[0]!,
    );
    return true;
  }

  const canonicalChannelStreamMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/stream$/u,
  );
  if (canonicalChannelStreamMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestStreamChannel(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelStreamMatch[0]!,
    );
    return true;
  }

  const canonicalChannelExportMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/exports\/latest$/u,
  );
  if (canonicalChannelExportMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestGetExport(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelExportMatch[0]!,
    );
    return true;
  }

  return false;
}
