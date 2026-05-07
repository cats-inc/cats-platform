import type { ChatState } from '../../api/contracts.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { requireChannel } from '../model/index.js';

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
