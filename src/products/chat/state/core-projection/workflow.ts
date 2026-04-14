import type {
  CoreActivityKind,
  CoreActivityRecord,
  CoreCheckpointRecord,
  CoreCheckpointStatus,
  MissionRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTraceKind,
  CoreTraceRecord,
} from '../../../../core/types.js';
import {
  buildCoreWorkflowSummary,
} from '../../../../core/governance.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID, createCatActorId } from '../../../../core/actors.js';
import { buildChatLaneId } from '../../../../shared/chatCoreIds.js';
import type { ChatChannelState } from '../../api/contracts.js';
import type {
  RoomRoutingParticipantRef,
  RoomWorkflowEvent,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import {
  buildRoomWorkflowMissionId,
  buildRoomWorkflowRunId,
} from '../../../../platform/orchestration/runIds.js';

function actorIdForParticipant(
  participant: RoomRoutingParticipantRef | null,
): string | null {
  if (!participant) {
    return null;
  }

  return participant.participantKind === 'orchestrator'
    ? GLOBAL_ORCHESTRATOR_ACTOR_ID
    : createCatActorId(participant.participantId);
}

export function preserveCoreOwnedRuns(existingRuns: CoreRunRecord[]): CoreRunRecord[] {
  return existingRuns
    .filter((run) => !run.id.startsWith('run-room-routing-'))
    .map((run) => structuredClone(run));
}

export function preserveCoreOwnedMissions(existingMissions: MissionRecord[]): MissionRecord[] {
  return existingMissions
    .filter((mission) => !mission.id.startsWith('mission-room-routing-'))
    .map((mission) => structuredClone(mission));
}

export function preserveCoreOwnedTraces(existingTraces: CoreTraceRecord[]): CoreTraceRecord[] {
  return existingTraces
    .filter((trace) => !trace.id.startsWith('trace-room-routing-'))
    .map((trace) => structuredClone(trace));
}

export function preserveCoreOwnedCheckpoints(
  existingCheckpoints: CoreCheckpointRecord[],
): CoreCheckpointRecord[] {
  return existingCheckpoints
    .filter((checkpoint) => !checkpoint.id.startsWith('checkpoint-room-routing-'))
    .map((checkpoint) => structuredClone(checkpoint));
}

export function preserveCoreOwnedOutcomes(
  existingOutcomes: CoreOrchestrationOutcomeRecord[],
): CoreOrchestrationOutcomeRecord[] {
  return existingOutcomes
    .filter((outcome) => !outcome.id.startsWith('outcome-room-routing-'))
    .map((outcome) => structuredClone(outcome));
}

export function preserveCoreOwnedActivities(
  existingActivities: CoreActivityRecord[],
): CoreActivityRecord[] {
  return existingActivities
    .filter((activity) => !activity.id.startsWith('activity-room-routing-'))
    .map((activity) => structuredClone(activity));
}

export function collectWorkflowTurns(channel: ChatChannelState): RoomWorkflowTurn[] {
  const workflow = channel.roomRouting?.workflow;
  if (!workflow) {
    return [];
  }

  return [
    ...(workflow.activeTurn ? [structuredClone(workflow.activeTurn)] : []),
    ...workflow.turnHistory.map((turn) => structuredClone(turn)),
  ];
}

function toCoreRunStatus(status: RoomWorkflowTurn['status']): CoreRunRecord['status'] {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'queued';
    case 'idle':
    default:
      return 'queued';
  }
}

function toMissionStatus(
  status: RoomWorkflowTargetState['status'],
): MissionRecord['status'] {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    case 'blocked':
    case 'waiting_for_converge':
    default:
      return 'queued';
  }
}

function toCoreTraceKind(event: RoomWorkflowEvent): CoreTraceKind {
  if (event.kind === 'checkpoint') {
    return event.metadata.approvalRequired || event.metadata.approvalStatus
      ? 'approval'
      : 'checkpoint';
  }
  if (event.kind === 'outcome') {
    return 'outcome';
  }
  if (event.kind === 'target_failed' || event.kind === 'guard_blocked') {
    return 'error';
  }
  if (event.kind === 'turn_started' || event.kind === 'fan_out') {
    return 'status';
  }
  return 'dispatch';
}

