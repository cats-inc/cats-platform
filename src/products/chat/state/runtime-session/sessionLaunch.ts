import type { ChatState } from '../../api/contracts.js';
import type { RoomWakeRequest } from '../../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  buildChannelView,
  requireChannel,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  buildSoloChatContinuityTransplantPackage,
  MAX_BOUNDED_RECENT_CONTEXT_MESSAGES,
} from '../prompts.js';
import {
  applySoloChatContinuityBoundary,
  hasVisibleResponseFromLogicalTarget,
  messagesBeforeSource,
  resolveRuntimeEnvelopeForTarget,
  supportsSameChatParticipantContinuity,
} from '../runtimeTargeting.js';
import {
  markTargetWaking,
  spawnCwdFor,
} from './state.js';
import {
  resolveRuntimeEnvelopeCanonicalMetadata,
  type RuntimeEnvelopeCanonicalMetadata,
  type RuntimeSessionRoutingOptions,
} from './shared.js';
import {
  createOrchestratorTargetRuntimeSession,
  createParticipantTargetRuntimeSession,
  type RuntimeSessionExecutionTarget,
  type TargetSessionLifecycleMetadata,
} from './sessionStart.js';
import {
  persistCreatedTargetExecutionTarget,
  persistFailedTargetSessionStart,
  persistStartedTargetSession,
  syncTargetSessionAttachmentWorkspace,
} from './sessionPersistence.js';
import type { EnsureTargetSessionResult } from './sessionReuse.js';
import type { ChannelTaskExecutionContext } from './taskExecution.js';

type EnsureTargetWakeRecorder = (
  status: RoomWakeRequest['status'],
  error?: string | null,
) => RoomWakeRequest | null;

interface ResolvedTargetRuntimeEnvelope {
  runtimeEnvelope: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>;
  canonicalMetadata: RuntimeEnvelopeCanonicalMetadata;
}

function resolveNewSessionContinuityMetadata(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  sourceMessageId?: string | null;
}): {
  continuityMode: 'fresh_start' | 'full_transplant' | 'semantic_transplant' | 'targeted_handoff';
  continuityDeliveryMode: 'none' | 'turn_instructions';
  continuityResetAt: string | null;
} | null {
  const channel = buildChannelView(input.state, input.channelId);
  const isSoloOrchestrator = input.target.participantKind === 'orchestrator'
    && channel.composerMode === 'solo';
  const isParticipantTarget = input.target.participantKind === 'cat';
  if (!isSoloOrchestrator && !isParticipantTarget) {
    return null;
  }

  const sourceMessageId = input.sourceMessageId?.trim() || null;
  if (!sourceMessageId) {
    return {
      continuityMode: 'fresh_start',
      continuityDeliveryMode: 'none',
      continuityResetAt: isSoloOrchestrator
        ? channel.continuityResetAt?.trim() || null
        : null,
    };
  }

  const continuityResetAt = isSoloOrchestrator
    ? channel.continuityResetAt?.trim() || null
    : null;
  const continuityMessages = isSoloOrchestrator
    ? applySoloChatContinuityBoundary(channel, channel.messages)
    : channel.messages;
  const sourceMessage = continuityMessages.find((message) => message.id === sourceMessageId) ?? null;
  const hasLogicalPriorResponse = sourceMessage
    ? hasVisibleResponseFromLogicalTarget(continuityMessages, input.target, sourceMessage)
    : false;
  const supportsParticipantContinuity = input.target.participantKind === 'cat'
    && (supportsSameChatParticipantContinuity(channel) || hasLogicalPriorResponse);
  if (!isSoloOrchestrator && !supportsParticipantContinuity) {
    const targetedPriorMessages = sourceMessage
      ? messagesBeforeSource(continuityMessages, sourceMessage)
        .slice(-MAX_BOUNDED_RECENT_CONTEXT_MESSAGES)
      : [];
    return {
      continuityMode: targetedPriorMessages.length > 0 ? 'targeted_handoff' : 'fresh_start',
      continuityDeliveryMode: targetedPriorMessages.length > 0 ? 'turn_instructions' : 'none',
      continuityResetAt: null,
    };
  }
  const priorMessages = sourceMessage
    ? messagesBeforeSource(continuityMessages, sourceMessage)
    : [];
  const continuityPackage = buildSoloChatContinuityTransplantPackage(priorMessages);

  return {
    continuityMode: continuityPackage.instructions ? continuityPackage.mode : 'fresh_start',
    continuityDeliveryMode: continuityPackage.instructions ? 'turn_instructions' : 'none',
    continuityResetAt,
  };
}

async function resolveTargetRuntimeEnvelope(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
  now: Date;
  routingOptions: Pick<
    RuntimeSessionRoutingOptions,
    'transport' | 'transportBindingId' | 'companionStore'
  >;
}): Promise<ResolvedTargetRuntimeEnvelope> {
  const runtimeChannel = buildChannelView(input.state, input.channelId);
  const runtimeEnvelope = await resolveRuntimeEnvelopeForTarget(
    input.state,
    runtimeChannel,
    input.target,
    input.routingOptions.transport,
    input.routingOptions.transportBindingId,
    input.now,
    input.routingOptions.companionStore,
  );

  return {
    runtimeEnvelope,
    canonicalMetadata: resolveRuntimeEnvelopeCanonicalMetadata(
      input.state,
      input.channelId,
      runtimeEnvelope.context,
    ),
  };
}

