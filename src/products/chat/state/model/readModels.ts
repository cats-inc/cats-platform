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
import { isCompanionCat, withCompanionRole } from '../../../../shared/companionRole.js';
import type { ParticipantSessionStatus } from '../../../../shared/roomRouting.js';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import { resolveChannelCanonicalIdentity } from '../../shared/channelCanonicalIdentity.js';
import { createChannelExportFilename } from '../../shared/channelPaths.js';
import { buildParallelChatMemberLabel } from '../../shared/parallelChats.js';
import {
  isDirectLaneChannel,
  normalizeChannelAssignmentsForRoomMode,
  resolveChannelKind,
  resolveDirectLaneRecipientId,
} from '../../shared/channelTopology.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import {
  resolveChatLifecycleState,
  type ChatLifecycleState,
} from '../../shared/lifecycle.js';
import { createDefaultRoomRoutingState, resolveRoomRoutingState } from '../room-routing/index.js';
import { requireCat, requireChannel } from './shared.js';

export const ORCHESTRATOR_NAME = 'Orchestrator';
export type { ChatLifecycleState } from '../../shared/lifecycle.js';

function activeParticipantCount(channel: ChatChannelState): number {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel, { clone: true }),
    roomRouting.mode,
    roomRouting.defaultRecipientId,
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
    roles: withCompanionRole(
      assignment.roles.length > 0 ? assignment.roles : cat.roles,
      isCompanionCat(cat),
    ),
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
  return resolveLeadParticipantLease(channel)?.status ?? null;
}

/**
 * The lease behind `defaultRecipientLeaseStatus`; server-side presence
 * readers use it so they agree with what the Desktop shows.
 */
export function resolveLeadParticipantLease(
  channel: ChatChannelState,
): ReturnType<typeof resolveParticipantLeaseAttachment> {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const participantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel, { clone: true }),
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  // A DM leads with its cat; any other room with its coordinator.
  const leadId = isDirectLaneChannel(channel)
    ? resolveDirectLaneRecipientId(
      participantAssignments,
      roomRouting.defaultRecipientId,
    )
    : channel.coordinatorParticipantId;
  if (!leadId) return null;
  const assignment = participantAssignments.find(
    (candidate) => candidate.participantId === leadId && candidate.status === 'active',
  );
  return assignment
    ? resolveParticipantLeaseAttachment(channel, assignment.participantId)
    : null;
}

/** The orchestrator is a mechanism, not a cat; it no longer borrows a Boss Cat's name. */
export function resolveOrchestratorDisplayName(_state: ChatState): string {
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
    roomRouting.defaultRecipientId,
  );
  const normalizedCatAssignments = normalizeChannelAssignmentsForRoomMode(
    clonedChannel.catAssignments,
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  clonedChannel.participantAssignments = normalizedParticipantAssignments;
  clonedChannel.catAssignments = normalizedCatAssignments;
  clonedChannel.channelKind = resolveChannelKind({
    channelKind: clonedChannel.channelKind,
    roomMode: roomRouting.mode,
    participants: normalizedParticipantAssignments,
  });
  if (isDirectLaneChannel(clonedChannel)) {
    roomRouting.defaultRecipientId = resolveDirectLaneRecipientId(
      normalizedParticipantAssignments,
      roomRouting.defaultRecipientId,
    );
  }

  const assignedParticipants = normalizedParticipantAssignments.map((assignment) =>
    hydrateChannelParticipant(state, assignment));
  const canonicalIdentity = resolveChannelCanonicalIdentity(state, clonedChannel.id);

  return {
    ...clonedChannel,
    ...canonicalIdentity,
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
  participantKind: 'cat';
  participantId: string;
  participantName: string;
  lifecycleState: ChatLifecycleState;
} | null {
  const channel = buildChannelView(state, channelOrId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const activeParticipants = (channel.assignedParticipants ?? [])
    .filter((participant) => participant.status === 'active');
  // A DM is entered through its cat; any other room through its coordinator, or its first participant.
  const entryParticipantId = isDirectLaneChannel(channel)
    ? roomRouting.defaultRecipientId
    : channel.coordinatorParticipantId ?? activeParticipants[0]?.participantId ?? null;
  const entryParticipant = activeParticipants
    .find((participant) => participant.participantId === entryParticipantId) ?? null;
  return entryParticipant
    ? {
        participantKind: 'cat',
        participantId: entryParticipant.participantId,
        participantName: entryParticipant.name,
        lifecycleState: resolveParticipantLifecycleState(entryParticipant.execution.lease),
      }
    : null;
}

export function toChannelSummary(
  channel: ChatChannelState,
  state?: Pick<ChatState, 'parallelChatGroups'> | null,
): ChatChannelSummary {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const normalizedParticipantAssignments = normalizeChannelAssignmentsForRoomMode(
    resolveChannelParticipantAssignments(channel, { clone: true }),
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  const defaultRecipientId = isDirectLaneChannel(channel)
    ? resolveDirectLaneRecipientId(normalizedParticipantAssignments, roomRouting.defaultRecipientId)
    : roomRouting.defaultRecipientId;
  const defaultRecipientCatId = normalizedParticipantAssignments.some((assignment) =>
    assignment.sourceKind === 'cat' && assignment.participantId === defaultRecipientId)
    ? defaultRecipientId
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
  const canonicalIdentity = resolveChannelCanonicalIdentity(state, channel.id);
  return {
    id: channel.id,
    ...canonicalIdentity,
    title: channel.title,
    topic: channel.topic,
    originSurface: channel.originSurface,
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
    runtimeWorkspaceKind: channel.runtimeWorkspaceKind ?? null,
    runtimeWorkspaceAccess: channel.runtimeWorkspaceAccess ?? null,
    runtimePermissionMode: channel.runtimePermissionMode ?? null,
    lastMessageAt: channel.lastMessageAt,
    lastActivatedAt: channel.lastActivatedAt,
    defaultRecipientCatId: defaultRecipientCatId ?? null,
    defaultRecipientLeaseStatus: resolveLeadParticipantLeaseStatus(channel),
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

/** A parallel member answers with its own first participant, seeded from its lane target. */
export function resolveParallelChatMemberTarget(
  state: Pick<ChatState, 'newChatDefaults'>,
  channel: ChatChannelState,
): {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection: ProviderModelSelection | null;
} {
  const lead = resolveChannelParticipantAssignments(channel)
    .find((assignment) => assignment.status === 'active') ?? null;
  const target = lead?.execution.target ?? state.newChatDefaults;
  return {
    provider: target.provider,
    instance: target.instance ?? null,
    model: target.model ?? null,
    modelSelection: structuredClone(
      (lead ? lead.execution.modelSelection : state.newChatDefaults.modelSelection) ?? null,
    ),
  };
}

export function summarizeParallelChatGroups(
  state: ChatState,
  channelId?: string,
): ParallelChatGroupSummary[] {
  return state.parallelChatGroups
    .filter((group) => !channelId || group.memberChannelIds.includes(channelId))
    .map((group) => {
      const members = group.memberChannelIds
        .map((channelId) => requireChannel(state, channelId))
        .map((channel, index) => ({
          channelId: channel.id,
          title: channel.title,
          index,
          ...resolveParallelChatMemberTarget(state, channel),
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
        originSurface: group.originSurface,
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
    channels: state.channels.map((channel) => toChannelSummary(channel, state)),
    parallelChatGroups: summarizeParallelChatGroups(state),
    selectedChannel: selectedChannelState ? buildChannelView(state, selectedChannelState) : null,
    globalOrchestrator: structuredClone(state.globalOrchestrator),
  };
}
