// Transport-binding observability helpers.
//
// PLAN-054 Phase 3 §3.4 calls for explicit observability fields covering
// bot binding id, transport binding id, conversation id, and session id.
// These four ids span four different record families, so callers
// (Telegram ingress, transport-state projections, support / debugging
// tools) end up assembling them ad-hoc. This module defines one canonical
// snapshot shape plus a builder that walks `CatsCoreState` and returns a
// consistent view, so transport identity stays separable from runtime
// session identity (per ADR-063 / SPEC-062).

import type {
  AgentId,
  CatsCoreState,
  ConversationId,
  LaneId,
  ParticipantId,
  SessionId,
  SessionRecord,
  SessionRecordStatus,
  TransportBindingDirection,
  TransportBindingId,
  TransportBindingPlatform,
  TransportBindingRecord,
  TransportBindingStatus,
  TurnId,
} from './types.js';

export const TRANSPORT_BINDING_METADATA_BOT_BINDING_KEY = 'botBindingId' as const;

export interface TransportBindingObservabilitySessionSnapshot {
  sessionId: SessionId;
  conversationId: ConversationId;
  turnId: TurnId | null;
  laneId: LaneId | null;
  status: SessionRecordStatus;
  runtimeKey: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface TransportBindingObservabilitySnapshot {
  transportBindingId: TransportBindingId;
  platform: TransportBindingPlatform;
  direction: TransportBindingDirection;
  status: TransportBindingStatus;
  conversationId: ConversationId | null;
  participantId: ParticipantId | null;
  agentId: AgentId | null;
  externalThreadKey: string | null;
  /** Hint only: pulled from `transportBinding.metadata.botBindingId` when
   *  present. The Core does not yet enforce a foreign key from transport
   *  bindings to bot bindings — adapters that rely on this should fall
   *  back to platform-specific lookup if the hint is missing. */
  botBindingIdHint: string | null;
  /** Sessions whose `transportBindingId` references this binding,
   *  preserving runtime identity (sessionId / runtimeKey) separately
   *  from durable transcript identity (conversationId / turnId / laneId). */
  sessions: TransportBindingObservabilitySessionSnapshot[];
}

function readBotBindingHint(binding: TransportBindingRecord): string | null {
  const value = binding.metadata[TRANSPORT_BINDING_METADATA_BOT_BINDING_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function projectSessionSnapshot(
  session: SessionRecord,
): TransportBindingObservabilitySessionSnapshot {
  return {
    sessionId: session.id,
    conversationId: session.conversationId,
    turnId: session.turnId,
    laneId: session.laneId,
    status: session.status,
    runtimeKey: session.runtimeKey,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    updatedAt: session.updatedAt,
  };
}

export function findSessionsForTransportBinding(
  core: CatsCoreState,
  transportBindingId: TransportBindingId,
): SessionRecord[] {
  return core.sessions.filter((session) =>
    session.transportBindingId === transportBindingId);
}

export function buildTransportBindingObservabilitySnapshot(
  core: CatsCoreState,
  transportBindingId: TransportBindingId,
): TransportBindingObservabilitySnapshot | null {
  const binding = core.transportBindings.find((candidate) =>
    candidate.id === transportBindingId);
  if (!binding) {
    return null;
  }
  const sessions = findSessionsForTransportBinding(core, transportBindingId)
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(projectSessionSnapshot);

  return {
    transportBindingId: binding.id,
    platform: binding.platform,
    direction: binding.direction,
    status: binding.status,
    conversationId: binding.conversationId,
    participantId: binding.participantId,
    agentId: binding.agentId,
    externalThreadKey: binding.externalThreadKey,
    botBindingIdHint: readBotBindingHint(binding),
    sessions,
  };
}

export function buildAllTransportBindingObservabilitySnapshots(
  core: CatsCoreState,
): TransportBindingObservabilitySnapshot[] {
  return core.transportBindings
    .map((binding) =>
      buildTransportBindingObservabilitySnapshot(core, binding.id))
    .filter((snapshot): snapshot is TransportBindingObservabilitySnapshot =>
      snapshot !== null);
}
