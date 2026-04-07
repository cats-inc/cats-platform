import { randomUUID } from 'node:crypto';

import type {
  ChannelParticipantAssignment,
  ChatCat,
  ChatChannelState,
  ChatState,
  ParticipantExecutionLease,
} from '../../api/contracts.js';
import type { ParticipantSessionStatus } from '../../../../shared/roomRouting.js';
import {
  normalizeChannelAssignmentsForRoomMode,
  resolveChannelKind,
  resolveDirectLaneLeadParticipantId,
} from '../../shared/channelTopology.js';
import { createEmptyExecutionLease } from '../defaults.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';

export function cloneState(state: ChatState): ChatState {
  return structuredClone(state);
}

export function isoAt(now: Date): string {
  return now.toISOString();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeList(values: string[] | undefined): string[] {
  const list = Array.isArray(values) ? values : [];
  return list
    .map((value) => value.trim())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

export function createChannelId(): string {
  return randomUUID();
}

export function normalizeLeadParticipantId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function inferChannelComposerMode(input: {
  roomMode?: string;
  activeParticipantIds: string[];
}): 'solo' | 'cat_led' {
  if (input.roomMode === 'direct_cat_chat') {
    return 'cat_led';
  }
  return input.activeParticipantIds.length > 0 ? 'cat_led' : 'solo';
}

function resolveChannelParticipantAssignments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
): ChannelParticipantAssignment[] {
  if (Array.isArray(channel.participantAssignments) && channel.participantAssignments.length > 0) {
    return channel.participantAssignments;
  }

  return channel.catAssignments.map((assignment) => ({
    participantId: assignment.participantId,
    sourceKind: assignment.sourceKind,
    sourceRefId: assignment.sourceRefId,
    name: assignment.name,
    status: assignment.status,
    roles: structuredClone(assignment.roles),
    roleHint: assignment.roleHint,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    execution: structuredClone(assignment.execution),
  }));
}

export function syncChannelLeadAndComposerMode(channel: ChatChannelState): void {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  channel.participantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel),
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  channel.catAssignments = normalizeChannelAssignmentsForRoomMode(
    channel.catAssignments,
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  channel.channelKind = resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: roomRouting.mode,
    participants: channel.participantAssignments,
  });
  const activeParticipantIds = channel.participantAssignments
    .filter((assignment) => assignment.status === 'active')
    .map((assignment) => assignment.participantId);
  const currentLeadId = roomRouting.leadParticipantId;
  const hasValidLead = Boolean(currentLeadId && activeParticipantIds.includes(currentLeadId));

  channel.composerMode = inferChannelComposerMode({
    roomMode: roomRouting.mode,
    activeParticipantIds,
  });

  if (channel.channelKind === 'direct_lane') {
    roomRouting.leadParticipantId = resolveDirectLaneLeadParticipantId(
      channel.participantAssignments,
      currentLeadId,
    );
    channel.orchestratorLease = createEmptyExecutionLease();
  } else if (activeParticipantIds.length === 0) {
    roomRouting.leadParticipantId = null;
  } else if (!hasValidLead) {
    roomRouting.leadParticipantId = activeParticipantIds[0] ?? null;
  }

  channel.roomRouting = roomRouting;
}

export function findChannelIndex(state: ChatState, channelId: string): number {
  return state.channels.findIndex((channel) => channel.id === channelId);
}

export function requireChannel(state: ChatState, channelId: string): ChatChannelState {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  return channel;
}

export function requireCat(state: ChatState, catId: string): ChatCat {
  const cat = state.cats.find((candidate) => candidate.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }

  return cat;
}

export function updateExecutionLease(
  current: ParticipantExecutionLease,
  input: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
): ParticipantExecutionLease {
  return {
    sessionId:
      input.sessionId === undefined ? current.sessionId : input.sessionId,
    status: input.status ?? current.status,
    cwd: input.cwd === undefined ? current.cwd : input.cwd,
    lastError:
      input.lastError === undefined ? current.lastError : input.lastError,
    provider:
      input.provider === undefined ? current.provider : normalizeOptionalText(input.provider),
    model:
      input.model === undefined ? current.model : normalizeOptionalText(input.model),
    startedAt:
      input.startedAt === undefined ? current.startedAt : input.startedAt,
    lastUsedAt:
      input.lastUsedAt === undefined ? current.lastUsedAt : input.lastUsedAt,
  };
}
