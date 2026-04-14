import { randomUUID } from 'node:crypto';

import { CoreValidationError } from '../errors.js';
import type {
  CoreLaneWriteInput,
  CoreSegmentWriteInput,
  CoreSessionWriteInput,
  CoreTransportBindingWriteInput,
  CoreTurnWriteInput,
} from './inputs.js';
import {
  normalizeMetadata,
  normalizeNullableString,
  replaceById,
  touchCoreState,
} from './shared.js';
import type {
  CatsCoreState,
  LaneRecord,
  SegmentRecord,
  SessionRecord,
  TransportBindingRecord,
  TurnRecord,
} from '../types.js';

function normalizeNonNegativeInteger(
  value: number | undefined,
  field: string,
): number | null {
  if (value === undefined) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new CoreValidationError(
      `${field} must be a non-negative integer`,
      `${field}_invalid`,
    );
  }

  return value;
}

export function upsertCoreTurn(
  core: CatsCoreState,
  input: CoreTurnWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; turn: TurnRecord; created: boolean } {
  const nowIso = now.toISOString();
  const conversationId = normalizeNullableString(input.conversationId);
  if (!conversationId) {
    throw new CoreValidationError(
      'Turn conversationId is required',
      'turn_conversation_id_required',
    );
  }

  const turnId = normalizeNullableString(input.id) ?? `turn-${randomUUID()}`;
  const existing = core.turns.find((turn) => turn.id === turnId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso;
  const turn: TurnRecord = {
    id: turnId,
    conversationId,
    kind: input.kind ?? existing?.kind ?? 'user',
    status: input.status ?? existing?.status ?? 'planned',
    sourceParticipantId:
      input.sourceParticipantId === undefined
        ? existing?.sourceParticipantId ?? null
        : normalizeNullableString(input.sourceParticipantId),
    createdAt,
    startedAt:
      input.startedAt === undefined
        ? existing?.startedAt ?? null
        : normalizeNullableString(input.startedAt),
    completedAt:
      input.completedAt === undefined
        ? existing?.completedAt ?? null
        : normalizeNullableString(input.completedAt),
    updatedAt: existing ? nowIso : createdAt,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.turns, turn);

  return {
    core: touchCoreState(
      {
        ...core,
        turns: records,
      },
      nowIso,
    ),
    turn,
    created,
  };
}

export function upsertCoreLane(
  core: CatsCoreState,
  input: CoreLaneWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; lane: LaneRecord; created: boolean } {
  const nowIso = now.toISOString();
  const turnId = normalizeNullableString(input.turnId);
  const conversationId = normalizeNullableString(input.conversationId);
  if (!turnId) {
    throw new CoreValidationError('Lane turnId is required', 'lane_turn_id_required');
  }
  if (!conversationId) {
    throw new CoreValidationError(
      'Lane conversationId is required',
      'lane_conversation_id_required',
    );
  }

  const laneId = normalizeNullableString(input.id) ?? `lane-${randomUUID()}`;
  const existing = core.lanes.find((lane) => lane.id === laneId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso;
  const orderIndex = normalizeNonNegativeInteger(input.orderIndex, 'lane.orderIndex');
  const lane: LaneRecord = {
    id: laneId,
    turnId,
    conversationId,
    participantId:
      input.participantId === undefined
        ? existing?.participantId ?? null
        : normalizeNullableString(input.participantId),
    agentId:
      input.agentId === undefined
        ? existing?.agentId ?? null
        : normalizeNullableString(input.agentId),
    orderIndex: orderIndex ?? existing?.orderIndex ?? 0,
    status: input.status ?? existing?.status ?? 'pending',
    createdAt,
    startedAt:
      input.startedAt === undefined
        ? existing?.startedAt ?? null
        : normalizeNullableString(input.startedAt),
    completedAt:
      input.completedAt === undefined
        ? existing?.completedAt ?? null
        : normalizeNullableString(input.completedAt),
    updatedAt: existing ? nowIso : createdAt,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.lanes, lane);

  return {
    core: touchCoreState(
      {
        ...core,
        lanes: records,
      },
      nowIso,
    ),
    lane,
    created,
  };
}

export function upsertCoreSegment(
  core: CatsCoreState,
  input: CoreSegmentWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; segment: SegmentRecord; created: boolean } {
  const nowIso = now.toISOString();
  const laneId = normalizeNullableString(input.laneId);
  const turnId = normalizeNullableString(input.turnId);
  const conversationId = normalizeNullableString(input.conversationId);
  if (!laneId) {
    throw new CoreValidationError('Segment laneId is required', 'segment_lane_id_required');
  }
  if (!turnId) {
    throw new CoreValidationError('Segment turnId is required', 'segment_turn_id_required');
  }
  if (!conversationId) {
    throw new CoreValidationError(
      'Segment conversationId is required',
      'segment_conversation_id_required',
    );
  }

  const segmentId = normalizeNullableString(input.id) ?? `segment-${randomUUID()}`;
  const existing = core.segments.find((segment) => segment.id === segmentId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso;
  const sequence = normalizeNonNegativeInteger(input.sequence, 'segment.sequence');
  const segment: SegmentRecord = {
    id: segmentId,
    laneId,
    turnId,
    conversationId,
    sessionId:
      input.sessionId === undefined
        ? existing?.sessionId ?? null
        : normalizeNullableString(input.sessionId),
    sequence: sequence ?? existing?.sequence ?? 0,
    kind: input.kind ?? existing?.kind ?? 'text',
    status: input.status ?? existing?.status ?? 'pending',
    content:
      input.content === undefined
        ? existing?.content ?? null
        : normalizeNullableString(input.content),
    createdAt,
    completedAt:
      input.completedAt === undefined
        ? existing?.completedAt ?? null
        : normalizeNullableString(input.completedAt),
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.segments, segment);

  return {
    core: touchCoreState(
      {
        ...core,
        segments: records,
      },
      nowIso,
    ),
    segment,
    created,
  };
}

export function upsertCoreSession(
  core: CatsCoreState,
  input: CoreSessionWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; session: SessionRecord; created: boolean } {
  const nowIso = now.toISOString();
  const conversationId = normalizeNullableString(input.conversationId);
  if (!conversationId) {
    throw new CoreValidationError(
      'Session conversationId is required',
      'session_conversation_id_required',
    );
  }

  const sessionId = normalizeNullableString(input.id) ?? `session-${randomUUID()}`;
  const existing = core.sessions.find((session) => session.id === sessionId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso;
  const session: SessionRecord = {
    id: sessionId,
    conversationId,
    turnId:
      input.turnId === undefined
        ? existing?.turnId ?? null
        : normalizeNullableString(input.turnId),
    laneId:
      input.laneId === undefined
        ? existing?.laneId ?? null
        : normalizeNullableString(input.laneId),
    participantId:
      input.participantId === undefined
        ? existing?.participantId ?? null
        : normalizeNullableString(input.participantId),
    agentId:
      input.agentId === undefined
        ? existing?.agentId ?? null
        : normalizeNullableString(input.agentId),
    transportBindingId:
      input.transportBindingId === undefined
        ? existing?.transportBindingId ?? null
        : normalizeNullableString(input.transportBindingId),
    runtimeKey:
      input.runtimeKey === undefined
        ? existing?.runtimeKey ?? null
        : normalizeNullableString(input.runtimeKey),
    status: input.status ?? existing?.status ?? 'connecting',
    createdAt,
    startedAt:
      input.startedAt === undefined
        ? existing?.startedAt ?? null
        : normalizeNullableString(input.startedAt),
    completedAt:
      input.completedAt === undefined
        ? existing?.completedAt ?? null
        : normalizeNullableString(input.completedAt),
    updatedAt: existing ? nowIso : createdAt,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.sessions, session);

  return {
    core: touchCoreState(
      {
        ...core,
        sessions: records,
      },
      nowIso,
    ),
    session,
    created,
  };
}

export function upsertCoreTransportBinding(
  core: CatsCoreState,
  input: CoreTransportBindingWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; transportBinding: TransportBindingRecord; created: boolean } {
  const nowIso = now.toISOString();
  const bindingId = normalizeNullableString(input.id) ?? `transport-binding-${randomUUID()}`;
  const existing = core.transportBindings.find((binding) => binding.id === bindingId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso;
  const transportBinding: TransportBindingRecord = {
    id: bindingId,
    platform: input.platform ?? existing?.platform ?? 'internal',
    direction: input.direction ?? existing?.direction ?? 'bidirectional',
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    participantId:
      input.participantId === undefined
        ? existing?.participantId ?? null
        : normalizeNullableString(input.participantId),
    agentId:
      input.agentId === undefined
        ? existing?.agentId ?? null
        : normalizeNullableString(input.agentId),
    externalThreadKey:
      input.externalThreadKey === undefined
        ? existing?.externalThreadKey ?? null
        : normalizeNullableString(input.externalThreadKey),
    status: input.status ?? existing?.status ?? 'active',
    createdAt,
    updatedAt: existing ? nowIso : createdAt,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.transportBindings, transportBinding);

  return {
    core: touchCoreState(
      {
        ...core,
        transportBindings: records,
      },
      nowIso,
    ),
    transportBinding,
    created,
  };
}
