import type { CatsCoreState } from '../../../core/types.js';
import { ownerEntry } from '../../../core/ownerLifecycle.js';
import type { ChatState } from '../api/contracts.js';
import type { RoomWorkflowEvent, RoomWorkflowTurn } from '../../../shared/roomRouting.js';
import { buildRoomWorkflowRunId } from '../../../platform/orchestration/runIds.js';

/** Only workflow-owned duplicate detail is compacted. Conversation messages and outputs are untouched. */
export function compactOwnerWorkflowHistory(chat: ChatState, core: Pick<CatsCoreState, 'ownerLifecycle'>): ChatState {
  if (!core.ownerLifecycle || !Object.entries(core.ownerLifecycle.entries).some(([key, entry]) => key.startsWith('run:') && (entry.logsClearedAt || entry.deleted))) return chat;
  const next = structuredClone(chat);
  for (const channel of next.channels) {
    const routing = channel.roomRouting;
    if (!routing?.workflow) continue;
    const intent = (turnId: string) => ownerEntry(core, 'run', buildRoomWorkflowRunId(channel.id, turnId));
    const summaryEvents = new Set([...routing.workflow.turnHistory, ...(routing.workflow.activeTurn ? [routing.workflow.activeTurn] : [])]
      .map(turn => turn.events.at(-1)?.id).filter(Boolean));
    const compactEvent = (event: RoomWorkflowEvent): RoomWorkflowEvent => {
      const entry = intent(event.turnId);
      if (!entry?.logsClearedAt) return event;
      const metadata: Record<string, unknown> = { logsClearedAt: entry.logsClearedAt };
      for (const key of ['approvalRequired', 'approvalStatus', 'checkpointKind', 'checkpointStatus', 'workflowStageId', 'workflowShape']) {
        if (event.metadata[key] !== undefined) metadata[key] = event.metadata[key];
      }
      return { ...event, message: event.kind === 'outcome' || summaryEvents.has(event.id) ? event.message : 'Execution detail cleared.', metadata };
    };
    const compactTurn = (turn: RoomWorkflowTurn): RoomWorkflowTurn => {
      if (!intent(turn.id)?.logsClearedAt) return turn;
      return { ...turn, events: turn.events.map(compactEvent), targetStatuses: turn.targetStatuses.map(target => ({
        ...target, response: target.response ? { ...target.response, fullText: '' } : null,
      })) };
    };
    routing.workflow.turnHistory = routing.workflow.turnHistory.filter(turn => !intent(turn.id)?.deleted).map(compactTurn);
    if (routing.workflow.activeTurn) routing.workflow.activeTurn = intent(routing.workflow.activeTurn.id)?.deleted ? null : compactTurn(routing.workflow.activeTurn);
    routing.workflow.eventHistory = routing.workflow.eventHistory.filter(event => !intent(event.turnId)?.deleted).map(compactEvent);
    for (const field of ['lastCheckpointEvent', 'lastOutcomeEvent'] as const) {
      const event = routing.workflow[field];
      if (event) routing.workflow[field] = intent(event.turnId)?.deleted ? null : compactEvent(event);
    }
    if (routing.lastOutcome && intent(routing.lastOutcome.turnId)?.deleted) {
      if (routing.lastCheckpoint && routing.lastOutcome.checkpoints.some(checkpoint => checkpoint.id === routing.lastCheckpoint?.id)) routing.lastCheckpoint = null;
      routing.lastOutcome = null;
    }
    else if (routing.lastOutcome && intent(routing.lastOutcome.turnId)?.logsClearedAt) {
      routing.lastOutcome.dispatches = routing.lastOutcome.dispatches.map(dispatch => ({ ...dispatch, response: dispatch.response ? { ...dispatch.response, fullText: '' } : null }));
      routing.lastOutcome.checkpoints = routing.lastOutcome.checkpoints.map(checkpoint => ({ ...checkpoint, message: 'Execution detail cleared.' }));
      if (routing.lastCheckpoint) routing.lastCheckpoint.message = 'Execution detail cleared.';
    }
  }
  return next;
}
