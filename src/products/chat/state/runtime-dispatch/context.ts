import type { RuntimeSessionInvocationContext } from '../../../../runtime/client.js';
import type { DispatchRequest } from '../room-routing/runtime.js';

export function buildDispatchRuntimeContextMetadata(
  request: Pick<
    DispatchRequest,
    | 'dispatchId'
    | 'targetStateId'
    | 'sourceMessage'
    | 'sourceParticipant'
    | 'trigger'
    | 'depth'
    | 'branchStrategy'
    | 'handoffReason'
    | 'mentionNames'
  >,
): Record<string, unknown> {
  return {
    dispatchId: request.dispatchId,
    targetStateId: request.targetStateId,
    sourceMessageId: request.sourceMessage.id,
    trigger: request.trigger,
    dispatchDepth: request.depth,
    branchStrategy: request.branchStrategy,
    handoffReason: request.handoffReason,
    mentionNames: structuredClone(request.mentionNames),
    sourceParticipantKind: request.sourceParticipant?.participantKind ?? null,
    sourceParticipantId: request.sourceParticipant?.participantId ?? null,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
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
