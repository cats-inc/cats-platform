import type { ChatState } from '../../api/contracts.js';
import type { RoomWakeRequest } from '../../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  buildChannelView,
  requireChannel,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { buildSoloChatContinuityTransplantInstructions } from '../prompts.js';
import { resolveRuntimeEnvelopeForTarget } from '../runtimeTargeting.js';
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

function resolveNewSoloSessionContinuityMetadata(input: {
  state: ChatState;
  channelId: string;
  sourceMessageId?: string | null;
}): {
  continuityMode: 'fresh_start' | 'full_transplant';
  continuityDeliveryMode: 'none' | 'turn_instructions';
  continuityResetAt: string | null;
} | null {
  const channel = buildChannelView(input.state, input.channelId);
  if (channel.composerMode !== 'solo') {
    return null;
  }

  const sourceMessageId = input.sourceMessageId?.trim() || null;
  if (!sourceMessageId) {
    return {
      continuityMode: 'fresh_start',
      continuityDeliveryMode: 'none',
      continuityResetAt: channel.continuityResetAt?.trim() || null,
    };
  }

  const continuityResetAt = channel.continuityResetAt?.trim() || null;
  const continuityMessages = continuityResetAt
    ? channel.messages.filter((message) => message.createdAt.localeCompare(continuityResetAt) > 0)
    : channel.messages;
  const sourceIndex = continuityMessages.findIndex((message) => message.id === sourceMessageId);
  const priorMessages = sourceIndex > 0
    ? continuityMessages.slice(0, sourceIndex)
    : [];
  const instructions = buildSoloChatContinuityTransplantInstructions(priorMessages);

  return {
    continuityMode: instructions ? 'full_transplant' : 'fresh_start',
    continuityDeliveryMode: instructions ? 'turn_instructions' : 'none',
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
    const soloContinuityMetadata = attachedTarget.participantKind === 'orchestrator'
      ? resolveNewSoloSessionContinuityMetadata({
        state: nextState,
        channelId,
        sourceMessageId: input.sourceMessageId ?? null,
      })
      : null;
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
          ...(soloContinuityMetadata ?? {}),
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
        dispatchContextMetadata: routingOptions.dispatchContextMetadata,
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
