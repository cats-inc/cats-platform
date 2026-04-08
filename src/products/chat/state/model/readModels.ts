import type {
  ChannelParticipantAssignment,
  ChannelCatAssignment,
  ChannelExportPayload,
  ChatCat,
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelState,
  ChatChannelSummary,
  ChatChannelView,
  ChatState,
  ParallelChatGroupSummary,
  GlobalOrchestratorSummary,
  ParticipantExecutionLease,
} from '../../api/contracts.js';
import type { ParticipantSessionStatus } from '../../../../shared/roomRouting.js';
import { createChannelExportFilename } from '../../shared/channelPaths.js';
import { buildParallelChatMemberLabel } from '../../shared/parallelChats.js';
import {
  isDirectLaneChannel,
  normalizeChannelAssignmentsForRoomMode,
  resolveChannelKind,
  resolveDirectLaneLeadParticipantId,
} from '../../shared/channelTopology.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import {
  resolveChatLifecycleState,
  type ChatLifecycleState,
} from '../../shared/lifecycle.js';
import { createDefaultRoomRoutingState, resolveRoomRoutingState } from '../room-routing/index.js';
import { createEmptyExecutionLease } from '../defaults.js';
import { requireCat, requireChannel } from './shared.js';

export const ORCHESTRATOR_NAME = 'Orchestrator';
export type { ChatLifecycleState } from '../../shared/lifecycle.js';

function activeParticipantCount(channel: ChatChannelState): number {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel, { clone: true }),
    roomRouting.mode,
    roomRouting.leadParticipantId,
  ).filter((assignment) => assignment.status === 'active').length;
}

function hydrateChannelCat(
  cat: ChatCat,
  assignment: ChannelCatAssignment,
): ChatChannelCat {
  return {
    participantId: assignment.participantId,
    sourceKind: 'cat',
    sourceRefId: assignment.sourceRefId,
    catId: cat.id,
    name: cat.name,
    roles: assignment.roles.length > 0 ? structuredClone(assignment.roles) : structuredClone(cat.roles),
    roleHint: assignment.roleHint,
    skillProfile: cat.skillProfile,
    mcpProfile: cat.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: cat.avatarColor,
    avatarUrl: cat.avatarUrl,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(cat.memory),
  };
}

function hydrateChannelParticipant(
  state: ChatState,
  assignment: ChannelParticipantAssignment,
): ChatChannelParticipant {
  if (assignment.sourceKind === 'cat' && assignment.sourceRefId) {
    const cat = state.cats.find((candidate) => candidate.id === assignment.sourceRefId) ?? null;
    if (cat) {
      return hydrateChannelCat(cat, {
        participantId: assignment.participantId,
        sourceKind: 'cat',
        sourceRefId: assignment.sourceRefId,
        catId: cat.id,
        name: cat.name,
        status: assignment.status,
        roles: structuredClone(assignment.roles),
        roleHint: assignment.roleHint,
        joinedAt: assignment.joinedAt,
        leftAt: assignment.leftAt,
        execution: structuredClone(assignment.execution),
      });
    }
  }

  return {
    participantId: assignment.participantId,
    sourceKind: assignment.sourceKind,
    sourceRefId: assignment.sourceRefId,
    name: assignment.name,
    roles: structuredClone(assignment.roles),
    roleHint: assignment.roleHint,
    skillProfile: null,
    mcpProfile: null,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: null,
    avatarUrl: null,
    execution: structuredClone(assignment.execution),
    memory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
  };
}

