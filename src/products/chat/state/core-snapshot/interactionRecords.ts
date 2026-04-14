import { randomUUID } from 'node:crypto';

import type {
  ContainerRecord,
  LaneRecord,
  MissionRecord,
  ParticipantRecord,
  SegmentRecord,
  SessionRecord,
  TransportBindingRecord,
  TurnRecord,
} from '../../../../core/types.js';
import {
  asRecord,
  normalizeMetadata,
  readNullableString,
  readNumber,
  readString,
} from './shared.js';

export function normalizeParticipantRecord(rawParticipant: unknown): ParticipantRecord | null {
  const participantRecord = asRecord(rawParticipant);
  if (!participantRecord) {
    return null;
  }

  const rawStatus = readString(participantRecord.status, 'active');
  const status = (
    rawStatus === 'active'
    || rawStatus === 'inactive'
    || rawStatus === 'removed'
  )
    ? rawStatus
    : 'active';

  return {
    id: readString(participantRecord.id, randomUUID()),
    conversationId: readString(participantRecord.conversationId),
    agentId: readString(participantRecord.agentId),
    joinedAt: readString(participantRecord.joinedAt, new Date().toISOString()),
    updatedAt: readString(participantRecord.updatedAt, new Date().toISOString()),
    role: readNullableString(participantRecord.role),
    status,
    metadata: normalizeMetadata(participantRecord.metadata),
  };
}

