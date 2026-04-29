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
import type { ChatStore } from '../store.js';
import type { CatsCoreState } from '../../../../core/types.js';
import {
  resolveFullResponseText,
  type RuntimeClient,
  type RuntimeMessageSegment,
} from '../../../../platform/runtime/client.js';
import {
  RuntimeSupervisionRejectedError,
  sendSupervisedRuntimeMessage,
} from '../../../../platform/supervision/runtimeBoundary.js';
import { buildChannelView } from '../model/index.js';
import { type RoutingTarget } from '../mentionRouter.js';
import { buildOrchestratorRewritePrompt } from '../prompts.js';
import { type DispatchRequest } from '../room-routing/runtime.js';
import {
  type RuntimeTransportContext,
  buildPromptForTarget,
  resolveRuntimeEnvelopeForTarget,
} from '../runtimeTargeting.js';
import {
  participantKey,
  resolveActorIdForTarget,
} from '../runtime-session/state.js';
import { shouldRewriteOrchestratorReply } from '../runtime-session/index.js';
import type { DispatchLeasePatch } from './recovery.js';
import {
  buildDispatchRuntimeContextMetadata,
  mergeRuntimeInvocationContextMetadata,
} from './context.js';
import {
  applyRuntimeInvocationAssistantEffects,
  collectRuntimeInvocationAssistantMetadata,
  enrichRuntimeInvocation,
  hasRuntimeInvocationAssistantEffectProcessors,
} from '../../../../platform/runtime/invocationEnrichment.js';

export interface DispatchExecution extends DispatchRequest {
  responseSegments: RuntimeMessageSegment[] | null;
  usage: MessageUsageSummary | null;
  error: string | null;
  conversationId?: string | null;
  containerId?: string | null;
  transportBindingId?: string | null;
  errorToolName?: string | null;
  errorRejectionCode?: string | null;
  leasePatch?: DispatchLeasePatch;
  channelChatCwd?: string;
  recoveredMessages?: ChatMessage[];
  runtimeAssistantMetadata?: Record<string, unknown>;
}

type RuntimeEffectCoreStore = Pick<ChatStore, 'updateCore'>;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeRuntimeAssistantMetadata(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    target[key] = isRecord(existing) && isRecord(value)
      ? { ...existing, ...value }
      : value;
  }
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
  coreStore?: RuntimeEffectCoreStore,
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
    const runtimeInvocationInput = enrichRuntimeInvocation(channel, {
      instructions: dispatchPrompt.instructions?.trim() || undefined,
      context: mergeRuntimeInvocationContextMetadata(
        runtimeEnvelope.context,
        dispatchContextMetadata,
      ),
      skills: runtimeEnvelope.skills,
    }, { phase: 'message_send' });
    const runtimeResult = await sendSupervisedRuntimeMessage({
      runtimeClient,
      sessionId,
      content: dispatchPrompt.message,
      input: runtimeInvocationInput,
      supervision: {
        product: 'cats-chat',
        surface: 'runtime-dispatch',
        runId: channelId,
        actionId: request.dispatchId,
        actorRef: request.target.participantId,
        reason: request.trigger,
      },
    });
    let responseSegments: RuntimeMessageSegment[] = runtimeResult.segments.length > 0
      ? runtimeResult.segments
      : [{ kind: 'text', text: `${request.target.participantName} completed the routed turn without text output.`, toolName: null, toolId: null }];
    const runtimeAssistantMetadata = collectRuntimeInvocationAssistantMetadata(
      channel,
      runtimeResult.segments,
    );
    if (
      coreStore
      && hasRuntimeInvocationAssistantEffectProcessors()
      && runtimeResult.segments.length > 0
    ) {
      let effectsMetadata: Record<string, unknown> = {};
      await coreStore.updateCore((latestCore) => {
        const appliedEffects = applyRuntimeInvocationAssistantEffects(
          channel,
          {
            core: latestCore,
            segments: runtimeResult.segments,
          },
          {
            actorId: resolveActorIdForTarget(request.target),
            runtimeSessionId: sessionId,
            runtimeContext: runtimeInvocationInput.context,
            now,
          },
        );
        effectsMetadata = appliedEffects.metadata;
        return appliedEffects.core;
      });
      mergeRuntimeAssistantMetadata(runtimeAssistantMetadata, effectsMetadata);
    }
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
        const rewrite = await sendSupervisedRuntimeMessage({
          runtimeClient,
          sessionId,
          content: buildOrchestratorRewritePrompt(
            channel,
            request.sourceMessage,
            request.target.participantName,
            fullResponseText,
          ),
          supervision: {
            product: 'cats-chat',
            surface: 'orchestrator-rewrite',
            runId: channelId,
            actionId: `${request.dispatchId}:rewrite`,
            actorRef: request.target.participantId,
            reason: 'orchestrator_rewrite',
          },
        });
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
      ...(Object.keys(runtimeAssistantMetadata).length > 0
        ? { runtimeAssistantMetadata }
        : {}),
    };
  } catch (error) {
    const supervisedRejection = error instanceof RuntimeSupervisionRejectedError
      ? error
      : null;
    return {
      ...request,
      responseSegments: null,
      usage: null,
      error: error instanceof Error ? error.message : 'Unknown runtime error',
      conversationId: resolvedConversationId,
      containerId: resolvedContainerId,
      transportBindingId: resolvedTransportBindingId,
      errorToolName: supervisedRejection?.toolName ?? null,
      errorRejectionCode: supervisedRejection?.rejectionCode ?? null,
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
