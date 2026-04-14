import type {
  CatsCoreState,
  TransportBindingDirection,
  TransportBindingPlatform,
  TransportBindingRecord,
  TransportBindingStatus,
} from './types.js';

export interface CoreTransportBindingListQuery {
  platforms?: TransportBindingPlatform[];
  directions?: TransportBindingDirection[];
  statuses?: TransportBindingStatus[];
  conversationIds?: string[];
  participantIds?: string[];
  agentIds?: string[];
  externalThreadKeys?: string[];
  limit?: number;
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
  transportBinding: TransportBindingRecord,
  query: CoreTransportBindingListQuery,
): boolean {
  if (
    query.platforms
    && !query.platforms.includes(transportBinding.platform)
  ) {
    return false;
  }
  if (
    query.directions
    && !query.directions.includes(transportBinding.direction)
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(transportBinding.status)
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(transportBinding.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.participantIds
    && !query.participantIds.includes(transportBinding.participantId ?? '')
  ) {
    return false;
  }
  if (
    query.agentIds
    && !query.agentIds.includes(transportBinding.agentId ?? '')
  ) {
    return false;
  }
  if (
    query.externalThreadKeys
    && !query.externalThreadKeys.includes(transportBinding.externalThreadKey ?? '')
  ) {
    return false;
  }

  return true;
}

export function listTransportBindings(
  core: CatsCoreState,
  query: CoreTransportBindingListQuery = {},
): TransportBindingRecord[] {
  return core.transportBindings
    .filter((transportBinding) => matchesQuery(transportBinding, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
