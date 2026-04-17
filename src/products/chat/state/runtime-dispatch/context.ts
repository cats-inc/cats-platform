import type { RuntimeSessionInvocationContext } from '../../../../runtime/client.js';
import type { DispatchRequest } from '../room-routing/runtime.js';
import { buildChatLaneId } from '../../../../shared/chatCoreIds.js';

export function buildDispatchRuntimeContextMetadata(
  request: Pick<
    DispatchRequest,
    | 'dispatchId'
    | 'turnId'
    | 'targetStateId'
    | 'target'
    | 'sourceMessage'
    | 'sourceParticipant'
    | 'trigger'
    | 'depth'
    | 'branchStrategy'
    | 'handoffReason'
    | 'mentionNames'
  >,
  options: {
    continuityMode?: 'fresh_start' | 'native_resume' | 'full_transplant' | null;
    continuityResetAt?: string | null;
  } = {},
): Record<string, unknown> {
  return {
    dispatchId: request.dispatchId,
    turnId: request.turnId,
    targetStateId: request.targetStateId,
    laneId: request.target.laneId?.trim() || buildChatLaneId(
      request.turnId,
      request.targetStateId,
      request.target.participantId,
    ),
    sourceMessageId: request.sourceMessage.id,
    trigger: request.trigger,
    dispatchDepth: request.depth,
    branchStrategy: request.branchStrategy,
    handoffReason: request.handoffReason,
    mentionNames: structuredClone(request.mentionNames),
    sourceParticipantKind: request.sourceParticipant?.participantKind ?? null,
    sourceParticipantId: request.sourceParticipant?.participantId ?? null,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
    continuityMode: options.continuityMode ?? null,
    continuityResetAt: options.continuityResetAt ?? null,
  };
}

export function mergeRuntimeInvocationContextMetadata(
  context: RuntimeSessionInvocationContext | undefined,
  metadata: Record<string, unknown>,
): RuntimeSessionInvocationContext {
  return {
    ...(context ?? {}),
    metadata: {
      ...(context?.metadata ?? {}),
      ...structuredClone(metadata),
    },
  };
}
