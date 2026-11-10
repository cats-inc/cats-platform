import type { ChatState } from '../../api/contracts.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { appendMessage, requireChannel } from '../model/index.js';
import { PROVIDER_SESSION_UNAVAILABLE_CODE } from '../runtime-dispatch/recovery.js';
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
      },
      incrementUnread: false,
    },
  ).state;
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
