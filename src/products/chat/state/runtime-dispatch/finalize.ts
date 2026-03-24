import { randomUUID } from 'node:crypto';

import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  deriveTerminalTurnStatuses,
  finalizeWorkflowTurn,
} from '../room-routing/workflow.js';
import {
  applyRoomRoutingSnapshot,
} from '../runtime-session/state.js';

export function finalizeDispatchTurn(
  state: ChatState,
  channelId: string,
  now: Date,
  options: {
    nowIso: string;
    baseRoomRouting: RoomRoutingState;
    workflow: RoomWorkflowState;
    activeTurn: RoomWorkflowTurn;
    outcome: RoomRoutingOutcome;
    latestCheckpoint: RoomRoutingCheckpoint | null;
    guardReason: RoomRoutingGuardReason;
    userMessageId: string;
    describeGuardReason: (reason: Exclude<RoomRoutingGuardReason, null>) => string;
  },
): ChatState {
  const {
    activeTurn,
    baseRoomRouting,
    describeGuardReason,
    guardReason,
    nowIso,
    outcome,
    userMessageId,
    workflow,
  } = options;
  let latestCheckpoint = options.latestCheckpoint;

  outcome.guard = guardReason;
  activeTurn.guard = guardReason;
  activeTurn.continuationCount = outcome.continuationCount;
  activeTurn.dispatchCount = outcome.totalDispatchCount;
  activeTurn.stageId = guardReason ? 'guard_blocked' : 'turn_completed';
  const terminalStatuses = deriveTerminalTurnStatuses(outcome, guardReason);
  outcome.status = terminalStatuses.outcomeStatus;
  activeTurn.status = terminalStatuses.workflowStatus;
  outcome.completedAt = nowIso;
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;
  latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'completed',
    guardReason
      ? `Room routing stopped because it hit ${describeGuardReason(guardReason)}.`
      : 'Room routing completed for this turn.',
    nowIso,
    null,
  );
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      activeTurn.status,
      guardReason
        ? `Room workflow ended in a blocked state because it hit ${describeGuardReason(guardReason)}.`
        : activeTurn.status === 'completed'
          ? 'Room workflow completed for this turn.'
          : 'Room workflow ended with failures for this turn.',
      nowIso,
      null,
      userMessageId,
      outcome.resolvedTargets,
      {
        outcomeId: randomUUID(),
        metadata: {
          guard: guardReason,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          workflowLastCheckpointId: activeTurn.lastCheckpointId,
          selectionKind: outcome.resolution.selectionKind,
          defaultTargetReason: outcome.resolution.defaultTargetReason,
          blockedReason: outcome.resolution.blockedReason,
          continuationCount: outcome.continuationCount,
          totalDispatchCount: outcome.totalDispatchCount,
          unresolvedMentions: structuredClone(outcome.unresolvedMentions),
        },
      },
    ),
  );
  finalizeWorkflowTurn(workflow, activeTurn);
  return applyRoomRoutingSnapshot(
    state,
    channelId,
    baseRoomRouting,
    workflow,
    outcome,
    latestCheckpoint,
    now,
  );
}