function toCoreCheckpointStatus(event: RoomWorkflowEvent): CoreCheckpointStatus {
  const metadataStatus = event.metadata.checkpointStatus;
  if (
    metadataStatus === 'open'
    || metadataStatus === 'completed'
    || metadataStatus === 'cancelled'
  ) {
    return metadataStatus;
  }

  return event.status === 'completed' ? 'completed' : 'open';
}

function toCoreOutcomeStatus(
  status: RoomWorkflowTurn['status'],
): CoreOrchestrationOutcomeRecord['status'] {
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    default:
      return 'blocked';
  }
}

export function createWorkflowRun(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
): CoreRunRecord {
  const traceId = `trace-room-routing-${turn.id}`;
  const summary = turn.events[turn.events.length - 1]?.message
    ?? `${channel.title} room workflow turn`;

  return {
    id: buildRoomWorkflowRunId(channel.id, turn.id),
    title: `${channel.title} room turn`,
    status: toCoreRunStatus(turn.status),
    conversationId: `conversation-channel-${channel.id}`,
    taskId: `task-channel-${channel.id}`,
    parentRunId: null,
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    traceId,
    summary,
    createdAt: turn.startedAt,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    updatedAt: turn.updatedAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      guard: turn.guard,
      workflowStageId: turn.stageId,
      workflowShape: turn.workflowShape,
      workflowLastCheckpointId: turn.lastCheckpointId,
      workflowReviewRequired: turn.reviewRequired,
      workflowConvergeTargetId: turn.convergeTargetId,
      branchStates: structuredClone(turn.targetStatuses),
      missionIds: turn.targetStatuses.map((target) =>
        buildRoomWorkflowMissionId(channel.id, turn.id, target.id)),
      continuationCount: turn.continuationCount,
      dispatchCount: turn.dispatchCount,
      targetCount: turn.targetStatuses.length,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: turn.stageId,
        shape: turn.workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
    },
  };
}

export function createWorkflowMission(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  target: RoomWorkflowTargetState,
): MissionRecord {
  return {
    id: buildRoomWorkflowMissionId(channel.id, turn.id, target.id),
    managedWorkId: null,
    conversationId: `conversation-channel-${channel.id}`,
    sourceTurnId: turn.id,
    sourceLaneId: buildChatLaneId(turn.id, target.id, target.participant.participantId),
    assignedAgentId: actorIdForParticipant(target.participant),
    title: `${channel.title} -> ${target.participant.participantName}`,
    status: toMissionStatus(target.status),
    summary: target.error ?? null,
    createdAt: target.queuedAt,
    updatedAt: target.completedAt ?? target.startedAt ?? turn.updatedAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      targetStateId: target.id,
      runId: buildRoomWorkflowRunId(channel.id, turn.id),
      participantId: target.participant.participantId,
      participantKind: target.participant.participantKind,
      participantName: target.participant.participantName,
      dispatchId: target.dispatchId,
      trigger: target.trigger,
      mentionNames: structuredClone(target.mentionNames),
      depth: target.depth,
      parentCheckpointId: target.parentCheckpointId,
      branchStrategy: target.branchStrategy,
      handoffReason: target.handoffReason,
      wakeRequestId: target.wakeRequestId,
      sourceMessageId: target.sourceMessageId,
      sourceParticipantId: target.source?.participantId ?? null,
      sourceParticipantKind: target.source?.participantKind ?? null,
      targetStatus: target.status,
      queuedAt: target.queuedAt,
      startedAt: target.startedAt,
      completedAt: target.completedAt,
      error: target.error,
      responseAssistantTurnId: target.response?.assistantTurnId ?? null,
      workflowShape: turn.workflowShape,
      workflowStageId: turn.stageId,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: turn.stageId,
        shape: turn.workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
    },
  };
}

