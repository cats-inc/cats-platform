import type { ChannelActivationResult, ChatChannelView, ChatState } from '../../api/contracts.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import type { RuntimeSessionInfo } from '../../../../platform/runtime/client.js';
import {
  appendMessage,
  ORCHESTRATOR_NAME,
  resolveChannelCanonicalIdentity,
} from '../model/index.js';
import { parseMentions } from '../mentionParsing.js';
export { activeAssignedParticipants } from '../../shared/channelParticipants.js';
import { activeAssignedParticipants } from '../../shared/channelParticipants.js';
import { formatSessionStartedMessage } from '../runtimeMessages.js';
import { resolveVisibleOrchestratorLabel } from '../../../../shared/orchestratorLabel.js';

export interface RuntimeSessionRoutingOptions {
  transport?: import('../runtimeTargeting.js').RuntimeTransportContext;
  transportBindingId?: string | null;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
  forceReviveClosedSessions?: boolean;
  chatStatePath?: string;
  runtimeDataDir?: string;
  dispatchContextMetadata?: Record<string, unknown>;
}

export interface RuntimeEnvelopeCanonicalMetadata {
  conversationId: string | null;
  containerId: string | null;
  transportBindingId: string | null;
}

export interface RuntimeSessionLifecycleTarget {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
}

export interface RuntimeSessionActivationTarget extends RuntimeSessionLifecycleTarget {
  laneId: string | null;
  sessionId: string | null;
}

export interface RuntimeSessionActivationOutcome {
  error: string | null;
  target: {
    laneId: string | null;
    sessionId: string | null;
  };
  wakeRequest: {
    status: 'pending' | 'completed' | 'failed' | 'skipped';
  } | null;
}

export function readInvocationContextMetadataString(
  context: { metadata?: Record<string, unknown> } | undefined,
  key: string,
): string | null {
  const value = context?.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function resolveRuntimeEnvelopeCanonicalMetadata(
  state: ChatState | null,
  channelId: string,
  runtimeContext: { metadata?: Record<string, unknown> } | undefined,
): RuntimeEnvelopeCanonicalMetadata {
  const canonicalIdentity = resolveChannelCanonicalIdentity(state, channelId);
  return {
    conversationId: readInvocationContextMetadataString(
      runtimeContext,
      'conversationId',
    ) ?? canonicalIdentity.conversationId,
    containerId: readInvocationContextMetadataString(
      runtimeContext,
      'containerId',
    ) ?? canonicalIdentity.containerId,
    transportBindingId: readInvocationContextMetadataString(
      runtimeContext,
      'transportBindingId',
    ),
  };
}

function resolveVisibleRuntimeSessionTargetLabel(input: {
  target: RuntimeSessionLifecycleTarget;
  provider?: string | null;
  instance?: string | null;
}): string {
  if (input.target.participantKind !== 'orchestrator') {
    return input.target.participantName;
  }

  return resolveVisibleOrchestratorLabel({
    displayName: input.target.participantName,
    provider: input.provider,
    instance: input.instance,
  }) ?? ORCHESTRATOR_NAME;
}

export function appendStartedRuntimeSessionMessage(
  state: ChatState,
  channelId: string,
  input: RuntimeEnvelopeCanonicalMetadata & {
    target: RuntimeSessionLifecycleTarget;
    provider: string | null;
    instance: string | null;
    session: RuntimeSessionInfo;
    now: Date;
    targetStateId?: string | null;
    laneId?: string | null;
    incrementUnread?: boolean;
  },
): ChatState {
  return appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: formatSessionStartedMessage(
        resolveVisibleRuntimeSessionTargetLabel({
          target: input.target,
          provider: input.provider,
          instance: input.instance,
        }),
        input.session,
      ),
    },
    input.now,
    {
      metadata: {
        event: 'session_started',
        ...(input.containerId ? { containerId: input.containerId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        targetKind: input.target.participantKind,
        ...(input.target.participantKind === 'cat'
          ? { targetId: input.target.participantId }
          : {}),
        ...(input.targetStateId ? { targetStateId: input.targetStateId } : {}),
        ...(input.laneId ? { laneId: input.laneId } : {}),
        ...(input.transportBindingId ? { transportBindingId: input.transportBindingId } : {}),
        sessionId: input.session.id,
        verbosity: 'verbose',
      },
      ...(input.incrementUnread !== undefined ? { incrementUnread: input.incrementUnread } : {}),
    },
  ).state;
}

export function appendFailedRuntimeSessionMessage(
  state: ChatState,
  channelId: string,
  input: RuntimeEnvelopeCanonicalMetadata & {
    target: RuntimeSessionLifecycleTarget;
    provider: string | null;
    instance: string | null;
    error: string;
    now: Date;
    targetStateId?: string | null;
    laneId?: string | null;
    incrementUnread?: boolean;
  },
): ChatState {
  return appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: `Failed to start ${resolveVisibleRuntimeSessionTargetLabel({
        target: input.target,
        provider: input.provider,
        instance: input.instance,
      })}: ${input.error}`,
    },
    input.now,
    {
      metadata: {
        event: 'session_start_failed',
        ...(input.containerId ? { containerId: input.containerId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        targetKind: input.target.participantKind,
        targetId: input.target.participantId,
        ...(input.targetStateId ? { targetStateId: input.targetStateId } : {}),
        ...(input.laneId ? { laneId: input.laneId } : {}),
        ...(input.transportBindingId ? { transportBindingId: input.transportBindingId } : {}),
      },
      ...(input.incrementUnread !== undefined ? { incrementUnread: input.incrementUnread } : {}),
    },
  ).state;
}

export function buildChannelActivationResult(input: {
  target: RuntimeSessionActivationTarget;
  ensured: RuntimeSessionActivationOutcome;
}): ChannelActivationResult {
  const { ensured, target } = input;
  if (ensured.error) {
    return {
      targetKind: target.participantKind,
      targetId: target.participantId,
      targetName: target.participantName,
      laneId: ensured.target.laneId ?? target.laneId ?? null,
      status: 'error',
      sessionId: null,
      error: ensured.error,
    };
  }

  return {
    targetKind: target.participantKind,
    targetId: target.participantId,
    targetName: target.participantName,
    laneId: ensured.target.laneId,
    status: ensured.wakeRequest?.status === 'skipped' ? 'already_started' : 'started',
    sessionId: ensured.target.sessionId,
  };
}

export function shouldRewriteOrchestratorReply(
  content: string,
  orchestratorName: string,
  channel: ChatChannelView,
): boolean {
  if (activeAssignedParticipants(channel).length > 0) {
    return false;
  }

  const normalized = content.toLowerCase();
  if (parseMentions(content).length > 0) {
    return true;
  }

  return normalized.includes(`@${orchestratorName.toLowerCase()}`)
    || normalized.includes(`@${ORCHESTRATOR_NAME.toLowerCase()}`);
}
