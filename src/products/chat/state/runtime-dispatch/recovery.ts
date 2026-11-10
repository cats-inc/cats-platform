import type {
  ChatState,
  ParticipantExecutionLease,
} from '../../api/contracts.js';
import type { RuntimeSessionInfo } from '../../../../platform/runtime/client.js';
import type { ParticipantSessionStatus } from '../../../../shared/roomRouting.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  resolveExecutionLeaseSnapshot,
} from '../../shared/channelParticipants.js';
import {
  requireChannel,
  setChannelParticipantLease,
  setChannelChatCwd,
} from '../model/index.js';

export interface DispatchLeasePatch extends Partial<ParticipantExecutionLease> {
  status?: ParticipantSessionStatus;
}

export type RuntimeDispatchRecoveryReason =
  | 'provider_session_unavailable'
  | 'stale_session'
  | 'session_full';

/** Runtime's code for a provider-native session that can no longer be resumed. */
export const PROVIDER_SESSION_UNAVAILABLE_CODE = 'provider_session_unavailable';

/**
 * The same condition as reported by provider CLIs to a Runtime that does not
 * yet attach the code. The code itself is also matched so a lease's stored
 * `lastError` keeps its class.
 */
const PROVIDER_SESSION_UNAVAILABLE_PATTERNS = [
  /\bprovider_session_unavailable\b/i,
  // grok
  /\bNo saved copy of session\b[^.]*\bwas found\b/i,
  // claude
  /\bNo conversation found with session ID\b/i,
];

export interface RuntimeErrorSignal {
  code: string | null;
  status: number | null;
}

function readErrorCodeField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Reads the machine-readable fields a Runtime client error may carry. A send
 * through the supervision boundary arrives rewrapped, with Runtime's code kept
 * as `causeCode`.
 */
export function readRuntimeErrorSignal(error: unknown): RuntimeErrorSignal {
  if (!error || typeof error !== 'object') {
    return { code: null, status: null };
  }
  const { code, causeCode, status } = error as { code?: unknown; causeCode?: unknown; status?: unknown };
  return {
    code: readErrorCodeField(causeCode) ?? readErrorCodeField(code),
    status: typeof status === 'number' && Number.isFinite(status) ? status : null,
  };
}

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

/**
 * `retryable` means a resume of the same Runtime session may help. A
 * `provider_session_unavailable` error is never resumable: the provider-native
 * session is gone, so the conversation rotates to a new Runtime session.
 */
export function classifyRuntimeDispatchRecoveryError(
  message: string,
  signal: Partial<RuntimeErrorSignal> = {},
): {
  reason: RuntimeDispatchRecoveryReason;
  retryable: boolean;
} | null {
  if (
    signal.code === PROVIDER_SESSION_UNAVAILABLE_CODE
    || PROVIDER_SESSION_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return {
      reason: 'provider_session_unavailable',
      retryable: false,
    };
  }

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

/**
 * Error text for a lease whose provider-native session is gone. A typed
 * Runtime code is kept in the text, since a lease stores only `lastError` and a
 * later wake must still recognise the class.
 */
export function describeProviderSessionUnavailableError(detail: string): string {
  const trimmed = detail.trim() || 'The provider session is no longer available.';
  return PROVIDER_SESSION_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(trimmed))
    ? trimmed
    : `${trimmed} (${PROVIDER_SESSION_UNAVAILABLE_CODE})`;
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
  const lease = resolveExecutionLeaseSnapshot(channel, target);
  if (!lease) {
    throw new Error(`Channel participant assignment not found: ${target.participantId}`);
  }
  return lease;
}

export function applyDispatchLeasePatch(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  leasePatch: DispatchLeasePatch,
  now: Date,
): ChatState {
  return setChannelParticipantLease(
    state,
    channelId,
    target.participantId,
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