export function createWorkflowTrace(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreTraceRecord {
  const runId = buildRoomWorkflowRunId(channel.id, turn.id);
  return {
    id: `trace-room-routing-${event.id}`,
    traceId: `trace-room-routing-${turn.id}`,
    kind: toCoreTraceKind(event),
    conversationId: `conversation-channel-${channel.id}`,
    runId,
    taskId: `task-channel-${channel.id}`,
    actorId: actorIdForParticipant(event.actor),
    message: event.message,
    createdAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventKind: event.kind,
      eventStatus: event.status,
      targets: event.targets.map((target) => actorIdForParticipant(target)).filter(Boolean),
      ...structuredClone(event.metadata),
    },
  };
}

export function createWorkflowCheckpoint(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreCheckpointRecord {
  const workflowStageId = typeof event.metadata.workflowStageId === 'string'
    ? event.metadata.workflowStageId
    : turn.stageId;
  const workflowShape = typeof event.metadata.workflowShape === 'string'
    ? event.metadata.workflowShape
    : turn.workflowShape;
  return {
    id: `checkpoint-room-routing-${event.checkpointId ?? event.id}`,
    label: `${channel.title} workflow checkpoint`,
    status: toCoreCheckpointStatus(event),
    conversationId: `conversation-channel-${channel.id}`,
    runId: buildRoomWorkflowRunId(channel.id, turn.id),
    taskId: `task-channel-${channel.id}`,
    sourceTraceId: `trace-room-routing-${event.id}`,
    summary: event.message,
    createdAt: event.createdAt,
    completedAt: toCoreCheckpointStatus(event) === 'completed' ? event.createdAt : null,
    updatedAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventKind: event.kind,
      checkpointKind: event.metadata.checkpointKind ?? null,
      workflowStageId,
      workflowShape,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: workflowStageId,
        shape: workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
      ...structuredClone(event.metadata),
    },
  };
}

export function createWorkflowOutcome(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreOrchestrationOutcomeRecord {
  return {
    id: `outcome-room-routing-${event.outcomeId ?? event.id}`,
    title: `${channel.title} room workflow outcome`,
    status: toCoreOutcomeStatus(turn.status),
    conversationId: `conversation-channel-${channel.id}`,
    runId: buildRoomWorkflowRunId(channel.id, turn.id),
    taskId: `task-channel-${channel.id}`,
    summary: event.message,
    recordedAt: event.createdAt,
    updatedAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventStatus: event.status,
      guard: turn.guard,
      workflowStageId: turn.stageId,
      workflowShape: turn.workflowShape,
      workflowLastCheckpointId: turn.lastCheckpointId,
      branchStates: structuredClone(turn.targetStatuses),
      continuationCount: turn.continuationCount,
      dispatchCount: turn.dispatchCount,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: turn.stageId,
        shape: turn.workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
      ...structuredClone(event.metadata),
    },
  };
}

function toCoreActivityKind(event: RoomWorkflowEvent): CoreActivityKind {
  if (event.metadata.approvalRequired === true || event.metadata.approvalStatus === 'pending') {
    return 'approval_requested';
  }

  if (event.metadata.approvalStatus === 'approved' || event.metadata.approvalStatus === 'rejected') {
    return 'approval_decided';
  }

  if (event.kind === 'checkpoint' || event.kind === 'guard_blocked') {
    return 'checkpoint_recorded';
  }

  if (event.kind === 'turn_started' || event.kind === 'fan_out' || event.kind === 'outcome') {
    return 'status_change';
  }

  return 'work_item_updated';
}

export function createWorkflowActivity(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreActivityRecord {
  return {
    id: `activity-room-routing-${event.id}`,
    kind: toCoreActivityKind(event),
    actorId: actorIdForParticipant(event.actor),
    projectId: null,
    workItemId: null,
    conversationId: `conversation-channel-${channel.id}`,
    taskId: `task-channel-${channel.id}`,
    runId: buildRoomWorkflowRunId(channel.id, turn.id),
    artifactId: null,
    message: event.message,
    createdAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventKind: event.kind,
      eventStatus: event.status,
      workflowStageId: turn.stageId,
      workflowShape: turn.workflowShape,
      ...structuredClone(event.metadata),
    },
  };
}
