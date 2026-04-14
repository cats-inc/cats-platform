import {
  upsertCoreLane,
  upsertCoreSegment,
  upsertCoreSession,
  upsertCoreTransportBinding,
  upsertCoreTurn,
} from '../model/index.js';
import {
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableString,
  readOptionalString,
  readWrappedBody,
} from './shared.js';
import { readTransportBindingListQuery } from './queryFilters.js';
import { readSessionListQuery } from './queryFilters.js';
import {
  CORE_TRANSPORT_BINDING_DIRECTIONS,
  CORE_TRANSPORT_BINDING_PLATFORMS,
  CORE_TRANSPORT_BINDING_STATUSES,
  CORE_LANE_STATUSES,
  CORE_SEGMENT_KINDS,
  CORE_SEGMENT_STATUSES,
  CORE_SESSION_STATUSES,
  CORE_TURN_KINDS,
  CORE_TURN_STATUSES,
} from './constants.js';
import type { CoreApiRouteContext } from './types.js';
import { listTransportBindings } from '../transportBindingList.js';
import { listSessions } from '../sessionList.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTransportBindings(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readTransportBindingListQuery(context.url.searchParams);
  sendJson(context.response, 200, {
    transportBindings: listTransportBindings(core, query),
  });
}

async function handleCoreTurns(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { turns: core.turns });
}

async function handleCoreLanes(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { lanes: core.lanes });
}

async function handleCoreSegments(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { segments: core.segments });
}

async function handleCoreSessions(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readSessionListQuery(context.url.searchParams);
  sendJson(context.response, 200, { sessions: listSessions(core, query) });
}

