import type {
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type {
  RoomRouteResolution,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
} from '../../../shared/roomRouting.js';
import {
  resolveMentionRoute,
  type RoutingTarget,
} from './mentionRouter.js';

export interface TargetResolution {
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  resolution: RoomRouteResolution;
}

export interface DispatchFrame {
  sourceMessage: ChatMessage;
  sourceParticipant: RoomRoutingParticipantRef | null;
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  depth: number;
}

export interface DispatchRequest extends DispatchFrame {
  target: RoutingTarget;
  dispatchId: string;
  targetStateId: string;
  parentCheckpointId: string | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
}

export function resolveTargets(
  state: ChatState,
  channelId: string,
  body: string,
  options: {
    allowDefaultTarget: boolean;
    explicitTrigger: RoomRoutingTrigger;
  },
): TargetResolution {
  const result = resolveMentionRoute(state, channelId, body, options);
  return {
    targets: result.targets,
    unresolved: result.unresolvedMentions,
    mentionNames: result.parsedMentionNames,
    trigger: result.trigger,
    resolution: structuredClone(result.resolution),
  };
}

export function mergeUnresolvedMentions(
  outcome: RoomRoutingOutcome,
  mentions: string[],
): void {
  for (const mention of mentions) {
    if (!outcome.unresolvedMentions.includes(mention)) {
      outcome.unresolvedMentions.push(mention);
    }
  }
}

export function workflowShapeForTargets(targetCount: number): RoomWorkflowShape {
  return targetCount > 1 ? 'parallel' : 'sequential';
}

export function workflowStageIdForTrigger(trigger: RoomRoutingTrigger): string {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_dispatch';
    case 'continuation_mention':
      return 'continuation_handoff';
    case 'room_default':
    default:
      return 'default_dispatch';
  }
}

export function resolveWorkflowHandoffReason(
  trigger: RoomRoutingTrigger,
): RoomWorkflowHandoffReason {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_mention';
    case 'continuation_mention':
      return 'workflow_continuation';
    case 'room_default':
    default:
      return 'room_default';
  }
}

export function resolveWorkflowBranchStrategy(
  sourceParticipant: RoomRoutingParticipantRef | null,
  target: RoutingTarget,
  depth: number,
): RoomWorkflowBranchStrategy {
  if (depth > 0 && sourceParticipant && sourceParticipant.participantId !== target.participantId) {
    return 'transplant_context';
  }

  return 'fresh_no_parent';
}
