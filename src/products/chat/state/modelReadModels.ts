import type {
  ChannelCatAssignment,
  ChannelExportPayload,
  ChatCat,
  ChatChannelCat,
  ChatChannelState,
  ChatChannelSummary,
  ChatChannelView,
  ChatState,
  GlobalOrchestratorSummary,
  ParticipantExecutionLease,
} from '../api/contracts.js';
import type { ParticipantSessionStatus } from '../../../shared/roomRouting.js';
import { createChannelExportFilename } from '../shared/channelPaths.js';
import {
  resolveChatLifecycleState,
  type ChatLifecycleState,
} from '../shared/lifecycle.js';
import { createDefaultRoomRoutingState, resolveRoomRoutingState } from './roomRouting.js';
import { requireCat, requireChannel } from './modelShared.js';

export const ORCHESTRATOR_NAME = 'Orchestrator';
export type { ChatLifecycleState } from '../shared/lifecycle.js';

function activeCatCount(channel: ChatChannelState): number {
  return channel.catAssignments.filter((assignment) => assignment.status === 'active').length;
}

function hydrateChannelCat(
  cat: ChatCat,
  assignment: ChannelCatAssignment,
): ChatChannelCat {
  return {
    catId: cat.id,
    name: cat.name,
    roles: assignment.roles.length > 0 ? structuredClone(assignment.roles) : structuredClone(cat.roles),
    skillProfile: cat.skillProfile,
    mcpProfile: cat.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: cat.avatarColor,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(cat.memory),
  };
}

function resolveLeadParticipantLeaseStatus(
  channel: ChatChannelState,
): ParticipantSessionStatus | null {
  const leadId = channel.roomRouting?.leadParticipantId;
  if (!leadId) return null;
  const assignment = channel.catAssignments.find(
    (candidate) => candidate.catId === leadId && candidate.status === 'active',
  );
  return assignment?.execution.lease.status ?? null;
}

export function resolveOrchestratorDisplayName(state: ChatState): string {
  if (state.bossCatId) {
    const cat = state.cats.find((candidate) => candidate.id === state.bossCatId);
    if (cat) return cat.name;
  }
  return ORCHESTRATOR_NAME;
}

export function resolveParticipantLifecycleState(
  lease: ParticipantExecutionLease,
): ChatLifecycleState {
  return resolveChatLifecycleState(lease.status);
}

export function buildChannelView(
  state: ChatState,
  channelOrId: ChatChannelState | string,
): ChatChannelView {
  const channel =
    typeof channelOrId === 'string' ? requireChannel(state, channelOrId) : channelOrId;
  const clonedChannel = structuredClone(channel);

  return {
    ...clonedChannel,
    roomRouting: clonedChannel.roomRouting ?? createDefaultRoomRoutingState(),
    assignedCats: channel.catAssignments
      .filter((assignment) => state.cats.some((candidate) => candidate.id === assignment.catId))
      .map((assignment) =>
        hydrateChannelCat(requireCat(state, assignment.catId), assignment),
      ),
  };
}

export function resolveChannelEntryParticipant(
  state: ChatState,
  channelOrId: ChatChannelState | string,
): {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
  lifecycleState: ChatLifecycleState;
} {
  const channel = buildChannelView(state, channelOrId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);

  if (roomRouting.mode === 'direct_cat_chat' && roomRouting.leadParticipantId) {
    const leadCat = channel.assignedCats.find(
      (cat) => cat.status === 'active' && cat.catId === roomRouting.leadParticipantId,
    );
    if (leadCat) {
      return {
        participantKind: 'cat',
        participantId: leadCat.catId,
        participantName: leadCat.name,
        lifecycleState: resolveParticipantLifecycleState(leadCat.execution.lease),
      };
    }
  }

  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: resolveOrchestratorDisplayName(state),
    lifecycleState: resolveParticipantLifecycleState(channel.orchestratorLease),
  };
}

export function toChannelSummary(channel: ChatChannelState): ChatChannelSummary {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflowStatus = roomRouting.workflow.activeTurn?.status
    ?? roomRouting.workflow.lastOutcomeEvent?.status
    ?? null;
  const lastWorkflowAt = roomRouting.workflow.activeTurn?.updatedAt
    ?? roomRouting.workflow.lastOutcomeEvent?.createdAt
    ?? null;
  const routingStatus = workflowStatus === 'pending'
    ? 'running'
    : workflowStatus === 'failed'
      ? 'error'
      : workflowStatus;
  return {
    id: channel.id,
    title: channel.title,
    topic: channel.topic,
    status: channel.status,
    unreadCount: channel.unreadCount,
    catCount: channel.catAssignments.length,
    activeCatCount: activeCatCount(channel),
    repoPath: channel.repoPath,
    chatCwd: channel.chatCwd,
    lastMessageAt: channel.lastMessageAt,
    lastActivatedAt: channel.lastActivatedAt,
    composerMode: channel.composerMode ?? 'solo',
    pendingProvider: channel.pendingProvider ?? null,
    pendingModel: channel.pendingModel ?? null,
    leadCatId: channel.roomRouting?.leadParticipantId ?? null,
    leadParticipantLeaseStatus: resolveLeadParticipantLeaseStatus(channel),
    roomMode: roomRouting.mode,
    routingStatus: routingStatus ?? roomRouting.lastOutcome?.status ?? 'idle',
    lastRoutingAt:
      lastWorkflowAt
      ?? roomRouting.lastOutcome?.completedAt
      ?? roomRouting.lastCheckpoint?.createdAt
      ?? null,
  };
}

export function exportChannel(state: ChatState, channelId: string): ChannelExportPayload {
  const channel = requireChannel(state, channelId);

  return {
    exportedAt: new Date().toISOString(),
    orchestrator: structuredClone(state.globalOrchestrator),
    channel: structuredClone(channel),
    assignedCats: buildChannelView(state, channel).assignedCats,
  };
}

export function buildChannelExportFilename(state: ChatState, channelId: string): string {
  const channel = requireChannel(state, channelId);
  return createChannelExportFilename(channel.title, channel.id);
}

export function summarizeState(state: ChatState): {
  cats: ChatCat[];
  channels: ChatChannelSummary[];
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
} {
  const selectedChannelState =
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;

  return {
    cats: structuredClone(state.cats),
    channels: state.channels.map((channel) => toChannelSummary(channel)),
    selectedChannel: selectedChannelState ? buildChannelView(state, selectedChannelState) : null,
    globalOrchestrator: structuredClone(state.globalOrchestrator),
  };
}
