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
  resolveDirectLaneRecipientId,
} from '../../shared/channelTopology.js';
import { cloneProviderModelSelection } from '../../../../shared/providerSelection.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
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

export function normalizeDefaultRecipientId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function syncChannelDefaultRecipientAndTopology(channel: ChatChannelState): void {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  channel.participantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel),
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  channel.catAssignments = normalizeChannelAssignmentsForRoomMode(
    channel.catAssignments,
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  channel.channelKind = resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: roomRouting.mode,
    participants: channel.participantAssignments,
  });
  const activeParticipantIds = channel.participantAssignments
    .filter((assignment) => assignment.status === 'active')
    .map((assignment) => assignment.participantId);
  const currentLeadId = roomRouting.defaultRecipientId;
  const hasValidLead = Boolean(currentLeadId && activeParticipantIds.includes(currentLeadId));

  if (channel.channelKind === 'direct_lane') {
    roomRouting.defaultRecipientId = resolveDirectLaneRecipientId(
      channel.participantAssignments,
      currentLeadId,
    );
    channel.orchestratorLease = createEmptyExecutionLease();
  } else if (activeParticipantIds.length === 0) {
    roomRouting.defaultRecipientId = null;
  } else if (!hasValidLead) {
    roomRouting.defaultRecipientId = activeParticipantIds[0] ?? null;
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
  const nextInstance = input.instance === undefined
    ? (current.instance === undefined ? undefined : current.instance)
    : normalizeOptionalText(input.instance);
  const nextModelSelection = input.modelSelection === undefined
    ? (
        current.modelSelection === undefined
          ? undefined
          : cloneProviderModelSelection(current.modelSelection)
      )
    : cloneProviderModelSelection(input.modelSelection);

  return {
    sessionId:
      input.sessionId === undefined ? current.sessionId : input.sessionId,
    status: input.status ?? current.status,
    cwd: input.cwd === undefined ? current.cwd : input.cwd,
    lastError:
      input.lastError === undefined ? current.lastError : input.lastError,
    laneId:
      input.laneId === undefined ? current.laneId : normalizeOptionalText(input.laneId),
    provider:
      input.provider === undefined ? current.provider : normalizeOptionalText(input.provider),
    ...(nextInstance !== undefined ? { instance: nextInstance } : {}),
    model:
      input.model === undefined ? current.model : normalizeOptionalText(input.model),
    ...(nextModelSelection !== undefined ? { modelSelection: nextModelSelection } : {}),
    startedAt:
      input.startedAt === undefined ? current.startedAt : input.startedAt,
    lastUsedAt:
      input.lastUsedAt === undefined ? current.lastUsedAt : input.lastUsedAt,
  };
}
