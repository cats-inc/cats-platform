import type {
  ChatState,
  ParticipantExecutionLease,
} from '../../api/contracts.js';
import type { RuntimeSessionInfo } from '../../../../platform/runtime/client.js';
import type { ParticipantSessionStatus } from '../../../../shared/roomRouting.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  resolveOrchestratorExecutionLease,
  resolveParticipantExecutionLease,
} from '../../shared/channelParticipants.js';
import {
  requireChannel,
  setChannelParticipantLease,
  setChannelChatCwd,
  setChannelOrchestratorLease,
} from '../model/index.js';

export interface DispatchLeasePatch extends Partial<ParticipantExecutionLease> {
  status?: ParticipantSessionStatus;
}

export type RuntimeDispatchRecoveryReason = 'stale_session' | 'session_full';

const STALE_SESSION_PATTERNS = [
  /\bsession not found\b/i,
  /\bsession is closed\b/i,
  /\bresume it first\b/i,
];

const SESSION_FULL_PATTERNS = [
  /\bsession full\b/i,
  /\bhard limit\b/i,
  /\btoken limit\b/i,
  /\bcontext length\b/i,
  /\bmaximum context length\b/i,
];

export function classifyRuntimeDispatchRecoveryError(
  message: string,
): {
  reason: RuntimeDispatchRecoveryReason;
  retryable: boolean;
} | null {
  if (STALE_SESSION_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      reason: 'stale_session',
      retryable: true,
    };
  }

  if (SESSION_FULL_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      reason: 'session_full',
      retryable: false,
    };
  }

  return null;
}

export function createDispatchRecoveryErrorLeasePatch(
  error: string,
  now: Date,
  options: {
    clearSession: boolean;
  },
): DispatchLeasePatch {
  return {
    ...(options.clearSession
      ? {
          sessionId: null,
          cwd: null,
          laneId: null,
          startedAt: null,
        }
      : {}),
    status: 'error',
    lastError: error,
    lastUsedAt: now.toISOString(),
  };
}

export function createDispatchSessionLeasePatch(
  session: RuntimeSessionInfo,
  now: Date,
): DispatchLeasePatch {
  const timestamp = now.toISOString();

  return {
    sessionId: session.id,
    status: session.status === 'ready' ? 'ready' : 'initializing',
    cwd: session.cwd,
    lastError: null,
    provider: session.provider,
    model: session.model,
    startedAt: timestamp,
    lastUsedAt: timestamp,
  };
}

export function extractTargetLeasePatchFromState(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
): DispatchLeasePatch {
  const channel = requireChannel(state, channelId);

  if (target.participantKind === 'cat') {
    const lease = resolveParticipantExecutionLease(
      channel,
      target.participantId,
    );
    if (!lease) {
      throw new Error(`Channel participant assignment not found: ${target.participantId}`);
    }
    return structuredClone(lease);
  }

  return structuredClone(resolveOrchestratorExecutionLease(channel));
}

export function applyDispatchLeasePatch(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  leasePatch: DispatchLeasePatch,
  now: Date,
): ChatState {
  if (target.participantKind === 'cat') {
    return setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      leasePatch,
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    leasePatch,
    now,
  );
}

export function applyDispatchChannelChatCwd(
  state: ChatState,
  channelId: string,
  chatCwd: string,
  now: Date,
): ChatState {
  return setChannelChatCwd(state, channelId, chatCwd, now);
}