async function handleCoreTurnWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const turn = await readWrappedBody(context, 'turn');
    const next = upsertCoreTurn(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(turn.id, 'turn.id'),
        conversationId: readNullableString(turn.conversationId, 'turn.conversationId') ?? '',
        kind: readEnumValue(turn.kind, 'turn.kind', CORE_TURN_KINDS),
        status: readEnumValue(turn.status, 'turn.status', CORE_TURN_STATUSES),
        sourceParticipantId: readNullableString(
          turn.sourceParticipantId,
          'turn.sourceParticipantId',
        ),
        createdAt: readOptionalString(turn.createdAt, 'turn.createdAt'),
        startedAt: readNullableString(turn.startedAt, 'turn.startedAt'),
        completedAt: readNullableString(turn.completedAt, 'turn.completedAt'),
        metadata: readMetadata(turn.metadata, 'turn.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedTurn = persisted.turns.find((candidate) => candidate.id === next.turn.id);

    sendJson(context.response, next.created ? 201 : 200, {
      turn: persistedTurn ?? next.turn,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreLaneWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const lane = await readWrappedBody(context, 'lane');
    const next = upsertCoreLane(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(lane.id, 'lane.id'),
        turnId: readNullableString(lane.turnId, 'lane.turnId') ?? '',
        conversationId: readNullableString(lane.conversationId, 'lane.conversationId') ?? '',
        participantId: readNullableString(lane.participantId, 'lane.participantId'),
        agentId: readNullableString(lane.agentId, 'lane.agentId'),
        orderIndex: lane.orderIndex === undefined ? undefined : Number(lane.orderIndex),
        status: readEnumValue(lane.status, 'lane.status', CORE_LANE_STATUSES),
        createdAt: readOptionalString(lane.createdAt, 'lane.createdAt'),
        startedAt: readNullableString(lane.startedAt, 'lane.startedAt'),
        completedAt: readNullableString(lane.completedAt, 'lane.completedAt'),
        metadata: readMetadata(lane.metadata, 'lane.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedLane = persisted.lanes.find((candidate) => candidate.id === next.lane.id);

    sendJson(context.response, next.created ? 201 : 200, {
      lane: persistedLane ?? next.lane,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreSegmentWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const segment = await readWrappedBody(context, 'segment');
    const next = upsertCoreSegment(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(segment.id, 'segment.id'),
        laneId: readNullableString(segment.laneId, 'segment.laneId') ?? '',
        turnId: readNullableString(segment.turnId, 'segment.turnId') ?? '',
        conversationId: readNullableString(segment.conversationId, 'segment.conversationId') ?? '',
        sessionId: readNullableString(segment.sessionId, 'segment.sessionId'),
        sequence: segment.sequence === undefined ? undefined : Number(segment.sequence),
        kind: readEnumValue(segment.kind, 'segment.kind', CORE_SEGMENT_KINDS),
        status: readEnumValue(segment.status, 'segment.status', CORE_SEGMENT_STATUSES),
        content: readNullableString(segment.content, 'segment.content'),
        createdAt: readOptionalString(segment.createdAt, 'segment.createdAt'),
        completedAt: readNullableString(segment.completedAt, 'segment.completedAt'),
        metadata: readMetadata(segment.metadata, 'segment.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedSegment = persisted.segments.find(
      (candidate) => candidate.id === next.segment.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      segment: persistedSegment ?? next.segment,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreSessionWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const session = await readWrappedBody(context, 'session');
    const next = upsertCoreSession(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(session.id, 'session.id'),
        conversationId: readNullableString(session.conversationId, 'session.conversationId') ?? '',
        turnId: readNullableString(session.turnId, 'session.turnId'),
        laneId: readNullableString(session.laneId, 'session.laneId'),
        participantId: readNullableString(session.participantId, 'session.participantId'),
        agentId: readNullableString(session.agentId, 'session.agentId'),
        transportBindingId: readNullableString(
          session.transportBindingId,
          'session.transportBindingId',
        ),
        runtimeKey: readNullableString(session.runtimeKey, 'session.runtimeKey'),
        status: readEnumValue(session.status, 'session.status', CORE_SESSION_STATUSES),
        createdAt: readOptionalString(session.createdAt, 'session.createdAt'),
        startedAt: readNullableString(session.startedAt, 'session.startedAt'),
        completedAt: readNullableString(session.completedAt, 'session.completedAt'),
        metadata: readMetadata(session.metadata, 'session.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedSession = persisted.sessions.find(
      (candidate) => candidate.id === next.session.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      session: persistedSession ?? next.session,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreTransportBindingWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const transportBinding = await readWrappedBody(context, 'transportBinding');
    const next = upsertCoreTransportBinding(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(transportBinding.id, 'transportBinding.id'),
        platform:
          readEnumValue(
            transportBinding.platform,
            'transportBinding.platform',
            CORE_TRANSPORT_BINDING_PLATFORMS,
          ) ?? 'internal',
        direction: readEnumValue(
          transportBinding.direction,
          'transportBinding.direction',
          CORE_TRANSPORT_BINDING_DIRECTIONS,
        ),
        conversationId: readNullableString(
          transportBinding.conversationId,
          'transportBinding.conversationId',
        ),
        participantId: readNullableString(
          transportBinding.participantId,
          'transportBinding.participantId',
        ),
        agentId: readNullableString(
          transportBinding.agentId,
          'transportBinding.agentId',
        ),
        externalThreadKey: readNullableString(
          transportBinding.externalThreadKey,
          'transportBinding.externalThreadKey',
        ),
        status: readEnumValue(
          transportBinding.status,
          'transportBinding.status',
          CORE_TRANSPORT_BINDING_STATUSES,
        ),
        createdAt: readOptionalString(
          transportBinding.createdAt,
          'transportBinding.createdAt',
        ),
        metadata: readMetadata(transportBinding.metadata, 'transportBinding.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedTransportBinding = persisted.transportBindings.find(
      (candidate) => candidate.id === next.transportBinding.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      transportBinding: persistedTransportBinding ?? next.transportBinding,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreInteractionRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/turns') {
    if (context.method === 'GET') {
      await handleCoreTurns(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreTurnWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/lanes') {
    if (context.method === 'GET') {
      await handleCoreLanes(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreLaneWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/segments') {
    if (context.method === 'GET') {
      await handleCoreSegments(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreSegmentWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/sessions') {
    if (context.method === 'GET') {
      try {
        await handleCoreSessions(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreSessionWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/transport-bindings') {
    if (context.method === 'GET') {
      try {
        await handleCoreTransportBindings(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreTransportBindingWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
