import { randomUUID } from 'node:crypto';

import type {
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRouteResolution,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
} from '../../../../shared/roomRouting.js';
import { buildChatLaneId } from '../../../../shared/chatCoreIds.js';
import {
  resolveMentionRoute,
  type RoutingTarget,
} from '../mentionRouter.js';

export interface TargetResolution {
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  resolution: RoomRouteResolution;
}

export interface DispatchFrame {
  sourceMessage: ChatMessage;
  promptSourceMessage?: ChatMessage | null;
  sourceTurnId?: string | null;
  sourceLaneId?: string | null;
  sourceAssistantTurnId?: string | null;
  targetStateIds?: string[] | null;
  sourceParticipant: RoomRoutingParticipantRef | null;
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  depth: number;
  branchStrategyOverride?: RoomWorkflowBranchStrategy | null;
  workflowShapeOverride?: RoomWorkflowShape | null;
  workflowStageId?: string | null;
  reviewRequired?: boolean;
  continuationSource?: 'explicit_mentions' | 'workflow_recommendation';
  workflowRecommendation?: Record<string, unknown> | null;
}

export interface DispatchRequest extends DispatchFrame {
  turnId: string;
  target: RoutingTarget;
  dispatchId: string;
  targetStateId: string;
  parentCheckpointId: string | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
}

export interface PreseededWorkflowTurnTarget {
  targetStateId: string;
  target: RoutingTarget;
}

export function detachRoutingTargetRuntimeAttachment(
  target: RoutingTarget,
): RoutingTarget {
  return {
    ...target,
    laneId: null,
    sessionId: null,
  };
}

export function detachRoutingTargetsRuntimeAttachments(
  targets: ReadonlyArray<RoutingTarget>,
): RoutingTarget[] {
  return targets.map((target) => detachRoutingTargetRuntimeAttachment(target));
}

export function preseedWorkflowTurnTargets(
  turnId: string,
  targets: ReadonlyArray<RoutingTarget>,
): PreseededWorkflowTurnTarget[] {
  return targets.map((target) => {
    const targetStateId = randomUUID();
    const explicitLaneId = target.laneId?.trim() || null;
    return {
      targetStateId,
      target: {
        ...target,
        laneId: explicitLaneId ?? buildChatLaneId(
          turnId,
          targetStateId,
          target.participantId,
        ),
        sessionId: explicitLaneId
          ? (target.sessionId?.trim() || null)
          : null,
      },
    };
  });
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
    targets: detachRoutingTargetsRuntimeAttachments(result.targets),
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
  return targetCount > 1 ? 'concurrent' : 'sequential';
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
  _depth: number,
): RoomWorkflowBranchStrategy {
  if (sourceParticipant && sourceParticipant.participantId !== target.participantId) {
    return 'transplant_context';
  }

  return 'fresh_no_parent';
}