export function normalizeContainerRecord(rawContainer: unknown): ContainerRecord | null {
  const containerRecord = asRecord(rawContainer);
  if (!containerRecord) {
    return null;
  }

  const rawKind = readString(containerRecord.kind, 'chat_root');
  const kind = (
    rawKind === 'chat_root'
    || rawKind === 'parallel_group'
    || rawKind === 'project_workspace'
    || rawKind === 'work_portfolio'
  )
    ? rawKind
    : 'chat_root';
  const rawStatus = readString(containerRecord.status, 'active');
  const status = rawStatus === 'archived' ? 'archived' : 'active';

  return {
    id: readString(containerRecord.id, randomUUID()),
    kind,
    title: readString(containerRecord.title, 'Untitled container'),
    status,
    parentContainerId: readNullableString(containerRecord.parentContainerId),
    createdAt: readString(containerRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(containerRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(containerRecord.metadata),
  };
}

export function normalizeTurnRecord(rawTurn: unknown): TurnRecord | null {
  const turnRecord = asRecord(rawTurn);
  if (!turnRecord) {
    return null;
  }

  const rawKind = readString(turnRecord.kind, 'user');
  const kind = (
    rawKind === 'user'
    || rawKind === 'agent'
    || rawKind === 'system'
    || rawKind === 'transport'
  )
    ? rawKind
    : 'user';
  const rawStatus = readString(turnRecord.status, 'planned');
  const status = (
    rawStatus === 'planned'
    || rawStatus === 'active'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'planned';

  return {
    id: readString(turnRecord.id, randomUUID()),
    conversationId: readString(turnRecord.conversationId),
    kind,
    status,
    sourceParticipantId: readNullableString(turnRecord.sourceParticipantId),
    createdAt: readString(turnRecord.createdAt, new Date().toISOString()),
    startedAt: readNullableString(turnRecord.startedAt),
    completedAt: readNullableString(turnRecord.completedAt),
    updatedAt: readString(turnRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(turnRecord.metadata),
  };
}

export function normalizeLaneRecord(rawLane: unknown): LaneRecord | null {
  const laneRecord = asRecord(rawLane);
  if (!laneRecord) {
    return null;
  }

  const rawStatus = readString(laneRecord.status, 'pending');
  const status = (
    rawStatus === 'pending'
    || rawStatus === 'waiting'
    || rawStatus === 'connecting'
    || rawStatus === 'running'
    || rawStatus === 'streaming'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'pending';

  return {
    id: readString(laneRecord.id, randomUUID()),
    turnId: readString(laneRecord.turnId),
    conversationId: readString(laneRecord.conversationId),
    participantId: readNullableString(laneRecord.participantId),
    agentId: readNullableString(laneRecord.agentId),
    orderIndex: readNumber(laneRecord.orderIndex, 0),
    status,
    createdAt: readString(laneRecord.createdAt, new Date().toISOString()),
    startedAt: readNullableString(laneRecord.startedAt),
    completedAt: readNullableString(laneRecord.completedAt),
    updatedAt: readString(laneRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(laneRecord.metadata),
  };
}

export function normalizeSegmentRecord(rawSegment: unknown): SegmentRecord | null {
  const segmentRecord = asRecord(rawSegment);
  if (!segmentRecord) {
    return null;
  }

  const rawKind = readString(segmentRecord.kind, 'text');
  const kind = (
    rawKind === 'status'
    || rawKind === 'text'
    || rawKind === 'tool'
    || rawKind === 'artifact'
    || rawKind === 'system'
  )
    ? rawKind
    : 'text';
  const rawStatus = readString(segmentRecord.status, 'pending');
  const status = (
    rawStatus === 'pending'
    || rawStatus === 'streaming'
    || rawStatus === 'complete'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'pending';

  return {
    id: readString(segmentRecord.id, randomUUID()),
    laneId: readString(segmentRecord.laneId),
    turnId: readString(segmentRecord.turnId),
    conversationId: readString(segmentRecord.conversationId),
    sessionId: readNullableString(segmentRecord.sessionId),
    sequence: readNumber(segmentRecord.sequence, 0),
    kind,
    status,
    content: readNullableString(segmentRecord.content),
    createdAt: readString(segmentRecord.createdAt, new Date().toISOString()),
    completedAt: readNullableString(segmentRecord.completedAt),
    metadata: normalizeMetadata(segmentRecord.metadata),
  };
}

export function normalizeSessionRecord(rawSession: unknown): SessionRecord | null {
  const sessionRecord = asRecord(rawSession);
  if (!sessionRecord) {
    return null;
  }

  const rawStatus = readString(sessionRecord.status, 'connecting');
  const status = (
    rawStatus === 'connecting'
    || rawStatus === 'active'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'connecting';

  return {
    id: readString(sessionRecord.id, randomUUID()),
    conversationId: readString(sessionRecord.conversationId),
    turnId: readNullableString(sessionRecord.turnId),
    laneId: readNullableString(sessionRecord.laneId),
    participantId: readNullableString(sessionRecord.participantId),
    agentId: readNullableString(sessionRecord.agentId),
    transportBindingId: readNullableString(sessionRecord.transportBindingId),
    runtimeKey: readNullableString(sessionRecord.runtimeKey),
    status,
    createdAt: readString(sessionRecord.createdAt, new Date().toISOString()),
    startedAt: readNullableString(sessionRecord.startedAt),
    completedAt: readNullableString(sessionRecord.completedAt),
    updatedAt: readString(sessionRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(sessionRecord.metadata),
  };
}

export function normalizeTransportBindingRecord(
  rawTransportBinding: unknown,
): TransportBindingRecord | null {
  const transportBindingRecord = asRecord(rawTransportBinding);
  if (!transportBindingRecord) {
    return null;
  }

  const rawPlatform = readString(transportBindingRecord.platform, 'web');
  const platform = (
    rawPlatform === 'telegram'
    || rawPlatform === 'line'
    || rawPlatform === 'internal'
    || rawPlatform === 'web'
  )
    ? rawPlatform
    : 'web';
  const rawDirection = readString(transportBindingRecord.direction, 'bidirectional');
  const direction = rawDirection === 'inbound' ? 'inbound' : 'bidirectional';
  const rawStatus = readString(transportBindingRecord.status, 'active');
  const status = (
    rawStatus === 'active'
    || rawStatus === 'disabled'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'active';

  return {
    id: readString(transportBindingRecord.id, randomUUID()),
    platform,
    direction,
    conversationId: readNullableString(transportBindingRecord.conversationId),
    participantId: readNullableString(transportBindingRecord.participantId),
    agentId: readNullableString(transportBindingRecord.agentId),
    externalThreadKey: readNullableString(transportBindingRecord.externalThreadKey),
    status,
    createdAt: readString(transportBindingRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(transportBindingRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(transportBindingRecord.metadata),
  };
}

export function normalizeMissionRecord(rawMission: unknown): MissionRecord | null {
  const missionRecord = asRecord(rawMission);
  if (!missionRecord) {
    return null;
  }

  const rawStatus = readString(missionRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'planned'
    || rawStatus === 'queued'
    || rawStatus === 'running'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'draft';

  return {
    id: readString(missionRecord.id, randomUUID()),
    managedWorkId: readNullableString(missionRecord.managedWorkId),
    conversationId: readNullableString(missionRecord.conversationId),
    sourceTurnId: readNullableString(missionRecord.sourceTurnId),
    sourceLaneId: readNullableString(missionRecord.sourceLaneId),
    assignedAgentId: readNullableString(missionRecord.assignedAgentId),
    title: readString(missionRecord.title, 'Untitled mission'),
    status,
    summary: readNullableString(missionRecord.summary),
    createdAt: readString(missionRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(missionRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(missionRecord.metadata),
  };
}