function resolveLeadParticipantLeaseStatus(
  channel: ChatChannelState,
): ParticipantSessionStatus | null {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const participantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel, { clone: true }),
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  const leadId = isDirectLaneChannel(channel)
    ? resolveDirectLaneLeadParticipantId(
      participantAssignments,
      roomRouting.leadParticipantId,
    )
    : roomRouting.leadParticipantId;
  if (!leadId) return null;
  const assignment = participantAssignments.find(
    (candidate) => candidate.participantId === leadId && candidate.status === 'active',
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
  const roomRouting = resolveRoomRoutingState(clonedChannel.roomRouting);
  const normalizedParticipantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(clonedChannel, { clone: true }),
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  const normalizedCatAssignments = normalizeChannelAssignmentsForRoomMode(
    clonedChannel.catAssignments,
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  clonedChannel.participantAssignments = normalizedParticipantAssignments;
  clonedChannel.catAssignments = normalizedCatAssignments;
  clonedChannel.channelKind = resolveChannelKind({
    channelKind: clonedChannel.channelKind,
    roomMode: roomRouting.mode,
    participants: normalizedParticipantAssignments,
  });
  if (isDirectLaneChannel(clonedChannel)) {
    roomRouting.leadParticipantId = resolveDirectLaneLeadParticipantId(
      normalizedParticipantAssignments,
      roomRouting.leadParticipantId,
    );
    clonedChannel.orchestratorLease = createEmptyExecutionLease();
  }

  const assignedParticipants = normalizedParticipantAssignments.map((assignment) =>
    hydrateChannelParticipant(state, assignment));

  return {
    ...clonedChannel,
    roomRouting: roomRouting ?? createDefaultRoomRoutingState(),
    assignedParticipants,
    assignedCats: assignedParticipants
      .filter((participant): participant is ChatChannelCat =>
        participant.sourceKind === 'cat'
        && Boolean(participant.sourceRefId)
        && state.cats.some((candidate) => candidate.id === participant.sourceRefId),
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

  if (isDirectLaneChannel(channel) && roomRouting.leadParticipantId) {
    const leadParticipant = (
      channel.assignedParticipants
      ?? channel.assignedCats
    )?.find((participant) => participant.participantId === roomRouting.leadParticipantId) ?? null;
    if (leadParticipant) {
      return {
        participantKind: 'cat',
        participantId: leadParticipant.participantId,
        participantName: leadParticipant.name,
        lifecycleState: resolveParticipantLifecycleState(leadParticipant.execution.lease),
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
  const normalizedParticipantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel, { clone: true }),
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  const leadParticipantId = isDirectLaneChannel(channel)
    ? resolveDirectLaneLeadParticipantId(normalizedParticipantAssignments, roomRouting.leadParticipantId)
    : roomRouting.leadParticipantId;
  const leadCatId = normalizedParticipantAssignments.some((assignment) =>
    assignment.sourceKind === 'cat' && assignment.participantId === leadParticipantId)
    ? leadParticipantId
    : null;
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
    channelKind: resolveChannelKind({
      channelKind: channel.channelKind,
      roomMode: roomRouting.mode,
      participants: normalizedParticipantAssignments,
    }),
    status: channel.status,
    unreadCount: channel.unreadCount,
    catCount: normalizedParticipantAssignments.length,
    activeCatCount: activeParticipantCount(channel),
    participantCount: normalizedParticipantAssignments.length,
    activeParticipantCount: activeParticipantCount(channel),
    repoPath: channel.repoPath,
    chatCwd: channel.chatCwd,
    lastMessageAt: channel.lastMessageAt,
    lastActivatedAt: channel.lastActivatedAt,
    composerMode: channel.composerMode ?? 'solo',
    pendingProvider: channel.pendingProvider ?? null,
    pendingModel: channel.pendingModel ?? null,
    pendingModelSelection: structuredClone(channel.pendingModelSelection ?? null),
    leadCatId: leadCatId ?? null,
    leadParticipantLeaseStatus: resolveLeadParticipantLeaseStatus(channel),
    roomMode: roomRouting.mode,
    routingStatus: routingStatus ?? roomRouting.lastOutcome?.status ?? 'idle',
    lastRoutingAt:
      lastWorkflowAt
      ?? roomRouting.lastOutcome?.completedAt
      ?? roomRouting.lastCheckpoint?.createdAt
      ?? null,
    orchestratorRoles: channel.orchestratorRoles ?? [],
  };
}

export function exportChannel(state: ChatState, channelId: string): ChannelExportPayload {
  const channel = requireChannel(state, channelId);
  const view = buildChannelView(state, channel);

  return {
    exportedAt: new Date().toISOString(),
    orchestrator: structuredClone(state.globalOrchestrator),
    channel: structuredClone(channel),
    assignedParticipants: view.assignedParticipants,
    assignedCats: view.assignedCats,
  };
}

export function buildChannelExportFilename(state: ChatState, channelId: string): string {
  const channel = requireChannel(state, channelId);
  return createChannelExportFilename(channel.title, channel.id);
}

function summarizeParallelChatGroups(state: ChatState): ParallelChatGroupSummary[] {
  return state.parallelChatGroups
    .map((group) => {
      const members = group.memberChannelIds
        .map((channelId) => requireChannel(state, channelId))
        .map((channel, index) => ({
          channelId: channel.id,
          title: channel.title,
          index,
          provider: channel.pendingProvider ?? state.globalOrchestrator.executionTarget.provider,
          instance:
            channel.pendingInstance
            ?? state.globalOrchestrator.executionTarget.instance
            ?? null,
          model:
            channel.pendingModel
            ?? state.globalOrchestrator.executionTarget.model
            ?? null,
          modelSelection:
            structuredClone(channel.pendingModelSelection)
            ?? structuredClone(state.globalOrchestrator.executionModelSelection)
            ?? null,
          lastMessageAt: channel.lastMessageAt,
        }));

      const lastMessageAt = members.reduce<string | null>((latest, member) => {
        if (!member.lastMessageAt) {
          return latest;
        }
        if (!latest || member.lastMessageAt > latest) {
          return member.lastMessageAt;
        }
        return latest;
      }, group.lastMessageAt);

      return {
        id: group.id,
        title: group.title,
        mode: group.mode,
        status: group.status,
        memberCount: members.length,
        memberChannelIds: structuredClone(group.memberChannelIds),
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        lastMessageAt,
        members: members.map((member) => ({
          ...member,
          title: buildParallelChatMemberLabel(member),
        })),
      };
    })
    .filter((group) => group.members.length > 1);
}

export function summarizeState(state: ChatState): {
  cats: ChatCat[];
  channels: ChatChannelSummary[];
  parallelChatGroups: ParallelChatGroupSummary[];
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
} {
  const selectedChannelState =
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;

  return {
    cats: structuredClone(state.cats),
    channels: state.channels.map((channel) => toChannelSummary(channel)),
    parallelChatGroups: summarizeParallelChatGroups(state),
    selectedChannel: selectedChannelState ? buildChannelView(state, selectedChannelState) : null,
    globalOrchestrator: structuredClone(state.globalOrchestrator),
  };
}
