import type {
  CatsCoreState,
  CoreActorRecord,
  CoreConversationRecord,
  ParticipantRecord,
  SessionRecord,
  TransportBindingRecord,
  TransportBindingPlatform,
  TransportBindingStatus,
} from './types.js';

export interface CoreTransportStateProjectionItem {
  transportBinding: TransportBindingRecord;
  conversation: CoreConversationRecord | null;
  participant: ParticipantRecord | null;
  agent: CoreActorRecord | null;
  latestSession: SessionRecord | null;
  updatedAt: string;
}

export interface CoreTransportStateProjectionSummary {
  total: number;
  active: number;
  disabled: number;
  archived: number;
  internal: number;
  telegram: number;
  line: number;
  web: number;
  withSession: number;
  activeSession: number;
}

export interface CoreTransportStateProjection {
  summary: CoreTransportStateProjectionSummary;
  items: CoreTransportStateProjectionItem[];
}

export interface CoreTransportStateProjectionQuery {
  platforms?: TransportBindingPlatform[];
  statuses?: TransportBindingStatus[];
  conversationIds?: string[];
  participantIds?: string[];
  agentIds?: string[];
  hasSession?: boolean;
  activeSession?: boolean;
  limit?: number;
}

function buildEmptySummary(): CoreTransportStateProjectionSummary {
  return {
    total: 0,
    active: 0,
    disabled: 0,
    archived: 0,
    internal: 0,
    telegram: 0,
    line: 0,
    web: 0,
    withSession: 0,
    activeSession: 0,
  };
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesQuery(
  item: CoreTransportStateProjectionItem,
  query: CoreTransportStateProjectionQuery,
): boolean {
  if (
    query.platforms
    && !query.platforms.includes(item.transportBinding.platform)
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(item.transportBinding.status)
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(item.transportBinding.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.participantIds
    && !query.participantIds.includes(item.transportBinding.participantId ?? '')
  ) {
    return false;
  }
  if (
    query.agentIds
    && !query.agentIds.includes(item.transportBinding.agentId ?? '')
  ) {
    return false;
  }
  if (query.hasSession !== undefined && (item.latestSession !== null) !== query.hasSession) {
    return false;
  }
  if (
    query.activeSession !== undefined
    && ((item.latestSession?.status === 'active') !== query.activeSession)
  ) {
    return false;
  }
  return true;
}

export function buildTransportStateProjection(
  core: CatsCoreState,
  query: CoreTransportStateProjectionQuery = {},
): CoreTransportStateProjection {
  const items = core.transportBindings
    .map<CoreTransportStateProjectionItem>((transportBinding) => {
      const conversation = transportBinding.conversationId
        ? core.conversations.find((candidate) => candidate.id === transportBinding.conversationId)
          ?? null
        : null;
      const participant = transportBinding.participantId
        ? core.participants.find((candidate) => candidate.id === transportBinding.participantId)
          ?? null
        : null;
      const agent = transportBinding.agentId
        ? core.actors.find((candidate) => candidate.id === transportBinding.agentId) ?? null
        : null;
      const latestSession = core.sessions
        .filter((session) => session.transportBindingId === transportBinding.id)
        .sort(compareByUpdatedAt)[0] ?? null;
      const updatedAt = [
        transportBinding.updatedAt,
        conversation?.updatedAt ?? null,
        latestSession?.updatedAt ?? null,
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort((left, right) => right.localeCompare(left))[0] ?? transportBinding.updatedAt;

      return {
        transportBinding,
        conversation,
        participant,
        agent,
        latestSession,
        updatedAt,
      };
    })
    .filter((item) => matchesQuery(item, query))
    .sort((left, right) => {
      const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedComparison !== 0) {
        return updatedComparison;
      }
      return left.transportBinding.id.localeCompare(right.transportBinding.id);
    })
    .slice(0, query.limit);

  const summary = items.reduce<CoreTransportStateProjectionSummary>((accumulator, item) => {
    accumulator.total += 1;
    accumulator[item.transportBinding.status] += 1;
    accumulator[item.transportBinding.platform] += 1;
    if (item.latestSession) {
      accumulator.withSession += 1;
      if (item.latestSession.status === 'active') {
        accumulator.activeSession += 1;
      }
    }
    return accumulator;
  }, buildEmptySummary());

  return {
    summary,
    items,
  };
}
