import type {
  MessageUsageSummary,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
} from '../../../../shared/roomRouting.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { CatsCoreState } from '../../../../core/types.js';
import {
  resolveFullResponseText,
  type RuntimeClient,
  type RuntimeMessageSegment,
} from '../../../../platform/runtime/client.js';
import { buildChannelView } from '../model/index.js';
import { type RoutingTarget } from '../mentionRouter.js';
import { buildOrchestratorRewritePrompt } from '../prompts.js';
import { type DispatchRequest } from '../room-routing/runtime.js';
import {
  type RuntimeTransportContext,
  buildPromptForTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../runtimeTargeting.js';
import { participantKey } from '../runtime-session/state.js';
import { shouldRewriteOrchestratorReply } from '../runtime-session/index.js';
import type { DispatchLeasePatch } from './recovery.js';
import {
  buildDispatchRuntimeContextMetadata,
  mergeRuntimeInvocationContextMetadata,
} from './context.js';

export interface DispatchExecution extends DispatchRequest {
  responseSegments: RuntimeMessageSegment[] | null;
  usage: MessageUsageSummary | null;
  error: string | null;
  conversationId?: string | null;
  containerId?: string | null;
  transportBindingId?: string | null;
  leasePatch?: DispatchLeasePatch;
  channelChatCwd?: string;
  recoveredMessages?: ChatMessage[];
}

function readRuntimeEnvelopeMetadataString(
  envelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>,
  key: string,
): string | null {
  const value = envelope.context.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function requireDispatchSessionId(target: RoutingTarget): string {
  const sessionId = target.sessionId?.trim() || null;
  if (sessionId) {
    return sessionId;
  }

  const laneLabel = target.laneId?.trim() || `${target.participantKind}:${target.participantId}`;
  throw new Error(`No runtime session attached to dispatch target lane: ${laneLabel}`);
}

export async function executeDispatch(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  runtimeClient: RuntimeClient,
  now: Date,
  transport?: RuntimeTransportContext,
  transportBindingId?: string | null,
  companionStore?: CompanionBoxStore,
  core?: CatsCoreState,
): Promise<DispatchExecution> {
  let resolvedConversationId: string | null = null;
  let resolvedContainerId: string | null = null;
  let resolvedTransportBindingId: string | null = typeof transportBindingId === 'string'
    && transportBindingId.trim().length > 0
    ? transportBindingId.trim()
    : null;
  try {
    const sessionId = requireDispatchSessionId(request.target);
    const dispatchPrompt = buildPromptForTarget(state, channelId, request, transport, core);
    const channel = buildChannelView(state, channelId);
    const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
      state,
      channel,
      request.target,
      transport,
      transportBindingId,
      now,
      companionStore,
    );
    resolvedConversationId = readRuntimeEnvelopeMetadataString(
      runtimeEnvelope,
      'conversationId',
    );
    resolvedTransportBindingId = readRuntimeEnvelopeMetadataString(
      runtimeEnvelope,
      'transportBindingId',
    ) ?? resolvedTransportBindingId;
    resolvedContainerId = readRuntimeEnvelopeMetadataString(
      runtimeEnvelope,
      'containerId',
    );
    const dispatchContextMetadata = buildDispatchRuntimeContextMetadata(request, {
      continuityMode: dispatchPrompt.continuityMode ?? null,
      continuityDeliveryMode: dispatchPrompt.continuityDeliveryMode ?? null,
      continuityResetAt: dispatchPrompt.continuityResetAt ?? null,
    });
    const runtimeResult = await runtimeClient.sendMessage(
      sessionId,
      dispatchPrompt.message,
      {
        instructions: dispatchPrompt.instructions?.trim() || undefined,
        context: mergeRuntimeInvocationContextMetadata(
          runtimeEnvelope.context,
          dispatchContextMetadata,
        ),
        skills: runtimeEnvelope.skills,
      },
    );
    let responseSegments: RuntimeMessageSegment[] = runtimeResult.segments.length > 0
      ? runtimeResult.segments
      : [{ kind: 'text', text: `${request.target.participantName} completed the routed turn without text output.`, toolName: null, toolId: null }];
    let usage: MessageUsageSummary | null = {
      inputTokens: runtimeResult.inputTokens,
      outputTokens: runtimeResult.outputTokens,
      tokensUsed: runtimeResult.tokensUsed,
    };

    const fullResponseText = resolveFullResponseText(responseSegments);
    if (
      request.target.participantKind === 'orchestrator'
      && shouldRewriteOrchestratorReply(
        fullResponseText,
        request.target.participantName,
        channel,
      )
    ) {
      try {
        const rewrite = await runtimeClient.sendMessage(
          sessionId,
          buildOrchestratorRewritePrompt(
            channel,
            request.sourceMessage,
            request.target.participantName,
            fullResponseText,
          ),
        );
        const rewriteText = resolveFullResponseText(rewrite.segments);
        if (rewriteText) {
          responseSegments = [{ kind: 'text', text: rewriteText, toolName: null, toolId: null }];
        }
        usage = {
          inputTokens: (usage?.inputTokens ?? 0) + rewrite.inputTokens,
          outputTokens: (usage?.outputTokens ?? 0) + rewrite.outputTokens,
          tokensUsed: (usage?.tokensUsed ?? 0) + rewrite.tokensUsed,
        };
      } catch {
        // Keep the original draft if the repair pass fails.
      }
    }

    return {
      ...request,
      responseSegments,
      usage,
      error: null,
      conversationId: resolvedConversationId,
      containerId: resolvedContainerId,
      transportBindingId: resolvedTransportBindingId,
    };
  } catch (error) {
    return {
      ...request,
      responseSegments: null,
      usage: null,
      error: error instanceof Error ? error.message : 'Unknown runtime error',
      conversationId: resolvedConversationId,
      containerId: resolvedContainerId,
      transportBindingId: resolvedTransportBindingId,
    };
  }
}

export async function settleInCompletionOrder<T>(promises: Array<Promise<T>>): Promise<T[]> {
  const wrapped = promises.map((promise, index) =>
    promise.then((value) => ({ index, value })),
  );
  const pending = new Map(wrapped.map((promise, index) => [index, promise]));
  const results: T[] = [];

  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.index);
    results.push(settled.value);
  }

  return results;
}

export function shouldBlockAntiPingPong(
  sourceParticipant: RoomRoutingParticipantRef,
  target: RoutingTarget,
  dispatches: RoomRoutingOutcome['dispatches'],
): boolean {
  const completedDispatches = dispatches.filter((dispatch) => dispatch.status === 'completed');
  if (completedDispatches.length < 2) {
    return false;
  }

  const lastDispatch = completedDispatches[completedDispatches.length - 1];
  const previousDispatch = completedDispatches[completedDispatches.length - 2];
  if (!lastDispatch.source || !previousDispatch.source) {
    return false;
  }

  return participantKey(previousDispatch.source) === participantKey(sourceParticipant)
    && participantKey(previousDispatch.target) === participantKey(target)
    && participantKey(lastDispatch.source) === participantKey(target)
    && participantKey(lastDispatch.target) === participantKey(sourceParticipant);
}
