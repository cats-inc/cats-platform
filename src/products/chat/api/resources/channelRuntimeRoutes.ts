import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { pushServerLiveTrace } from '../../../../shared/liveTrace.js';
import { activateChannelSessions } from '../../state/runtimeActions.js';
import {
  requireChannel,
  setChannelOrchestratorLease,
  setChannelParticipantLease,
} from '../../state/model/index.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantExecutionLease,
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
  waitForChannelStreamTarget,
  waitForNextChannelStreamTarget,
  writeSseEvent,
} from './channelStreamSupport.js';
import { notifyStreamTargetChanged } from './streamTargetSignal.js';
import { publishRoomMutation } from '../transportEventPublisher.js';

function buildStreamSpeakerPayload(input: {
  participantId?: string | null;
  catId?: string | null;
  speakerLabel?: string | null;
  sessionStartedAt?: string | null;
  requiresSessionStartConfirmation?: boolean;
  targetStateId?: string | null;
}): Record<string, unknown> {
  return {
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
        const lease = resolveParticipantExecutionLease(channel, assignment.participantId);
        if (
          lease?.status === 'ready'
          || lease?.status === 'initializing'
        ) {
          nextState = setChannelParticipantLease(
            nextState,
            channelId,
            assignment.participantId,
            { status: 'closed', sessionId: null },
            now,
          );
        }
      }
      if (
        channel.orchestratorLease.status === 'ready'
        || channel.orchestratorLease.status === 'initializing'
      ) {
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
        result.targetKind === 'orchestrator' && result.status === 'started')) {
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
      if (context.dependencies.config.debugLiveTrace) {
        pushServerLiveTrace({
          event: 'stream_attach_closed',
          channelId,
          participantId: streamTarget?.participantId ?? null,
          catId: streamTarget?.catId ?? null,
          speakerLabel: streamTarget?.speakerLabel ?? null,
          reason: 'no_session_after_wait',
        });
      }
      writeSseEvent(context, 'session_closed', {
        type: 'session_closed',
        ...buildStreamSpeakerPayload(streamTarget ?? {}),
      });
      context.response.end();
      return;
    }

    let nextTarget = streamTarget;
    while (nextTarget?.sessionId && !abortController.signal.aborted && !context.response.writableEnded) {
      try {
        if (context.dependencies.config.debugLiveTrace) {
          pushServerLiveTrace({
            event: 'stream_attach_open',
            channelId,
            sessionId: nextTarget.sessionId,
            participantId: nextTarget.participantId,
            catId: nextTarget.catId,
            speakerLabel: nextTarget.speakerLabel,
            reason: 'attach_ready_session',
            details: {
              targetStateId: nextTarget.targetStateId,
            },
          });
        }
        // Surface the persisted session_started system message before transcript
        // progress hands off from the user bubble to the assistant bubble.
        publishStreamAttachMutationEvents(context, channelId);
        writeSseEvent(context, 'progress', {
          type: 'progress',
          text: '',
          metadata: {
            kind: 'session',
          },
          ...buildStreamSpeakerPayload(nextTarget),
        });

        let segmentCompleted = false;
        const streamAbortController = new AbortController();
        const abortCurrentSegment = (): void => {
          if (!streamAbortController.signal.aborted) {
            streamAbortController.abort();
          }
        };
        const onRequestAbort = (): void => abortCurrentSegment();
        abortController.signal.addEventListener('abort', onRequestAbort, { once: true });

        try {
          await context.dependencies.runtimeClient.streamSession(
            nextTarget.sessionId,
            async (event) => {
              if (abortController.signal.aborted || context.response.writableEnded) {
                return;
              }
              writeSseEvent(context, event.event, {
                ...event.data,
                ...buildStreamSpeakerPayload(nextTarget),
              });
              if (event.event === 'result' || event.event === 'error') {
                segmentCompleted = true;
                abortCurrentSegment();
              }
            },
            {
              signal: streamAbortController.signal,
            }
          );
        } catch (error) {
          const expectedBoundaryAbort =
            streamAbortController.signal.aborted && segmentCompleted && !abortController.signal.aborted;
          if (!expectedBoundaryAbort && !isAbortError(error)) {
            throw error;
          }
        } finally {
          abortController.signal.removeEventListener('abort', onRequestAbort);
        }

        if (!abortController.signal.aborted && !context.response.writableEnded) {
          // Once one sequential speaker finishes, refresh the transcript so the
          // persisted reply is visible before the next stream attachment begins.
          publishStreamAttachMutationEvents(context, channelId);
        }
      } catch {
        if (!abortController.signal.aborted && !context.response.writableEnded) {
          if (context.dependencies.config.debugLiveTrace) {
            pushServerLiveTrace({
              event: 'stream_attach_error',
              channelId,
              sessionId: nextTarget.sessionId,
              participantId: nextTarget.participantId,
              catId: nextTarget.catId,
              speakerLabel: nextTarget.speakerLabel,
              reason: 'runtime_stream_unavailable',
              details: {
                targetStateId: nextTarget.targetStateId,
              },
            });
          }
          writeSseEvent(context, 'error', {
            type: 'error',
            text: 'Runtime stream unavailable',
          });
        }
        break;
      }

      if (abortController.signal.aborted || context.response.writableEnded) {
        break;
      }

      if (!nextTarget.targetStateId) {
        break;
      }

      const followingTarget = await waitForNextChannelStreamTarget(
        context,
        channelId,
        nextTarget.targetStateId,
        abortController.signal,
      );
      if (!followingTarget?.sessionId) {
        break;
      }
      nextTarget = followingTarget;
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
