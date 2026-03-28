import { randomUUID } from 'node:crypto';

import type {
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
  activeCatIds: string[];
}): 'solo' | 'cat_led' {
  if (input.roomMode === 'direct_cat_chat') {
    return 'cat_led';
  }
  return input.activeCatIds.length > 0 ? 'cat_led' : 'solo';
}

export function syncChannelLeadAndComposerMode(channel: ChatChannelState): void {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  channel.catAssignments = normalizeChannelAssignmentsForRoomMode(
    channel.catAssignments,
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  channel.channelKind = resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: roomRouting.mode,
    participants: channel.catAssignments,
  });
  const activeCatIds = channel.catAssignments
    .filter((assignment) => assignment.status === 'active')
    .map((assignment) => assignment.catId);
  const currentLeadId = roomRouting.leadParticipantId;
  const hasValidLead = Boolean(currentLeadId && activeCatIds.includes(currentLeadId));

  channel.composerMode = inferChannelComposerMode({
    roomMode: roomRouting.mode,
    activeCatIds,
  });

  if (roomRouting.mode === 'direct_cat_chat') {
    roomRouting.leadParticipantId = resolveDirectLaneLeadParticipantId(
      channel.catAssignments,
      currentLeadId,
    );
    channel.orchestratorLease = createEmptyExecutionLease();
  } else if (activeCatIds.length === 0) {
    roomRouting.leadParticipantId = null;
  } else if (!hasValidLead) {
    roomRouting.leadParticipantId = activeCatIds[0] ?? null;
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
