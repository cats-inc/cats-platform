import {
  appendWorkflowEvent,
  createWorkflowEvent,
} from '../room-routing/workflow.js';
import type { ChannelDispatchResult } from '../../api/contracts.js';
import type {
  RoomRoutingOutcome,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import type {
  ChannelDispatchCancellationRegistry,
  ChannelDispatchCancellationRequest,
} from './cancellation.js';

function appendCancelledDispatchResult(
  results: ChannelDispatchResult[],
  turnId: string,
  targetStatus: RoomWorkflowTurn['targetStatuses'][number],
): void {
  results.push({
    targetKind: targetStatus.participant.participantKind,
    targetId: targetStatus.participant.participantId,
    targetName: targetStatus.participant.participantName,
    sessionId: null,
    status: 'skipped',
    dispatchId: targetStatus.dispatchId ?? undefined,
    turnId,
    targetStatus: 'cancelled',
    error: 'Stopped by user.',
    sourceMessageId: targetStatus.sourceMessageId,
    trigger: targetStatus.trigger,
    dispatchDepth: targetStatus.depth,
  });
}

export function cancelInFlightWorkflowTargets(options: {
  workflow: RoomWorkflowState;
  activeTurn: RoomWorkflowTurn;
  outcome: RoomRoutingOutcome;
  results: ChannelDispatchResult[];
  nowIso: string;
}): void {
  const {
    workflow,
    activeTurn,
    outcome,
    results,
    nowIso,
  } = options;
  const cancelledDispatchIds = new Set<string>();

  for (const targetStatus of activeTurn.targetStatuses) {
    if (
      targetStatus.status !== 'pending'
      && targetStatus.status !== 'running'
      && targetStatus.status !== 'waiting_for_converge'
    ) {
      continue;
    }

    targetStatus.status = 'cancelled';
    targetStatus.completedAt = nowIso;
    targetStatus.error = 'Stopped by user.';
    activeTurn.updatedAt = nowIso;
    appendCancelledDispatchResult(results, activeTurn.id, targetStatus);

    if (targetStatus.dispatchId) {
      cancelledDispatchIds.add(targetStatus.dispatchId);
    }

    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'target_blocked',
        'blocked',
        `Stopped ${targetStatus.participant.participantName} before the reply completed.`,
        nowIso,
        targetStatus.source,
        targetStatus.sourceMessageId,
        [targetStatus.participant],
        {
          dispatchId: targetStatus.dispatchId,
          metadata: {
            checkpointKind: 'completed',
            blockedReason: 'user_cancelled',
            cancelled: true,
          },
        },
      ),
    );
  }

  for (const dispatch of outcome.dispatches) {
    if (
      !cancelledDispatchIds.has(dispatch.id)
      && dispatch.status !== 'pending'
      && dispatch.status !== 'running'
    ) {
      continue;
    }

    dispatch.status = 'blocked';
    dispatch.completedAt = nowIso;
    dispatch.error = 'Stopped by user.';
  }
}

export function consumeCancellationRequest(
  registry: ChannelDispatchCancellationRegistry | undefined,
  channelId: string,
  nowIso: string,
  activeTurn: RoomWorkflowTurn,
  workflow: RoomWorkflowState,
  outcome: RoomRoutingOutcome,
  results: ChannelDispatchResult[],
): ChannelDispatchCancellationRequest | null {
  const request = registry?.consume(channelId) ?? null;
  if (!request) {
    return null;
  }

  cancelInFlightWorkflowTargets({
    workflow,
    activeTurn,
    outcome,
    results,
    nowIso,
  });
  return request;
}
