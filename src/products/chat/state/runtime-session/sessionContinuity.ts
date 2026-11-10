import type { ChatState } from '../../api/contracts.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { appendMessage, requireChannel } from '../model/index.js';
import {
  describeProviderSessionUnavailableError,
  PROVIDER_SESSION_UNAVAILABLE_CODE,
} from '../runtime-dispatch/recovery.js';
import type { RuntimeSessionLifecycleTarget } from './shared.js';

export const PROVIDER_SESSION_ROTATED_EVENT = 'session_rotated';

/**
 * ADR-068 §2 (amended 2026-11-11): the visible notice a conversation gets when
 * its provider-native session is gone and it continues in a new Runtime session
 * in the same workspace, with a continuity transplant of the conversation.
 */
export function appendProviderSessionRotationMessage(
  state: ChatState,
  channelId: string,
  input: {
    target: RuntimeSessionLifecycleTarget;
    previousSessionId: string | null;
    /** The session that replaced it; only appended once that session exists. */
    replacementSessionId: string;
    laneId?: string | null;
    now: Date;
  },
): ChatState {
  return appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: `${input.target.participantName}'s provider session is no longer available, so the`
        + ' conversation continues in a new session in the same workspace, with the conversation'
        + ' so far handed over.',
    },
    input.now,
    {
      metadata: {
        event: PROVIDER_SESSION_ROTATED_EVENT,
        reason: PROVIDER_SESSION_UNAVAILABLE_CODE,
        targetKind: input.target.participantKind,
        ...(input.target.participantKind === 'cat' ? { targetId: input.target.participantId } : {}),
        ...(input.laneId ? { laneId: input.laneId } : {}),
        ...(input.previousSessionId ? { previousSessionId: input.previousSessionId } : {}),
        replacementSessionId: input.replacementSessionId,
      },
      incrementUnread: false,
    },
  ).state;
}

/**
 * A rotation replacement is never rotated again until a turn completes in it
 * (ADR-068 §2). The transcript already records both facts, so no lease field
 * is needed: the rotation notice names the replacement, and a completed turn
 * leaves an agent message carrying its session id. A quiet heartbeat leaves no
 * message and therefore does not count.
 */
export function isUnconfirmedProviderSessionReplacement(
  state: ChatState,
  channelId: string,
  sessionId: string | null | undefined,
): boolean {
  const id = sessionId?.trim();
  if (!id) {
    return false;
  }
  const { messages } = requireChannel(state, channelId);
  const isReplacement = messages.some((message) =>
    message.metadata?.event === PROVIDER_SESSION_ROTATED_EVENT
    && message.metadata.replacementSessionId === id);
  return isReplacement
    && !messages.some((message) => message.senderKind === 'agent' && message.metadata?.sessionId === id);
}

const REPLACEMENT_PAUSE_MARKER = 'failed the same way before completing a turn';

/** Why a replacement that failed the same way is paused instead of rotated again. */
export function buildProviderSessionReplacementFailure(input: {
  sessionId: string;
  detail: string;
}): string {
  if (input.detail.includes(REPLACEMENT_PAUSE_MARKER)) {
    return input.detail;
  }
  return `Runtime session ${input.sessionId} replaced a session whose provider session was gone and`
    + ` ${REPLACEMENT_PAUSE_MARKER}; the conversation is paused until you reset or retarget.`
    + ` ${describeProviderSessionUnavailableError(input.detail)}`;
}

export function shouldPreserveDirectMessageRuntimeSession(input: {
  state: ChatState;
  channelId: string;
  target: RoutingTarget;
}): boolean {
  return input.target.participantKind === 'cat'
    && Boolean(input.target.sessionId?.trim())
    && isDirectLaneChannel(requireChannel(input.state, input.channelId));
}

export function buildDirectMessageRuntimeResumeFailure(input: {
  sessionId: string | null | undefined;
  resumeError?: string | null;
}): string {
  const sessionId = input.sessionId?.trim() || 'unknown';
  const detail = input.resumeError?.trim();
  return detail
    ? `Direct lane runtime session ${sessionId} could not be resumed; lane is paused until you reset or retarget. ${detail}`
    : `Direct lane runtime session ${sessionId} could not be resumed; lane is paused until you reset or retarget.`;
}