export async function startAttachedTargetSession(input: {
  state: ChatState;
  channelId: string;
  attachedTarget: RoutingTarget;
  sourceMessageId?: string | null;
  runtimeClient: RuntimeClient;
  now: Date;
  targetStateId: string | null;
  laneId: string | null;
  recordTargetWake: EnsureTargetWakeRecorder;
  taskExecutionContext: ChannelTaskExecutionContext | undefined;
  routingOptions: Pick<
    RuntimeSessionRoutingOptions,
    'transport' | 'transportBindingId' | 'companionStore' | 'runtimeDataDir'
  > & {
    dispatchContextMetadata?: Record<string, unknown>;
  };
}): Promise<EnsureTargetSessionResult> {
  const {
    state,
    channelId,
    attachedTarget,
    runtimeClient,
    now,
    targetStateId,
    laneId,
    recordTargetWake,
    taskExecutionContext,
    routingOptions,
  } = input;
  let nextState = state;
  const spawnCwd = spawnCwdFor(requireChannel(nextState, channelId));
  const workspaceKind = spawnCwd ? 'source' : 'sandbox';
  let createdExecutionTarget: RuntimeSessionExecutionTarget | null = null;
  const sessionLifecycleMetadata: TargetSessionLifecycleMetadata = {
    targetStateId,
    laneId,
    conversationId: null,
    containerId: null,
    transportBindingId: null,
    now,
  };

  try {
    nextState = markTargetWaking(nextState, channelId, attachedTarget, now, laneId);
    const sameChatContinuityMetadata = resolveNewSessionContinuityMetadata({
      state: nextState,
      channelId,
      target: attachedTarget,
      sourceMessageId: input.sourceMessageId ?? null,
    });
    const {
      runtimeEnvelope,
      canonicalMetadata,
    } = await resolveTargetRuntimeEnvelope({
      state: nextState,
      channelId,
      target: attachedTarget,
      now,
      routingOptions,
    });
    sessionLifecycleMetadata.conversationId = canonicalMetadata.conversationId;
    sessionLifecycleMetadata.containerId = canonicalMetadata.containerId;
    sessionLifecycleMetadata.transportBindingId = canonicalMetadata.transportBindingId;

    const createdTargetSession = attachedTarget.participantKind === 'orchestrator'
      ? await createOrchestratorTargetRuntimeSession({
        state: nextState,
        channelId,
        spawnCwd,
        workspaceKind,
        runtimeClient,
        dispatchContextMetadata: {
          ...(routingOptions.dispatchContextMetadata ?? {}),
          ...(sameChatContinuityMetadata ?? {}),
        },
        taskExecutionContext,
        runtimeEnvelope,
      })
      : await createParticipantTargetRuntimeSession({
        state: nextState,
        channelId,
        target: attachedTarget,
        spawnCwd,
        workspaceKind,
        runtimeClient,
        dispatchContextMetadata: {
          ...(routingOptions.dispatchContextMetadata ?? {}),
          ...(sameChatContinuityMetadata ?? {}),
        },
        taskExecutionContext,
        runtimeEnvelope,
      });
    createdExecutionTarget = createdTargetSession.executionTarget;
    nextState = persistCreatedTargetExecutionTarget({
      state: nextState,
      channelId,
      target: attachedTarget,
      executionTarget: createdExecutionTarget,
      now,
    });

    await syncTargetSessionAttachmentWorkspace({
      channelId,
      state: nextState,
      runtimeDataDir: routingOptions.runtimeDataDir,
      targetWorkspacePath: createdTargetSession.session.cwd,
    });
    nextState = persistStartedTargetSession({
      state: nextState,
      channelId,
      target: attachedTarget,
      session: createdTargetSession.session,
      targetLabelProvider: createdExecutionTarget.provider,
      targetLabelInstance: createdExecutionTarget.instance,
      spawnCwd,
      metadata: sessionLifecycleMetadata,
    });

    return {
      state: nextState,
      target: {
        ...attachedTarget,
        laneId,
        sessionId: createdTargetSession.session.id,
      },
      error: null,
      wakeRequest: recordTargetWake('completed'),
      taskExecutionContext,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    nextState = persistFailedTargetSessionStart({
      state: nextState,
      channelId,
      target: attachedTarget,
      error: message,
      targetLabelProvider: createdExecutionTarget?.provider ?? null,
      targetLabelInstance: createdExecutionTarget?.instance ?? null,
      metadata: sessionLifecycleMetadata,
    });

    return {
      state: nextState,
      target: attachedTarget,
      error: message,
      wakeRequest: recordTargetWake('failed', message),
      taskExecutionContext,
    };
  }
}
